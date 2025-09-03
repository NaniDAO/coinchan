import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { mainnet } from "viem/chains";
import {
  CheckTheChainAbi,
  CheckTheChainAddress,
} from "@/constants/CheckTheChain";

export function useEthUsdPrice() {
  const publicClient = usePublicClient({ chainId: mainnet.id });

  return useQuery({
    queryKey: ["ethUsdPrice"],
    queryFn: async (): Promise<number> => {
      if (!publicClient) return 0;

      try {
        const ethPrice = await publicClient.readContract({
          address: CheckTheChainAddress,
          abi: CheckTheChainAbi,
          functionName: "checkPrice",
          args: ["WETH"],
        });

        // ethPrice[1] is the price string (e.g., "3500.123456")
        return Number(ethPrice[1]);
      } catch (error) {
        console.error("Failed to fetch ETH USD price:", error);
        return 0;
      }
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 20000, // Consider data stale after 20 seconds
  });
}
