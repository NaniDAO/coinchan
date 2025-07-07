import { useMemo } from "react";
import { formatUnits } from "viem";
import { IncentiveStream } from "./use-incentive-streams";
import { TokenMeta } from "@/lib/coins";
import { useZChefRewardPerSharePerYear } from "./use-zchef-contract";
import { useBaseApy } from "./use-base-apy";

interface UseCombinedApyParams {
  stream: IncentiveStream;
  lpToken: TokenMeta;
  enabled?: boolean;
}

export interface CombinedApyData {
  baseApy: number;
  farmApy: number;
  totalApy: number;
  breakdown: {
    tradingFees: {
      apy: number;
      dailyVolume: number;
      poolTvl: number;
      swapFee: number;
    };
    farmIncentives: {
      apy: number;
      rewardPerShare: string;
      rewardSymbol: string;
    };
  };
  isLoading: boolean;
  error?: Error | null;
}

/**
 * Hook to calculate combined APY (base trading fees + farm incentives)
 * for incentivized liquidity pools
 */
export function useCombinedApy({ stream, lpToken, enabled = true }: UseCombinedApyParams): CombinedApyData {
  // Fetch base APY from trading fees
  const { baseApyData, isLoading: isBaseApyLoading } = useBaseApy({
    lpToken,
    timeframe: "24h",
    enabled,
  });

  // Fetch farm incentive APY
  const { data: rewardPerSharePerYear, isLoading: isFarmApyLoading } = useZChefRewardPerSharePerYear(
    enabled ? stream.chefId : undefined
  );

  // Calculate combined APY
  const combinedApy = useMemo(() => {
    const isLoading = isBaseApyLoading || isFarmApyLoading;

    // Default fallback values
    const defaultResult: CombinedApyData = {
      baseApy: 0,
      farmApy: 0,
      totalApy: 0,
      breakdown: {
        tradingFees: {
          apy: 0,
          dailyVolume: 0,
          poolTvl: 0,
          swapFee: Number(lpToken.swapFee || 100n),
        },
        farmIncentives: {
          apy: 0,
          rewardPerShare: "0",
          rewardSymbol: stream.rewardCoin?.symbol || "???",
        },
      },
      isLoading,
    };

    if (isLoading) {
      return defaultResult;
    }

    // Calculate base APY from trading fees
    const baseApy = baseApyData?.baseApy || 0;

    // Calculate farm APY from incentive rewards
    let farmApy = 0;
    let rewardPerShare = "0";
    
    if (rewardPerSharePerYear && rewardPerSharePerYear > 0n) {
      // rewardPerSharePerYear is scaled by 1e12 (ACC_PRECISION)
      rewardPerShare = formatUnits(rewardPerSharePerYear, 12);
      // Convert to percentage APY
      farmApy = parseFloat(rewardPerShare) * 100;
    }

    const totalApy = baseApy + farmApy;

    return {
      baseApy,
      farmApy,
      totalApy,
      breakdown: {
        tradingFees: {
          apy: baseApy,
          dailyVolume: baseApyData?.dailyVolume || 0,
          poolTvl: baseApyData?.poolTvl || 0,
          swapFee: baseApyData?.swapFee || Number(lpToken.swapFee || 100n),
        },
        farmIncentives: {
          apy: farmApy,
          rewardPerShare,
          rewardSymbol: stream.rewardCoin?.symbol || "???",
        },
      },
      isLoading: false,
    };
  }, [
    baseApyData,
    rewardPerSharePerYear,
    isBaseApyLoading,
    isFarmApyLoading,
    lpToken.swapFee,
    stream.rewardCoin?.symbol,
  ]);

  return combinedApy;
}