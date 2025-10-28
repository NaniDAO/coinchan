import { useReadContracts } from "wagmi";
import { erc20Abi, type Address } from "viem";

/**
 * Hook to fetch ERC20 token metadata (symbol, decimals, name)
 */
export const useErc20Metadata = ({ tokenAddress }: { tokenAddress?: Address }) => {
  const { data, isLoading } = useReadContracts({
    contracts: [
      {
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "symbol",
      },
      {
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "decimals",
      },
      {
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "name",
      },
    ],
    query: {
      enabled: !!tokenAddress,
      staleTime: 3600_000, // 1 hour (metadata doesn't change)
    },
  });


  if (!data || !data[0]?.result || !data[1]?.result) {
    return {
      symbol: undefined,
      decimals: undefined,
      name: undefined,
      isLoading,
    };
  }

  return {
    symbol: data[0].result as string,
    decimals: Number(data[1].result),
    name: data[2].result as string,
    isLoading: false,
  };
};
