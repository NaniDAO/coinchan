import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import type { AccountTransfer } from "./use-get-account";

interface UseGetCoinActivityParams {
  coinId: string;
  token: Address;
}

export function useGetCoinActivity({ coinId, token }: UseGetCoinActivityParams) {
  return useQuery({
    queryKey: ["coinActivity", coinId, token],
    queryFn: async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_INDEXER_URL}/api/transfers?coinId=${coinId}&token=${token}&limit=100`,
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch activity: ${response.status}`);
        }

        const data = await response.json();
        return data.data as AccountTransfer[];
      } catch (error) {
        console.error("Error fetching coin activity:", error);
        return [];
      }
    },
    staleTime: 30_000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}
