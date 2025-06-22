import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useAccount } from "wagmi";
import { Address, erc20Abi, isAddress } from "viem";
import { mainnet } from "viem/chains";
import { TokenMeta, createErc20TokenMeta } from "@/lib/coins";

/**
 * Hook to create a TokenMeta object from an ERC20 address with balance
 * This is useful for send functionality and token selection
 */
export function useErc20TokenMeta(tokenAddress: string | undefined) {
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const { address: userAddress } = useAccount();

  return useQuery({
    queryKey: ["erc20TokenMeta", tokenAddress, userAddress],
    queryFn: async (): Promise<TokenMeta | null> => {
      if (!publicClient || !tokenAddress || !isAddress(tokenAddress)) {
        return null;
      }

      try {
        // Fetch symbol, decimals, name, and balance in parallel
        const [symbol, decimals, name, balance] = await Promise.all([
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
          }).catch(() => undefined) as Promise<string | undefined>,
          userAddress ? publicClient.readContract({
            address: tokenAddress as Address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [userAddress],
          }) as Promise<bigint> : Promise.resolve(0n),
        ]);

        // Create the TokenMeta with balance
        const tokenMeta = createErc20TokenMeta(
          tokenAddress as Address,
          symbol,
          decimals,
          name
        );

        return {
          ...tokenMeta,
          balance,
        };
      } catch (error) {
        console.error(`Failed to fetch ERC20 token meta for ${tokenAddress}:`, error);
        return null;
      }
    },
    enabled: !!publicClient && !!tokenAddress && isAddress(tokenAddress),
    staleTime: 30_000, // 30 seconds for balance
    retry: 2,
  });
}