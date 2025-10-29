import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { ZAMMAbi, ZAMMAddress } from "@/constants/ZAAM";
import { isCookbookCoin } from "@/lib/coin-utils";
import { type TokenMeta, USDT_POOL_ID, CULT_POOL_ID, WLFI_POOL_ID, JPYC_POOL_ID } from "@/lib/coins";
import { computePoolId } from "@/lib/swap";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";

interface UseLpBalanceParams {
  lpToken: TokenMeta;
  poolId?: bigint; // Optional pool ID to override the calculated one
  enabled?: boolean;
}

/**
 * Hook to fetch the user's LP token balance for a specific pool
 * Uses the same logic as RemoveLiquidity component
 */
export function useLpBalance({ lpToken, poolId: providedPoolId, enabled = true }: UseLpBalanceParams) {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const {
    data: balance,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["lpBalance", address, lpToken.id?.toString(), lpToken.poolId?.toString(), providedPoolId?.toString()],
    queryFn: async () => {
      if (!address || !publicClient) return 0n;

      try {
        let poolId: bigint;

        // Use provided pool ID if available (e.g., from IncentiveStream.lpId)
        if (providedPoolId !== undefined) {
          poolId = providedPoolId;
        } else if (!lpToken.id) {
          return 0n;
        } else {
          // Calculate pool ID using the same logic as RemoveLiquidity
          const isCustomPool = lpToken.isCustomPool;
          if (isCustomPool) {
            // Check if this is CULT, WLFI, or JPYC token specifically
            if (lpToken.symbol === "CULT") {
              poolId = CULT_POOL_ID;
            } else if (lpToken.symbol === "WLFI") {
              poolId = WLFI_POOL_ID;
            } else if (lpToken.symbol === "JPYC") {
              poolId = JPYC_POOL_ID;
            } else {
              poolId = lpToken.poolId || USDT_POOL_ID;
            }
          } else {
            const coinId = lpToken.id;
            const isCookbook = isCookbookCoin(coinId);
            const contractAddress = isCookbook ? CookbookAddress : ZAMMAddress;
            poolId = computePoolId(coinId, lpToken.swapFee || 100n, contractAddress);
          }
        }

        // Determine which ZAMM address to use for LP balance lookup
        // CULT, ENS, WLFI, and JPYC tokens should always use Cookbook
        const isENS = lpToken.symbol === "ENS";
        const isWLFI = lpToken.symbol === "WLFI";
        const isJPYC = lpToken.symbol === "JPYC";
        const isCookbook =
          lpToken.symbol === "CULT" ||
          isENS ||
          isWLFI ||
          isJPYC ||
          (lpToken.isCustomPool ? false : lpToken.id ? isCookbookCoin(lpToken.id) : false);
        const targetZAMMAddress = isCookbook ? CookbookAddress : ZAMMAddress;
        const targetZAMMAbi = isCookbook ? CookbookAbi : ZAMMAbi;

        // Read the user's LP token balance for this pool
        const lpBalance = (await publicClient.readContract({
          address: targetZAMMAddress,
          abi: targetZAMMAbi,
          functionName: "balanceOf",
          args: [address, poolId],
        })) as bigint;

        return lpBalance;
      } catch (error) {
        console.error("Failed to fetch LP balance:", error);
        return 0n;
      }
    },
    enabled: enabled && !!address && !!publicClient && (!!lpToken.id || providedPoolId !== undefined),
    staleTime: 30_000, // Cache for 30 seconds
    refetchInterval: 60_000, // Refetch every minute
  });

  return {
    balance: balance || 0n,
    isLoading,
    error,
    refetch,
  };
}
