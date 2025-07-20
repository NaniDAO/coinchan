import { CheckTheChainAbi, CheckTheChainAddress } from "@/constants/CheckTheChain";
import { useReadContract } from "wagmi";

export function useETHPrice() {
  return useReadContract({
    address: CheckTheChainAddress,
    abi: CheckTheChainAbi,
    functionName: "checkPrice",
    args: ["WETH"],
    query: {
      staleTime: 60000, // 1 minute
      select: (data) => {
        // data[0] is the price in USDC (6 decimals)
        // Convert to number for calculations
        return {
          priceWei: data[0],
          priceUSD: Number(data[0]) / 1e6,
          priceStr: data[1],
        };
      },
    },
  });
}
