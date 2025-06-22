import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { Address, erc20Abi, isAddress } from "viem";
import { mainnet } from "viem/chains";

export interface ERC20TokenInfo {
  address: Address;
  symbol: string;
  decimals: number;
  name?: string;
}

/**
 * Hook to fetch ERC20 token information (symbol, decimals, name) from a contract address
 */
export function useErc20TokenInfo(tokenAddress: string | undefined) {
  const publicClient = usePublicClient({ chainId: mainnet.id });

  return useQuery({
    queryKey: ["erc20TokenInfo", tokenAddress],
    queryFn: async (): Promise<ERC20TokenInfo | null> => {
      if (!publicClient || !tokenAddress || !isAddress(tokenAddress)) {
        return null;
      }

      try {
        // Fetch symbol, decimals, and name in parallel
        const [symbol, decimals, name] = await Promise.all([
          publicClient.readContract({
            address: tokenAddress as Address,
            abi: erc20Abi,
            functionName: "symbol",
          }) as Promise<string>,
          publicClient.readContract({
            address: tokenAddress as Address,
            abi: erc20Abi,
            functionName: "decimals",
          }) as Promise<number>,
          publicClient.readContract({
            address: tokenAddress as Address,
            abi: erc20Abi,
            functionName: "name",
          }).catch(() => undefined) as Promise<string | undefined>, // name() is optional in ERC20
        ]);

        return {
          address: tokenAddress as Address,
          symbol,
          decimals,
          name,
        };
      } catch (error) {
        console.error(`Failed to fetch ERC20 token info for ${tokenAddress}:`, error);
        return null;
      }
    },
    enabled: !!publicClient && !!tokenAddress && isAddress(tokenAddress),
    staleTime: 5 * 60 * 1000, // 5 minutes - token info rarely changes
    retry: 2,
  });
}