import { useAccount, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { ZAMMAbi, ZAMMAddress } from "@/constants/ZAAM";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { isCookbookCoin } from "@/lib/coin-utils";
import { computePoolId } from "@/lib/swap";
import { TokenMeta, USDT_POOL_ID } from "@/lib/coins";

interface UseLpBalanceParams {
  lpToken: TokenMeta;
  enabled?: boolean;
}

/**
 * Hook to fetch the user's LP token balance for a specific pool
 * Uses the same logic as RemoveLiquidity component
 */
export function useLpBalance({ lpToken, enabled = true }: UseLpBalanceParams) {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const {
    data: balance,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["lpBalance", address, lpToken.id?.toString(), lpToken.poolId?.toString()],
    queryFn: async () => {
      if (!address || !publicClient || !lpToken.id) return 0n;

      try {
        let poolId: bigint;
        const isCustomPool = lpToken.isCustomPool;

        // Calculate pool ID using the same logic as RemoveLiquidity
        if (isCustomPool) {
          poolId = lpToken.poolId || USDT_POOL_ID;
        } else {
          const coinId = lpToken.id;
          const isCookbook = isCookbookCoin(coinId);
          const contractAddress = isCookbook ? CookbookAddress : ZAMMAddress;
          poolId = computePoolId(coinId, lpToken.swapFee || 100n, contractAddress);
        }

        // Determine which ZAMM address to use for LP balance lookup
        const isCookbook = isCustomPool ? false : isCookbookCoin(lpToken.id);
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
    enabled: enabled && !!address && !!publicClient && !!lpToken.id,
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