import {
  CheckTheChainAbi,
  CheckTheChainAddress,
} from "@/constants/CheckTheChain";
import { mainnet } from "viem/chains";
import { useReadContract } from "wagmi";

interface UsePriceParams {
  ticker: string;
}

export const usePrice = ({ ticker = "WETH" }: UsePriceParams) => {
  // Fetch ETH price in USD from CheckTheChain
  return useReadContract({
    address: CheckTheChainAddress,
    abi: CheckTheChainAbi,
    functionName: "checkPrice",
    args: [ticker],
    chainId: mainnet.id,
    query: {
      // Refresh every 60 seconds
      staleTime: 60_000,
    },
  });
};
