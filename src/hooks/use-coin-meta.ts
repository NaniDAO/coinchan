import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { CoinsAddress, CoinsAbi } from "@/constants/Coins";
import { mainnet } from "viem/chains";

type MetaState = {
  name: string;
  symbol: string;
  tokenUri: string;
  isLoading: boolean;
  error?: Error;
};

/**
 * Fetches and returns the on-chain metadata for a single ERC-1155/721 coin.
 * If a field reverts or isn't implemented, `"N/A"` is returned for that field
 * so the caller never crashes.
 */
export const useCoinMeta = (tokenId: bigint): MetaState => {
  // Batch the three read calls so they resolve in a single RPC round-trip
  const { data, error, isLoading } = useReadContracts({
    contracts: [
      {
        address: CoinsAddress,
        abi: CoinsAbi,
        functionName: "name",
        args: [tokenId],
        chainId: mainnet.id,
      },
      {
        address: CoinsAddress,
        abi: CoinsAbi,
        functionName: "symbol",
        args: [tokenId],
        chainId: mainnet.id,
      },
      {
        address: CoinsAddress,
        abi: CoinsAbi,
        functionName: "tokenURI",
        args: [tokenId],
        chainId: mainnet.id,
      },
    ],
    query: {
      // Improved caching strategy:
      // - Metadata rarely changes, so we can cache it for much longer
      // - 24 hours staleTime means we won't refetch unless explicitly invalidated
      // - This significantly reduces network requests in the explorer grid
      staleTime: 24 * 60 * 60 * 1000, // 24 hours
      // Data is kept in cache for 7 days even when component unmounts
      gcTime: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  });

  // Parse once; components receive stable refs unless something changed
  return useMemo<MetaState>(() => {
    const [nameData, symbolData, uriData] = data || [];

    const name = (nameData?.result as string | undefined) ?? "N/A";
    const symbol = (symbolData?.result as string | undefined) ?? "N/A";
    const tokenUri = (uriData?.result as string | undefined) ?? "N/A";

    return {
      name,
      symbol,
      tokenUri,
      isLoading,
      error: error as Error | undefined,
    };
  }, [data, isLoading, error, tokenId]);
};
