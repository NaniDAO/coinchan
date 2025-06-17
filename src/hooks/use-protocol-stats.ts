import { useQuery } from "@tanstack/react-query";
import { formatEther } from "viem";

export interface ProtocolStats {
  totalEthSwapped: string;
  totalSwaps: string;
  totalCoins: string;
}

export const useProtocolStats = () => {
  return useQuery<ProtocolStats>({
    queryKey: ["protocol-stats"],
    queryFn: async () => {
      const stats = await fetch(`${import.meta.env.VITE_INDEXER_URL}/api/protocol-stats`).then((res) => res.json());

      const totalEthSwapped = Number(formatEther(stats.totalEthSwapped)).toFixed(2);

      return {
        totalEthSwapped: `${totalEthSwapped} Ξ`,
        totalSwaps: stats.totalSwapCount.toString(),
        totalCoins: stats.totalCoinCount.toString(),
      };
    },
    refetchInterval: 60000, // Refetch every minute
  });
};
