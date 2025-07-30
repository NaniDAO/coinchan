import type { CoinSource, TokenMeta } from "@/lib/coins";
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

interface UseCombinedAprParams {
  stream?: IncentiveStream;
  lpToken?: TokenMeta;
  enabled?: boolean;
}

export interface CombinedAprData {
  baseApr: number;
  farmApr: number;
  totalApr: number;
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
 * Hook to calculate combined APR (base trading fees + farm incentives)
 * for incentivized liquidity pools
 */
export function useCombinedApr({ stream, lpToken, enabled = true }: UseCombinedAprParams): CombinedAprData {
  // Fetch base APR from trading fees
  const { data: baseAprData, isLoading: isBaseAprLoading } = usePoolApy(lpToken?.poolId?.toString());

  const { data: farmInfo, isLoading: isFarmInfoLoading } = useReadContract({
    address: ZChefAddress,
    abi: ZChefAbi,
    functionName: "pools",
    args: stream?.chefId ? [stream.chefId] : undefined,
    chainId: mainnet.id,
  });

  const { data: poolTvlInEth } = useGetTVL({
    poolId: lpToken?.poolId ? BigInt(lpToken?.poolId) : undefined,
    source: lpToken?.source as CoinSource,
  });

  const { data: rewardPriceEth } = useCoinPrice({
    coinId: farmInfo?.[3],
    coinContract: farmInfo?.[2],
    contractSource: undefined,
  });

  // Fetch farm incentive APR
  const { data: rewardPerSharePerYearOnchain, isLoading: isFarmAprLoading } = useZChefRewardPerSharePerYear(
    enabled ? stream?.chefId : undefined,
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

    // 2. stream still running but no one staked yet
    const now = BigInt(Math.floor(Date.now() / 1_000)); // current unix ts
    const streamActive = stream?.status === "ACTIVE" && now < stream?.endTime;
    const rewardRate = stream?.rewardRate ?? farmInfo?.[4];
    const totalShares =
      stream?.totalShares && stream?.totalShares > 0n
        ? stream?.totalShares
        : farmInfo?.[7] === 0n || !farmInfo?.[7]
          ? parseEther("1")
          : farmInfo?.[7];

    if (!rewardRate || !totalShares) return 0n;

    // Ensure totalShares is never 0 before division
    const safeTotalShares = totalShares && totalShares > 0n ? totalShares : parseEther("1");

    if (streamActive && safeTotalShares !== 0n) {
      return (BigInt(rewardRate) * SECONDS_IN_YEAR) / BigInt(safeTotalShares); // still ×1e12
    }

    // 3. ended or not enabled → 0
    return 0n;
  }, [rewardPerSharePerYearOnchain, farmInfo, stream?.status, stream?.endTime, stream?.totalShares]);

  // Calculate combined APR
  const combinedApr = useMemo(() => {
    const isLoading = isBaseAprLoading || isFarmAprLoading || isFarmInfoLoading;

    // Default fallback values
    const defaultResult: CombinedAprData = {
      baseApr: 0,
      farmApr: 0,
      totalApr: 0,
      breakdown: {
        tradingFees: Number(lpToken?.swapFee || 100n),
        rewardSymbol: stream?.rewardCoin?.symbol || "???",
      },
      isLoading,
    };

    try {
      if (isLoading || !poolTvlInEth || !rewardPriceEth || poolTvlInEth === 0 || rewardPriceEth === 0) {
        return defaultResult;
      }

      // Calculate base APR from trading fees
      const baseApr = Number(baseAprData?.slice(0, -1)) || 0;
      const totalShares =
        stream?.totalShares && stream?.totalShares > 0n
          ? stream?.totalShares
          : farmInfo?.[7] === 0n || !farmInfo?.[7]
            ? parseEther("1")
            : farmInfo?.[7];

      // Calculate farm APR from incentives
      const share = 1000000000000000000n; // 1 LP share

      // Ensure totalShares has a valid value
      const safeTotalShares = totalShares && totalShares > 0n ? totalShares : parseEther("1");

      // Ensure all numbers are valid before calculations
      const shareNum = Number(share);
      const totalSharesNum = Number(safeTotalShares);
      const eighteenDecimalsNum = Number(EIGHTEEN_DECIMALS);

      // Prevent any potential division by zero
      if (!shareNum || !totalSharesNum || !eighteenDecimalsNum || totalSharesNum === 0) {
        return {
          baseApr,
          farmApr: 0,
          totalApr: baseApr,
          breakdown: {
            tradingFees: Number(lpToken?.swapFee || SWAP_FEE),
            rewardSymbol: stream?.rewardCoin?.symbol || "???",
          },
          isLoading: false,
        };
      }

      const rewardPerSharePerYearWei = rewardPerSharePerYear / ACC_PRECISION;
      const tokensPerSharePerYear = Number(rewardPerSharePerYearWei) / eighteenDecimalsNum;
      const yearlyReward = tokensPerSharePerYear * shareNum;
      const yearlyRewardEthValue = yearlyReward * rewardPriceEth;
      const stakeEth = (shareNum / totalSharesNum) * poolTvlInEth;

      // Prevent division by zero and ensure all values are valid numbers
      let aprPct = 0;
      if (stakeEth > 0 && !isNaN(yearlyRewardEthValue) && !isNaN(stakeEth) && isFinite(stakeEth)) {
        aprPct = (yearlyRewardEthValue / stakeEth) * 100;
        if (isNaN(aprPct) || !isFinite(aprPct)) {
          aprPct = 0;
        }
      }

      const totalApr = baseApr + aprPct;

      return {
        baseApr,
        farmApr: aprPct,
        totalApr,
        breakdown: {
          tradingFees: Number(lpToken?.swapFee || SWAP_FEE),
          rewardSymbol: stream?.rewardCoin?.symbol || "???",
        },
        isLoading: false,
      };
    } catch (error) {
      console.error("Error calculating combined APR:", error);
      return defaultResult;
    }
  }, [
    baseAprData,
    rewardPerSharePerYear,
    isBaseAprLoading,
    isFarmAprLoading,
    lpToken,
    stream?.rewardCoin,
    stream?.totalShares,
    poolTvlInEth,
    rewardPriceEth,
    farmInfo,
  ]);

  return combinedApr;
}
