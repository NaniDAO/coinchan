import { useQuery } from "@tanstack/react-query";
import { formatEther } from "viem";
import { CheckTheChainAbi, CheckTheChainAddress } from "@/constants/CheckTheChain";
import { config } from "@/wagmi";
import { readContract } from "@wagmi/core";

export interface ProtocolStats {
  totalEthSwapped: string;
  totalSwaps: string;
  totalCoins: string;
}

export const useProtocolStats = () => {
  return useQuery<ProtocolStats>({
    queryKey: ["protocol-stats"],
    queryFn: async () => {
      // Fetch protocol stats and ETH price in parallel
      const [stats, ethPriceData] = await Promise.all([
        fetch(`${import.meta.env.VITE_INDEXER_URL}/api/protocol-stats`).then((res) => res.json()),
        readContract(config, {
          address: CheckTheChainAddress,
          abi: CheckTheChainAbi,
          functionName: "checkPrice",
          args: ["WETH"],
        }),
      ]);

      // Add 620.596648841 ETH to the tally + 48.69 ETH from mega sale
      const additionalEth = 620.596648841 + 48.69;
      const totalEthSwappedNum = Number(formatEther(stats.totalEthSwapped)) + additionalEth;

      // Calculate USD value
      const ethPriceUSD = Number(ethPriceData[0]) / 1e6; // Price in USDC (6 decimals)
      const totalUsdValue = totalEthSwappedNum * ethPriceUSD;

      // Format with commas for readability
      const formattedUsdValue = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(totalUsdValue);

      return {
        totalEthSwapped: `${totalEthSwappedNum.toFixed(2)} Ξ (${formattedUsdValue})`,
        totalSwaps: stats.totalSwapCount.toString(),
        totalCoins: stats.totalCoinCount.toString(),
      };
    },
    refetchInterval: 60000, // Refetch every minute
  });
};
