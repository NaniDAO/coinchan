import type { TokenMeta } from "@/lib/coins";
import { useMemo } from "react";
import { formatUnits } from "viem";
import type { IncentiveStream } from "./use-incentive-streams";
import { useZChefRewardPerSharePerYear } from "./use-zchef-contract";
import { usePoolApy } from "./use-pool-apy";

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

const SECONDS_IN_YEAR = 365n * 24n * 60n * 60n;

/**
 * Hook to calculate combined APY (base trading fees + farm incentives)
 * for incentivized liquidity pools
 */
export function useCombinedApy({ stream, lpToken, enabled = true }: UseCombinedApyParams): CombinedApyData {
  // Fetch base APY from trading fees
  const { data: baseApyData, isLoading: isBaseApyLoading } = usePoolApy(lpToken?.poolId?.toString());

  // Fetch farm incentive APY
  const { data: rewardPerSharePerYearOnchain, isLoading: isFarmApyLoading } = useZChefRewardPerSharePerYear(
    enabled ? stream.chefId : undefined,
  );
  /**
   * Reward-per-share-per-year scaled by 1e12.
   * • If the on-chain call already gave a non-zero value, use it.
   * • If the pool is still empty (totalShares == 0) **and** the stream is active,
   *   emulate `rewardPerSharePerYear = rewardRate * 365 days / 1`.
   * • Otherwise return 0.
   */
  const rewardPerSharePerYear = useMemo<bigint>(() => {
    // 1. real value returned → just use it
    if (rewardPerSharePerYearOnchain && rewardPerSharePerYearOnchain > 0n) {
      return rewardPerSharePerYearOnchain;
    }

    // 2. stream still running but no one staked yet → fake “1 share”
    const now = BigInt(Math.floor(Date.now() / 1_000)); // current unix ts
    const streamActive = stream.status === "ACTIVE" && now < stream.endTime;

    if (BigInt(stream.totalShares) === 0n && streamActive) {
      return BigInt(stream.rewardRate) * SECONDS_IN_YEAR; // still ×1e12
    }

    // 3. ended or not enabled → 0
    return 0n;
  }, [rewardPerSharePerYearOnchain, stream.totalShares, stream.rewardRate, stream.status, stream.endTime]);

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
    const baseApy = Number(baseApyData.slice(0, -1)) || 0;

    // Calculate farm APY from incentive rewards
    let farmApy = 0;
    let rewardPerShare = "0";

    if (rewardPerSharePerYear && rewardPerSharePerYear > 0n) {
      // rewardPerSharePerYear is scaled by 1e12 (ACC_PRECISION)
      rewardPerShare = formatUnits(rewardPerSharePerYear, 12);
      // Convert to percentage APY
      farmApy = Number.parseFloat(rewardPerShare) * 100;
    }
    console.log("useCombinedApy:", {
      baseApyData,
      stream,
      lpToken,
      baseApy,
      farmApy,
    });
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

  console.log("useCombinedApy:", {
    stream,
    lpToken,
    baseApyData,
    rewardPerSharePerYear,
  });

  return combinedApy;
}
