import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { ZAMMAbi, ZAMMAddress } from "@/constants/ZAAM";
import { type TokenMeta } from "@/lib/coins";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

interface UseLpSupplyParams {
  lpToken?: TokenMeta;
  poolId?: bigint;
  enabled?: boolean;
}

/**
 * Hook to fetch the total supply of LP tokens for a pool
 * The supply field is at index 6 in the pool struct
 */
export function useLpSupply({ lpToken, poolId, enabled = true }: UseLpSupplyParams) {
  const publicClient = usePublicClient();

  const {
    data: supply,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["lpSupply", poolId?.toString(), lpToken?.poolId?.toString()],
    queryFn: async () => {
      if (!publicClient || (!poolId && !lpToken?.poolId)) return null;

      try {
        const poolIdToUse = poolId || lpToken?.poolId;
        if (!poolIdToUse) return null;

        // Determine which contract to use based on the token source
        const isZAMM = lpToken?.source === "ZAMM";
        const contractAddress = isZAMM ? ZAMMAddress : CookbookAddress;
        const contractAbi = isZAMM ? ZAMMAbi : CookbookAbi;

        // Fetch pool data
        const poolData = await publicClient.readContract({
          address: contractAddress,
          abi: contractAbi,
          functionName: "pools",
          args: [poolIdToUse],
        });

        // Pool struct:
        // 0: reserve0 (uint112)
        // 1: reserve1 (uint112)
        // 2: blockTimestampLast (uint32)
        // 3: price0CumulativeLast (uint256)
        // 4: price1CumulativeLast (uint256)
        // 5: kLast (uint256)
        // 6: supply (uint256)
        const poolResult = poolData as readonly bigint[];

        // Return the supply field (index 6)
        return poolResult[6] || 0n;
      } catch (error) {
        console.error("Error fetching LP supply:", error);
        return null;
      }
    },
    enabled: enabled && !!publicClient && !!(poolId || lpToken?.poolId),
    staleTime: 30000, // 30 seconds
  });

  return {
    supply,
    isLoading,
    error,
    refetch,
  };
}