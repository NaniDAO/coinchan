import { CookbookAddress } from "@/constants/Cookbook";
import { useQuery } from "@tanstack/react-query";

// Hook to fetch total supply from holder balances (same as in FinalizedPoolTrading)
export const useCoinTotalSupply = (coinId: string, reserves?: any) => {
  return useQuery({
    queryKey: ["coinTotalSupply", coinId, reserves?.reserve1?.toString()],
    queryFn: async () => {
      try {
        // Fetch ALL holder balances
        let allHolders: any[] = [];
        let offset = 0;
        const limit = 100;
        let hasMore = true;

        while (hasMore) {
          const response = await fetch(
            `${import.meta.env.VITE_INDEXER_URL}/api/holders?coinId=${coinId}&limit=${limit}&offset=${offset}`,
          );

          if (!response.ok) {
            throw new Error(`Failed to fetch holders: ${response.status}`);
          }

          const data = await response.json();
          allHolders.push(...(data.data || []));

          hasMore = data.hasMore;
          offset += limit;

          // Safety break
          if (offset > 10000) {
            console.warn("Reached maximum offset limit");
            break;
          }
        }

        // Sum all holder balances
        let totalFromHolders = 0n;
        for (const holder of allHolders) {
          totalFromHolders += BigInt(holder.balance);
        }

        // For cookbook coins, add pool reserves if not already counted
        const cookbookHolder = allHolders.find((h: any) => h.address.toLowerCase() === CookbookAddress.toLowerCase());

        if (reserves?.reserve1) {
          if (!cookbookHolder || BigInt(cookbookHolder.balance) === 0n) {
            totalFromHolders += reserves.reserve1;
          }
        }

        return totalFromHolders;
      } catch (error) {
        console.error("Error fetching total supply from holders:", error);
        return null;
      }
    },
    enabled: !!coinId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
};
