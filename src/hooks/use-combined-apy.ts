import type { TokenMeta } from "@/lib/coins";
import { useMemo } from "react";
import { formatUnits, zeroAddress } from "viem";
import type { IncentiveStream } from "./use-incentive-streams";
import { useZChefRewardPerSharePerYear } from "./use-zchef-contract";
import { usePoolApy } from "./use-pool-apy";
import { useETHPrice } from "./use-eth-price";
import { useReserves } from "./use-reserves";

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

  // Fetch ETH price for calculations
  const { data: ethPriceData, isLoading: isEthPriceLoading } = useETHPrice();

  // Fetch pool reserves to calculate token prices
  const { data: poolReserves, isLoading: isReservesLoading } = useReserves({
    poolId: lpToken?.poolId,
    source: lpToken?.source,
  });
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
    const isLoading = isBaseApyLoading || isFarmApyLoading || isEthPriceLoading || isReservesLoading;

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

    if (isLoading || !ethPriceData || !poolReserves) {
      return defaultResult;
    }

    // Calculate base APY from trading fees
    const baseApy = Number(baseApyData?.slice(0, -1)) || 0;

    // Calculate farm APY from incentive rewards
    let farmApy = 0;
    let rewardPerShare = "0";

    if (rewardPerSharePerYear && rewardPerSharePerYear > 0n) {
      // rewardPerSharePerYear is scaled by 1e12 (ACC_PRECISION)
      rewardPerShare = formatUnits(rewardPerSharePerYear, 12);
      
      // Calculate token prices based on pool reserves
      // First, identify which token is ETH and which is the reward token
      const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
      
      // Debug: Log what we're checking
      console.log("Farm APY Debug - Token addresses:", {
        token0: lpToken.token0,
        token1: lpToken.token1,
        zeroAddress,
        WETH_ADDRESS,
        isToken0Zero: lpToken.token0 === zeroAddress,
        isToken1Zero: lpToken.token1 === zeroAddress,
        isToken0Weth: lpToken.token0?.toLowerCase() === WETH_ADDRESS.toLowerCase(),
        isToken1Weth: lpToken.token1?.toLowerCase() === WETH_ADDRESS.toLowerCase(),
      });
      
      const isEthToken0 = lpToken.token0 === zeroAddress || lpToken.token0?.toLowerCase() === WETH_ADDRESS.toLowerCase();
      const isEthToken1 = lpToken.token1 === zeroAddress || lpToken.token1?.toLowerCase() === WETH_ADDRESS.toLowerCase();
      
      // Verify the pool contains ETH
      if (!isEthToken0 && !isEthToken1) {
        console.error("Pool does not contain ETH/WETH", { token0: lpToken.token0, token1: lpToken.token1 });
        return defaultResult;
      }
      
      const ethReserve = isEthToken0 ? poolReserves.reserve0 : poolReserves.reserve1;
      const rewardTokenReserve = isEthToken0 ? poolReserves.reserve1 : poolReserves.reserve0;
      
      // Calculate reward token price in ETH
      // Price = ethReserve / rewardTokenReserve (adjusted for decimals)
      const rewardTokenDecimals = stream.rewardCoin?.decimals || 18;
      const ethDecimals = 18;
      
      // Reward token price in ETH = (ETH reserve / reward token reserve)
      const rewardTokenPriceInETH = Number(formatUnits(ethReserve, ethDecimals)) / 
                                    Number(formatUnits(rewardTokenReserve, rewardTokenDecimals));
      
      // Reward token price in USD = reward token price in ETH * ETH price in USD
      const rewardTokenPriceUSD = rewardTokenPriceInETH * ethPriceData.priceUSD;
      
      // Calculate LP token value using actual pool data
      // Total pool value = value of token0 + value of token1
      const ethValueInPool = Number(formatUnits(ethReserve, ethDecimals)) * ethPriceData.priceUSD;
      const rewardTokenValueInPool = Number(formatUnits(rewardTokenReserve, rewardTokenDecimals)) * rewardTokenPriceUSD;
      const totalPoolValueUSD = ethValueInPool + rewardTokenValueInPool;
      
      // Get total LP supply from the pool data
      const lpTotalSupply = poolReserves.supply || 1n; // Fallback to 1 to avoid division by zero
      const lpTokenPriceUSD = totalPoolValueUSD / Number(formatUnits(lpTotalSupply, 18));
      
      // Calculate APY: (reward per share per year * reward price) / LP price * 100
      const rewardValuePerYear = Number(rewardPerShare) * rewardTokenPriceUSD;
      farmApy = (rewardValuePerYear / lpTokenPriceUSD) * 100;
      
      // Sanity check: Cap APY at reasonable maximum to prevent display issues
      const MAX_FARM_APY = 10000; // 10,000% max
      if (farmApy > MAX_FARM_APY) {
        console.warn(`Farm APY ${farmApy.toFixed(2)}% exceeds maximum, capping at ${MAX_FARM_APY}%`);
        farmApy = MAX_FARM_APY;
      }
      
      console.log("Farm APY Calculation:", {
        rewardPerShare,
        rewardTokenPriceInETH,
        rewardTokenPriceUSD,
        lpTokenPriceUSD,
        farmApy,
        ethPrice: ethPriceData.priceUSD,
        reserves: poolReserves,
        lpTotalSupply: formatUnits(lpTotalSupply, 18),
      });
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
    isEthPriceLoading,
    isReservesLoading,
    ethPriceData,
    poolReserves,
    lpToken,
    stream.rewardCoin,
  ]);

  console.log("useCombinedApy:", {
    stream,
    lpToken,
    baseApyData,
    rewardPerSharePerYear,
  });

  return combinedApy;
}
