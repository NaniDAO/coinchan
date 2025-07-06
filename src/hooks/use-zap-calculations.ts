import { usePublicClient } from "wagmi";
import { formatEther, formatUnits, parseEther } from "viem";
import { useCallback } from "react";
import { ZAMMAbi, ZAMMAddress } from "@/constants/ZAAM";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import {
  computePoolId,
  computePoolKey,
  getAmountOut,
  SWAP_FEE,
  withSlippage,
  SINGLE_ETH_SLIPPAGE_BPS,
} from "@/lib/swap";
import { isCookbookCoin } from "@/lib/coin-utils";
import { TokenMeta } from "@/lib/coins";
import { IncentiveStream } from "@/hooks/use-incentive-streams";

export interface ZapCalculation {
  estimatedTokens: bigint;
  estimatedLiquidity: bigint;
  amount0Min: bigint;
  amount1Min: bigint;
  amountOutMin: bigint;
  halfEthAmount: bigint;
  poolKey: any;
  lpSrc: `0x${string}`;
  isValid: boolean;
  error?: string;
}

export function useZapCalculations() {
  const publicClient = usePublicClient();

  const calculateZapAmounts = async (
    ethAmount: string,
    stream: IncentiveStream,
    lpToken: TokenMeta,
    slippageBps: bigint = SINGLE_ETH_SLIPPAGE_BPS,
  ): Promise<ZapCalculation> => {
    try {
      if (!ethAmount || parseFloat(ethAmount) <= 0) {
        return {
          estimatedTokens: 0n,
          estimatedLiquidity: 0n,
          amount0Min: 0n,
          amount1Min: 0n,
          amountOutMin: 0n,
          halfEthAmount: 0n,
          poolKey: null,
          lpSrc: ZAMMAddress,
          isValid: false,
          error: "Invalid ETH amount",
        };
      }

      const ethAmountBigInt = parseEther(ethAmount);
      const halfEthAmount = ethAmountBigInt / 2n;

      // Determine if this is a Cookbook coin
      const tokenId = lpToken.id || 0n;
      const isCookbook = isCookbookCoin(tokenId);

      // Validate that the stream's LP pool matches our token
      if (stream.lpId !== lpToken.poolId) {
        throw new Error("Stream LP ID does not match token pool ID");
      }

      // Determine LP source and target addresses
      const lpSrc = isCookbook ? CookbookAddress : ZAMMAddress;
      const lpAbi = isCookbook ? CookbookAbi : ZAMMAbi;

      // Get swap fee for the token, preferring stream data if available
      const swapFee = lpToken.swapFee ?? SWAP_FEE;

      // Use stream's pool information if available for additional validation
      if (stream.lpPool && stream.lpPool.liquidity === 0n) {
        return {
          estimatedTokens: 0n,
          estimatedLiquidity: 0n,
          amount0Min: 0n,
          amount1Min: 0n,
          amountOutMin: 0n,
          halfEthAmount,
          poolKey: null,
          lpSrc,
          isValid: false,
          error: "Pool has no liquidity according to stream data",
        };
      }

      // Compute pool key
      const basePoolKey = isCookbook
        ? computePoolKey(tokenId, swapFee, CookbookAddress)
        : computePoolKey(tokenId, swapFee);

      // Transform ZAMM pool key to match zChef's expected structure
      const poolKey = isCookbook
        ? basePoolKey // Cookbook already has feeOrHook
        : {
            id0: basePoolKey.id0,
            id1: basePoolKey.id1,
            token0: basePoolKey.token0,
            token1: basePoolKey.token1,
            feeOrHook: (basePoolKey as any).swapFee, // Convert swapFee to feeOrHook for zChef
          };

      // Get pool ID for reserves
      const poolId = isCookbook ? computePoolId(tokenId, swapFee, CookbookAddress) : computePoolId(tokenId, swapFee);

      // Fetch current reserves
      if (!publicClient) {
        throw new Error("Public client not available");
      }

      const result = await publicClient.readContract({
        address: lpSrc,
        abi: lpAbi,
        functionName: "pools",
        args: [poolId],
      });

      const poolData = result as unknown as readonly bigint[];

      // Ensure we have at least 2 elements in the array
      if (!Array.isArray(poolData) || poolData.length < 2) {
        throw new Error("Invalid pool data structure");
      }

      const reserves = {
        reserve0: poolData[0], // ETH
        reserve1: poolData[1], // Token
      };

      if (reserves.reserve0 === 0n || reserves.reserve1 === 0n) {
        return {
          estimatedTokens: 0n,
          estimatedLiquidity: 0n,
          amount0Min: 0n,
          amount1Min: 0n,
          amountOutMin: 0n,
          halfEthAmount,
          poolKey,
          lpSrc,
          isValid: false,
          error: "Pool has no liquidity",
        };
      }

      // Calculate how many tokens we'll get for half the ETH
      const estimatedTokens = getAmountOut(halfEthAmount, reserves.reserve0, reserves.reserve1, swapFee);

      if (estimatedTokens === 0n) {
        return {
          estimatedTokens: 0n,
          estimatedLiquidity: 0n,
          amount0Min: 0n,
          amount1Min: 0n,
          amountOutMin: 0n,
          halfEthAmount,
          poolKey,
          lpSrc,
          isValid: false,
          error: "Unable to estimate token output",
        };
      }

      // Apply slippage for minimum amounts
      const amountOutMin = withSlippage(estimatedTokens, slippageBps);
      const amount0Min = withSlippage(halfEthAmount, slippageBps);
      const amount1Min = withSlippage(estimatedTokens, slippageBps);

      // Estimate LP tokens (simplified - actual amount depends on pool state after swap)
      // For estimation, assume we get proportional LP tokens
      const totalSupply = reserves.reserve0 + reserves.reserve1; // Simplified
      const estimatedLiquidity = totalSupply > 0n ? (halfEthAmount * totalSupply) / reserves.reserve0 : halfEthAmount;

      return {
        estimatedTokens,
        estimatedLiquidity,
        amount0Min,
        amount1Min,
        amountOutMin,
        halfEthAmount,
        poolKey,
        lpSrc,
        isValid: true,
      };
    } catch (error) {
      console.error("Zap calculation error:", error);
      return {
        estimatedTokens: 0n,
        estimatedLiquidity: 0n,
        amount0Min: 0n,
        amount1Min: 0n,
        amountOutMin: 0n,
        halfEthAmount: 0n,
        poolKey: null,
        lpSrc: ZAMMAddress,
        isValid: false,
        error: error instanceof Error ? error.message : "Calculation failed",
      };
    }
  };

  const formatZapPreview = (calculation: ZapCalculation, lpToken: TokenMeta) => {
    if (!calculation.isValid) {
      return {
        ethToSwap: "0",
        ethForLiquidity: "0",
        estimatedTokens: "0",
        estimatedLpTokens: "0",
      };
    }

    const tokenDecimals = lpToken.decimals || 18;

    return {
      ethToSwap: formatEther(calculation.halfEthAmount),
      ethForLiquidity: formatEther(calculation.halfEthAmount),
      estimatedTokens: formatUnits(calculation.estimatedTokens, tokenDecimals),
      estimatedLpTokens: formatEther(calculation.estimatedLiquidity),
    };
  };

  // Debounced version of calculateZapAmounts
  const calculateZapAmountsDebounced = useCallback(
    (
      ethAmount: string,
      stream: IncentiveStream,
      lpToken: TokenMeta,
      slippageBps: bigint = SINGLE_ETH_SLIPPAGE_BPS,
      callback: (result: ZapCalculation) => void,
      delay: number = 500,
    ) => {
      const timeoutId = setTimeout(async () => {
        try {
          const result = await calculateZapAmounts(ethAmount, stream, lpToken, slippageBps);
          callback(result);
        } catch (error) {
          console.error("Debounced zap calculation error:", error);
          callback({
            estimatedTokens: 0n,
            estimatedLiquidity: 0n,
            amount0Min: 0n,
            amount1Min: 0n,
            amountOutMin: 0n,
            halfEthAmount: 0n,
            poolKey: null,
            lpSrc: ZAMMAddress,
            isValid: false,
            error: error instanceof Error ? error.message : "Calculation failed",
          });
        }
      }, delay);

      // Return cleanup function
      return () => clearTimeout(timeoutId);
    },
    [calculateZapAmounts],
  );

  return {
    calculateZapAmounts,
    calculateZapAmountsDebounced,
    formatZapPreview,
  };
}
