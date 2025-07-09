import type { TokenMeta } from "@/lib/coins";
import { useMemo } from "react";
import type { IncentiveStream } from "./use-incentive-streams";
import { useZChefRewardPerSharePerYear } from "./use-zchef-contract";
import { usePoolApy } from "./use-pool-apy";
import { useReadContract } from "wagmi";
import { ZChefAbi, ZChefAddress } from "@/constants/zChef";
import { mainnet } from "viem/chains";
import { SWAP_FEE } from "@/lib/swap";
import { useGetTVL } from "./use-get-tvl";
import { useCoinPrice } from "./use-coin-price";
import { parseEther } from "viem";

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
    tradingFees: number;
    rewardSymbol: string;
  };
  isLoading: boolean;
  error?: Error | null;
}

const SECONDS_IN_YEAR = 365n * 24n * 60n * 60n;
const ACC_PRECISION = 1_000_000_000_000n; // 1e12
const EIGHTEEN_DECIMALS = 1_000_000_000_000_000_000n; // 1e18 (ZAMM & ETH)

/**
 * Hook to calculate combined APY (base trading fees + farm incentives)
 * for incentivized liquidity pools
 */
export function useCombinedApy({
  stream,
  lpToken,
  enabled = true,
}: UseCombinedApyParams): CombinedApyData {
  // Fetch base APY from trading fees
  const { data: baseApyData, isLoading: isBaseApyLoading } = usePoolApy(
    lpToken?.poolId?.toString(),
  );

  const { data: farmInfo, isLoading: isFarmInfoLoading } = useReadContract({
    address: ZChefAddress,
    abi: ZChefAbi,
    functionName: "pools",
    args: [stream.chefId],
    chainId: mainnet.id,
  });

  const { data: poolTvlInEth } = useGetTVL({
    poolId: lpToken?.poolId ? BigInt(lpToken?.poolId) : undefined,
    source: lpToken?.source,
  });

  const { data: rewardPriceEth } = useCoinPrice({
    coinId: farmInfo?.[3],
    coinContract: farmInfo?.[2],
  });

  // Fetch farm incentive APY
  const { data: rewardPerSharePerYearOnchain, isLoading: isFarmApyLoading } =
    useZChefRewardPerSharePerYear(enabled ? stream.chefId : undefined);

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

    // 2. stream still running but no one staked yet
    const now = BigInt(Math.floor(Date.now() / 1_000)); // current unix ts
    const streamActive = stream.status === "ACTIVE" && now < stream.endTime;
    const rewardRate = stream.rewardRate ?? farmInfo?.[4];
    const totalShares =
      farmInfo?.[7] === 0n
        ? parseEther("1")
        : (stream?.totalShares ?? farmInfo?.[7]);

    if (streamActive && totalShares !== 0n) {
      return (BigInt(rewardRate) * SECONDS_IN_YEAR) / BigInt(totalShares); // still ×1e12
    }

    // 3. ended or not enabled → 0
    return 0n;
  }, [rewardPerSharePerYearOnchain, farmInfo, stream.status, stream.endTime]);

  // Calculate combined APY
  const combinedApy = useMemo(() => {
    const isLoading = isBaseApyLoading || isFarmApyLoading || isFarmInfoLoading;

    // Default fallback values
    const defaultResult: CombinedApyData = {
      baseApy: 0,
      farmApy: 0,
      totalApy: 0,
      breakdown: {
        tradingFees: Number(lpToken.swapFee || 100n),
        rewardSymbol: stream.rewardCoin?.symbol || "???",
      },
      isLoading,
    };

    if (isLoading || !poolTvlInEth || !rewardPriceEth) {
      return defaultResult;
    }

    // Calculate base APY from trading fees
    const baseApy = Number(baseApyData?.slice(0, -1)) || 0;
    const totalShares =
      farmInfo?.[7] === 0n
        ? parseEther("1")
        : (stream?.totalShares ?? farmInfo?.[7]);

    // Calculate farm APY from incentives
    const share = 1000000000000000000n; // 1 LP share
    const rewardPerSharePerYearWei = rewardPerSharePerYear / ACC_PRECISION;
    const tokensPerSharePerYear =
      Number(rewardPerSharePerYearWei) / Number(EIGHTEEN_DECIMALS);
    const yearlyReward = tokensPerSharePerYear * Number(share);
    const yearlyRewardEthValue = yearlyReward * rewardPriceEth;
    const stakeEth = (Number(share) / Number(totalShares)) * poolTvlInEth;
    
    // Prevent division by zero
    const aprPct = stakeEth > 0 ? (yearlyRewardEthValue / stakeEth) * 100 : 0;

    const totalApy = baseApy + aprPct;

    return {
      baseApy,
      farmApy: aprPct,
      totalApy,
      breakdown: {
        tradingFees: Number(lpToken.swapFee || SWAP_FEE),
        rewardSymbol: stream.rewardCoin?.symbol || "???",
      },
      isLoading: false,
    };
  }, [
    baseApyData,
    rewardPerSharePerYear,
    isBaseApyLoading,
    isFarmApyLoading,
    lpToken,
    stream.rewardCoin,
    poolTvlInEth,
    rewardPriceEth,
  ]);

  return combinedApy;
}
