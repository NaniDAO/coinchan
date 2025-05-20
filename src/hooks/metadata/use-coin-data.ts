import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { CoinsMetadataHelperAbi, CoinsMetadataHelperAddress } from "@/constants/CoinsMetadataHelper";
import { CoinData } from "./coin-utils";

// Create a public client instance
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

/**
 * Hook to access data for a single coin
 * First tries to get the data from the global cache, then falls back to a direct contract call
 */
export function useCoinData(coinId: bigint) {
  // Direct query for a single coin as a fallback
  const {
    data: directCoinData,
    isLoading: isDirectLoading,
    error: directError,
    refetch: refetchDirect,
  } = useQuery({
    queryKey: ["coin-data", coinId.toString()],
    queryFn: async () => {
      try {
        // Call the contract to get data for this specific coin
        const rawData = await publicClient.readContract({
          address: CoinsMetadataHelperAddress,
          abi: CoinsMetadataHelperAbi,
          functionName: "getCoinData",
          args: [coinId],
        });

        // Transform and enrich the data
        return await processRawCoinData(rawData as any);
      } catch (error) {
        console.error(`Error fetching data for coin ${coinId.toString()}:`, error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  });

  // Combine the data sources
  const coinData = useMemo(() => {
    return directCoinData;
  }, [directCoinData]);

  // Calculate additional derived properties
  const marketCapEth = useMemo(() => {
    if (!coinData || !coinData.priceInEth) return null;

    // Fixed supply of 21 million coins
    const FIXED_SUPPLY = 21_000_000;
    return coinData.priceInEth * FIXED_SUPPLY;
  }, [coinData]);

  // Helper function to get formatted display values
  const getDisplayValues = useCallback(() => {
    return {
      name: coinData?.name || `Token ${coinId.toString()}`,
      symbol: coinData?.symbol || "TKN",
      description: coinData?.description || "No description available",
    };
  }, [coinData, coinId]);

  // Load status
  const isLoading = isDirectLoading;
  const error = directError;

  return {
    coinData,
    isLoading,
    error,
    refetch: refetchDirect,
    marketCapEth,
    getDisplayValues,
  };
}

// Helper function to process raw coin data from the contract
async function processRawCoinData(rawData: any): Promise<CoinData> {
  // Extract the fields
  const coinData = {
    coinId: rawData.coinId,
    tokenURI: rawData.tokenURI,
    reserve0: rawData.reserve0,
    reserve1: rawData.reserve1,
    poolId: rawData.poolId,
    liquidity: rawData.liquidity,
    name: null,
    symbol: null,
    description: null,
    imageUrl: null,
    metadata: null,
    priceInEth: null,
  };

  // Calculate price in ETH if reserves are available
  if (coinData.reserve0 > 0n && coinData.reserve1 > 0n) {
    const r0 = parseFloat(coinData.reserve0.toString()) / 1e18;
    const r1 = parseFloat(coinData.reserve1.toString()) / 1e18;
    // @ts-ignore
    coinData.priceInEth = r0 / r1;
  }

  // Try to fetch metadata
  if (coinData.tokenURI && coinData.tokenURI !== "N/A") {
    try {
      // Handle IPFS URIs
      let uri = coinData.tokenURI.trim();
      if (uri.startsWith("ipfs://")) {
        uri = `https://content.wrappr.wtf/ipfs/${uri.slice(7)}`;
      }

      // Only proceed if it's an HTTP URI
      if (uri.startsWith("http")) {
        const response = await fetch(uri);
        if (response.ok) {
          const metadata = await response.json();

          // Extract common fields
          coinData.name = metadata.name || null;
          coinData.symbol = metadata.symbol || null;
          coinData.description = metadata.description || null;
          coinData.metadata = metadata;

          // Process image URL if present
          if (metadata.image) {
            if (metadata.image.startsWith("ipfs://")) {
              // @ts-ignore
              coinData.imageUrl = `https://content.wrappr.wtf/ipfs/${metadata.image.slice(7)}`;
            } else {
              coinData.imageUrl = metadata.image;
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error processing metadata for coin ${coinData.coinId.toString()}:`, error);
      // We'll just continue with the partial data
    }
  }

  return coinData;
}
