import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { ZAMMAbi, ZAMMAddress } from "@/constants/ZAAM";
import { CheckTheChainAbi, CheckTheChainAddress } from "@/constants/CheckTheChain";
import type { IncentiveStream } from "@/hooks/use-incentive-streams";
import { isCookbookCoin } from "@/lib/coin-utils";
import { type TokenMeta, CULT_POOL_KEY, ENS_POOL_KEY, WLFI_POOL_KEY, WLFI_POOL_ID } from "@/lib/coins";
import {
  SINGLE_ETH_SLIPPAGE_BPS,
  SWAP_FEE,
  computePoolId,
  computePoolKey,
  getAmountOut,
  withSlippage,
} from "@/lib/swap";
import { useCallback } from "react";
import { formatEther, formatUnits, parseEther } from "viem";
import { usePublicClient } from "wagmi";

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

/**
 * Calculate the maximum ETH that can be zapped based on pool liquidity and slippage tolerance
 * For low liquidity pools, this prevents transactions from reverting due to excessive price impact
 */
export function calculateMaxEthForZap(
  ethReserve: bigint,
  tokenReserve: bigint,
  slippageBps: bigint = SINGLE_ETH_SLIPPAGE_BPS
): bigint {
  if (!ethReserve || !tokenReserve || ethReserve === 0n || tokenReserve === 0n) {
    return 0n;
  }

  // For zap, we swap half the ETH, so we need to consider price impact on half
  // A rough estimate: don't let the swap move the price by more than slippage %
  // This is simplified - actual calculation would need to consider the AMM curve

  // Conservative approach: limit to a percentage of current liquidity
  // For 1% slippage, allow up to 2% of pool liquidity (since we only swap half)
  // For 10% slippage, allow up to 20% of pool liquidity
  const maxPercentage = (slippageBps * 2n) / 100n; // Convert bps to percentage and double it
  const maxEth = (ethReserve * maxPercentage) / 10000n;

  return maxEth;
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
      if (!ethAmount || Number.parseFloat(ethAmount) <= 0) {
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

      // Determine if this is a Cookbook coin, CULT, ENS, or WLFI
      const tokenId = lpToken.id || 0n;
      const isCookbook = isCookbookCoin(tokenId);
      const isCULT = lpToken.symbol === "CULT";
      const isENS = lpToken.symbol === "ENS";
      const isWLFI = lpToken.symbol === "WLFI" || BigInt(stream.lpId) === WLFI_POOL_ID;

      // For ENS and WLFI, we should use the stream's lpId directly
      const poolIdToUse = isENS || isWLFI ? BigInt(stream.lpId) : lpToken?.poolId;

      if (!poolIdToUse) {
        throw new Error("LP token pool ID not defined");
      }

      // Validate that the stream's LP pool matches our token (skip for ENS and WLFI since we use stream.lpId)
      if (!isENS && !isWLFI && lpToken.poolId && BigInt(stream.lpId) !== BigInt(lpToken.poolId)) {
        throw new Error("Stream LP ID does not match token pool ID");
      }

      // Determine LP source and target addresses
      // CULT, ENS, and WLFI use Cookbook for liquidity operations
      const lpSrc = isCookbook || isCULT || isENS || isWLFI ? CookbookAddress : ZAMMAddress;
      const lpAbi = isCookbook || isCULT || isENS || isWLFI ? CookbookAbi : ZAMMAbi;

      // Get swap fee for the token, preferring stream data if available
      const swapFee = lpToken.swapFee ?? SWAP_FEE;

      // Note: We don't do pre-validation on cached liquidity data here since
      // GraphQL data may not reflect actual on-chain liquidity. We rely on
      // the on-chain validation below after fetching fresh reserve data.

      // Compute pool key
      let poolKey;
      let poolId;

      if (isCULT) {
        // Use the predefined CULT pool key
        poolKey = CULT_POOL_KEY;
        poolId = lpToken.poolId || 0n; // Use the pool ID from the token metadata
      } else if (isENS) {
        // Use the predefined ENS pool key
        poolKey = ENS_POOL_KEY;
        poolId = poolIdToUse; // Use the stream's lpId for ENS
      } else if (isWLFI) {
        // Use the predefined WLFI pool key
        poolKey = WLFI_POOL_KEY;
        poolId = WLFI_POOL_ID; // Always use the correct WLFI pool ID
      } else if (isCookbook) {
        // For cookbook coins, use the pool ID from lpToken which is already correct
        // Don't compute it from tokenId as that's the coin ID, not pool parameters
        if (!lpToken.poolId) {
          throw new Error("Pool ID not defined for cookbook token");
        }
        poolId = BigInt(lpToken.poolId);

        // For Cookbook pools, we need to construct the pool key with feeOrHook
        // The feeOrHook could be a simple fee (< 10000) or a hook address
        const feeOrHook = lpToken.swapFee || swapFee || 30n; // Default to 30 bps if not specified

        poolKey = {
          id0: 0n, // ETH is always token0
          id1: tokenId, // The coin ID
          token0: "0x0000000000000000000000000000000000000000" as `0x${string}`, // ETH
          token1: CookbookAddress, // Cookbook contract
          feeOrHook: feeOrHook, // Use feeOrHook instead of swapFee for Cookbook
        };
      } else {
        const basePoolKey = computePoolKey(tokenId, swapFee);
        // Transform ZAMM pool key to match zChef's expected structure
        poolKey = {
          id0: basePoolKey.id0,
          id1: basePoolKey.id1,
          token0: basePoolKey.token0,
          token1: basePoolKey.token1,
          feeOrHook: (basePoolKey as any).swapFee, // Convert swapFee to feeOrHook for zChef
        };
        poolId = computePoolId(tokenId, swapFee);
      }

      // Fetch current reserves
      if (!publicClient) {
        throw new Error("Public client not available");
      }

      const poolData = await publicClient.readContract({
        address: lpSrc,
        abi: lpAbi,
        functionName: "pools",
        args: [poolId],
      });

      const poolResult = poolData as unknown as readonly bigint[];

      // Ensure we have at least 2 elements in the array
      if (!Array.isArray(poolResult) || poolResult.length < 2) {
        throw new Error("Invalid pool data structure");
      }

      const reserves = {
        reserve0: poolResult[0], // ETH
        reserve1: poolResult[1], // Token
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
      let estimatedTokens: bigint;

      if (isCULT) {
        // For CULT, we need to use Uniswap V3 price from CheckTheChain
        try {
          const cultPriceData = await publicClient.readContract({
            address: CheckTheChainAddress,
            abi: CheckTheChainAbi,
            functionName: "checkPriceInETH",
            args: ["CULT"],
          });

          // Price is returned as uint256 with 18 decimals
          // e.g., 245052318810 = 0.00000024505231881 ETH per CULT
          const cultPriceInETH = cultPriceData[0] as bigint;

          if (cultPriceInETH === 0n) {
            throw new Error("Unable to fetch CULT price from oracle");
          }

          // Calculate CULT amount: ETH amount / CULT price
          // halfEthAmount has 18 decimals, cultPriceInETH has 18 decimals
          // Result should have 18 decimals (CULT decimals)
          estimatedTokens = (halfEthAmount * 10n ** 18n) / cultPriceInETH;
        } catch (err) {
          console.error("Failed to fetch CULT price from CheckTheChain:", err);
          // Fallback to pool-based calculation if oracle fails
          estimatedTokens = getAmountOut(halfEthAmount, reserves.reserve0, reserves.reserve1, swapFee);
        }
      } else {
        // For other tokens, use the pool reserves for calculation
        estimatedTokens = getAmountOut(halfEthAmount, reserves.reserve0, reserves.reserve1, swapFee);
      }

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
      delay = 500,
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
