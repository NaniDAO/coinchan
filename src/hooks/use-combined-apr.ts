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
import { parseEther, formatEther } from "viem";
import { useReserves } from "./use-reserves";

// Hardcoded ZAMM pool ID for price calculations (ETH/ZAMM pool on original ZAMM AMM)
const ZAMM_POOL_ID =
  22979666169544372205220120853398704213623237650449182409187385558845249460832n;

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
export function useCombinedApr({
  stream,
  lpToken,
  enabled = true,
}: UseCombinedAprParams): CombinedAprData {
  // Fetch base APR from trading fees
  const { data: baseAprData, isLoading: isBaseAprLoading } = usePoolApy(
    lpToken?.poolId?.toString(),
    lpToken?.source,
  );

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

  // Check if reward token is veZAMM (ID 87) - treat as 1:1 with ZAMM
  const isVeZAMM = farmInfo?.[3] === 87n || stream?.rewardId === 87n;

  // Get ZAMM reserves if reward token is veZAMM (for 1:1 pricing)
  const { data: zammReserves } = useReserves({
    poolId: isVeZAMM ? ZAMM_POOL_ID : undefined,
    source: "ZAMM",
  });

  // Calculate ZAMM price from reserves
  const zammPriceEth = useMemo(() => {
    if (!isVeZAMM || !zammReserves) return undefined;
    const reserve0 = zammReserves.reserve0;
    const reserve1 = zammReserves.reserve1;
    if (!reserve0 || !reserve1 || reserve1 === 0n) return 0;
    // Price = ETH reserves / ZAMM reserves
    return Number(formatEther(reserve0)) / Number(formatEther(reserve1));
  }, [isVeZAMM, zammReserves]);

  // Check if the reward token is the same as the LP pool's token (cookbook coin)
  // For cookbook coins, the lpToken.id is the poolId, but stream.rewardId is the coinId
  // We need to check if the stream's reward coin matches the pool's coin
  const isCookbookCoin =
    lpToken?.source === "COOKBOOK" && stream?.rewardId !== undefined;

  // Get pool reserves for price calculation if it's a cookbook coin
  const { data: poolReserves } = useReserves({
    poolId:
      isCookbookCoin && lpToken?.poolId ? BigInt(lpToken.poolId) : undefined,
    source: "COOKBOOK",
  });

  // Calculate cookbook coin price from pool reserves
  const cookbookCoinPriceEth = useMemo(() => {
    if (!isCookbookCoin || !poolReserves) return undefined;
    const ethReserve = poolReserves.reserve0; // ETH is always token0
    const coinReserve = poolReserves.reserve1; // Coin is always token1
    if (!ethReserve || !coinReserve || coinReserve === 0n) return 0;
    // Price = ETH reserves / Coin reserves
    return Number(formatEther(ethReserve)) / Number(formatEther(coinReserve));
  }, [isCookbookCoin, poolReserves]);

  // Get normal reward token price for non-veZAMM and non-cookbook tokens
  const { data: normalRewardPriceEth } = useCoinPrice({
    coinId: !isVeZAMM && !isCookbookCoin ? farmInfo?.[3] : undefined,
    coinContract: !isVeZAMM && !isCookbookCoin ? farmInfo?.[2] : undefined,
    contractSource: undefined,
  });

  // Use appropriate price based on token type
  const rewardPriceEth = isVeZAMM
    ? zammPriceEth
    : isCookbookCoin
      ? cookbookCoinPriceEth
      : normalRewardPriceEth;

  // Fetch farm incentive APR
  const { data: rewardPerSharePerYearOnchain, isLoading: isFarmAprLoading } =
    useZChefRewardPerSharePerYear(enabled ? stream?.chefId : undefined);

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
      if (
        BigInt(stream?.chefId || 0) ===
        4753336069341144815480881976275515062700439895685858969634251725712618967096n
      ) {
        console.log(
          "rewardPerSharePerYearOnchain",
          rewardPerSharePerYearOnchain,
        );
      }
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
    const safeTotalShares =
      totalShares && totalShares > 0n ? totalShares : parseEther("1");

    if (streamActive && safeTotalShares !== 0n) {
      // Include ACC_PRECISION in the calculation since rewardPerSharePerYear needs to be scaled
      const rewardPerSharePerYear =
        (BigInt(rewardRate) * SECONDS_IN_YEAR * ACC_PRECISION) /
        BigInt(safeTotalShares);

      if (
        BigInt(stream?.chefId || 0) ===
        4753336069341144815480881976275515062700439895685858969634251725712618967096n
      ) {
        console.log("rewardPerSharePerYear", {
          rewardRate,
          safeTotalShares,
          rewardPerSharePerYear,
        });
      }

      return rewardPerSharePerYear;
    }

    // 3. ended or not enabled → 0
    return 0n;
  }, [
    rewardPerSharePerYearOnchain,
    farmInfo,
    stream?.status,
    stream?.endTime,
    stream?.totalShares,
    stream?.rewardRate,
  ]);

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
        rewardSymbol: isVeZAMM
          ? "veZAMM (1:1 ZAMM)"
          : stream?.rewardCoin?.symbol || "???",
      },
      isLoading,
    };

    try {
      // Allow very small prices (don't check rewardPriceEth === 0 too strictly)
      if (
        isLoading ||
        !poolTvlInEth ||
        poolTvlInEth === 0 ||
        rewardPriceEth === undefined ||
        rewardPriceEth === null
      ) {
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
      const safeTotalShares =
        totalShares && totalShares > 0n ? totalShares : parseEther("1");

      // Ensure all numbers are valid before calculations
      const shareNum = Number(share);
      const totalSharesNum = Number(safeTotalShares);
      const eighteenDecimalsNum = Number(EIGHTEEN_DECIMALS);

      // Prevent any potential division by zero
      if (
        !shareNum ||
        !totalSharesNum ||
        !eighteenDecimalsNum ||
        totalSharesNum === 0
      ) {
        return {
          baseApr,
          farmApr: 0,
          totalApr: baseApr,
          breakdown: {
            tradingFees: Number(lpToken?.swapFee || SWAP_FEE),
            rewardSymbol: isVeZAMM
              ? "veZAMM (1:1 ZAMM)"
              : stream?.rewardCoin?.symbol || "???",
          },
          isLoading: false,
        };
      }

      const rewardPerSharePerYearWei = rewardPerSharePerYear / ACC_PRECISION;
      const tokensPerSharePerYear =
        Number(rewardPerSharePerYearWei) / eighteenDecimalsNum;
      const yearlyReward = tokensPerSharePerYear * shareNum;

      // Use a default small price if rewardPriceEth is 0 to avoid division issues
      const effectiveRewardPrice = rewardPriceEth || 0;
      const yearlyRewardEthValue = yearlyReward * effectiveRewardPrice;
      const stakeEth = (shareNum / totalSharesNum) * poolTvlInEth;

      // Prevent division by zero and ensure all values are valid numbers
      let aprPct = 0;
      if (
        stakeEth > 0 &&
        !isNaN(yearlyRewardEthValue) &&
        !isNaN(stakeEth) &&
        isFinite(stakeEth)
      ) {
        aprPct = (yearlyRewardEthValue / stakeEth) * 100;
        if (isNaN(aprPct) || !isFinite(aprPct)) {
          aprPct = 0;
        }
      }

      const totalApr = baseApr + aprPct;
      if (
        BigInt(stream?.chefId || 0) ===
        4753336069341144815480881976275515062700439895685858969634251725712618967096n
      ) {
        console.log("TotalAPR", {
          stream,
          lpToken,
          baseApr,
          rewardPerSharePerYear,
          rewardPerSharePerYearWei,
          eighteenDecimalsNum,
          tokensPerSharePerYear,
          yearlyReward,
          effectiveRewardPrice,
          yearlyRewardEthValue,
          stakeEth,
          aprPct,
          totalApr,
        });
      }
      return {
        baseApr,
        farmApr: aprPct,
        totalApr,
        breakdown: {
          tradingFees: Number(lpToken?.swapFee || SWAP_FEE),
          rewardSymbol: isVeZAMM
            ? "veZAMM (1:1 ZAMM)"
            : stream?.rewardCoin?.symbol || "???",
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
    stream?.rewardId,
    poolTvlInEth,
    rewardPriceEth,
    isVeZAMM,
    isCookbookCoin,
    farmInfo,
  ]);

  return combinedApr;
}
