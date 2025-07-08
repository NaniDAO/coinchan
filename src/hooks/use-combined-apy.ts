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
      // Use the stream data which contains the actual LP token and reward token addresses
      const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
      
      // Debug: Log what we're checking
      console.log("Farm APY Debug - Stream addresses:", {
        lpTokenAddress: stream.lpToken,
        rewardTokenAddress: stream.rewardToken,
        zeroAddress,
        WETH_ADDRESS,
        poolReserves,
        lpTokenMeta: lpToken,
      });
      
      // For ETH/ZAMM pools on ZAMM AMM, we need to determine which reserve is ETH
      // Since this is a pool incentive, the pool should contain ETH and the reward token
      // We'll assume reserve0 is ETH and reserve1 is the reward token (standard ZAMM pattern)
      // But let's verify by checking if either token is ETH/WETH
      
      const isRewardTokenEth = stream.rewardToken === zeroAddress || 
                               stream.rewardToken?.toLowerCase() === WETH_ADDRESS.toLowerCase();
      
      // If the reward token is ETH (unlikely but possible), then the pool is ETH/ETH or ETH/WETH
      // More likely: the pool is ETH/ZAMM where ZAMM is the reward token
      // Since ZAMM pools follow Uniswap V2 pattern, we assume reserve0 is ETH and reserve1 is the other token
      // For ETH/ZAMM: reserve0 = ETH, reserve1 = ZAMM
      
      if (isRewardTokenEth) {
        console.error("Reward token is ETH, this configuration is not supported for APY calculation");
        return defaultResult;
      }
      
      // Standard ETH/Token pool: reserve0 = ETH, reserve1 = reward token (ZAMM)
      const ethReserve = poolReserves.reserve0;
      const rewardTokenReserve = poolReserves.reserve1;
      
      // Validate we have reserves
      if (!ethReserve || ethReserve === 0n || !rewardTokenReserve || rewardTokenReserve === 0n) {
        console.error("Invalid pool reserves", { ethReserve, rewardTokenReserve });
        return defaultResult;
      }
      
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
