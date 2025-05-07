import { useState, useEffect, useMemo, useCallback } from "react";
import { useGlobalCoinsData, type CoinData } from "./use-global-coins-data";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { CoinsMetadataHelperAbi, CoinsMetadataHelperAddress } from "@/constants/CoinsMetadataHelper";
import { useQuery } from "@tanstack/react-query";

// Create a public client instance
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

/**
 * Hook for paginated access to coins data
 * Uses the global coins data if available, with fallback to direct pagination
 */
export function usePagedCoins(pageSize: number = 20) {
  const [page, setPage] = useState(0);
  const { allCoins, isLoading: isGlobalLoading } = useGlobalCoinsData();

  // Calculate total pages based on global data
  const totalCoinsFromGlobal = useMemo(() => allCoins?.length || 0, [allCoins]);
  const totalPagesFromGlobal = useMemo(() => {
    return Math.ceil(totalCoinsFromGlobal / pageSize) || 1;
  }, [totalCoinsFromGlobal, pageSize]);

  // Direct query for coin count as a fallback
  const { data: totalCoinsCount, isLoading: isCountLoading } = useQuery({
    queryKey: ["coins-count"],
    queryFn: async () => {
      if (totalCoinsFromGlobal > 0) return totalCoinsFromGlobal;

      console.log("Fetching total coins count directly...");
      try {
        const count = await publicClient.readContract({
          address: CoinsMetadataHelperAddress,
          abi: CoinsMetadataHelperAbi,
          functionName: "getCoinsCount",
        });
        return Number(count);
      } catch (error) {
        console.error("Error fetching coins count:", error);
        return 0;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Calculate pages from direct count if needed
  const totalPages = useMemo(() => {
    if (totalPagesFromGlobal > 1) return totalPagesFromGlobal;
    return Math.ceil((totalCoinsCount || 0) / pageSize) || 1;
  }, [totalPagesFromGlobal, totalCoinsCount, pageSize]);

  // If we're using the global data, get the current page items
  const pageItemsFromGlobal = useMemo(() => {
    if (!allCoins || allCoins.length === 0) return null;

    const start = page * pageSize;
    const end = Math.min(start + pageSize, allCoins.length);
    return allCoins.slice(start, end);
  }, [allCoins, page, pageSize]);

  // Direct query for a page of coins as a fallback
  const {
    data: directPageItems,
    isLoading: isPageLoading,
    error: pageError,
  } = useQuery({
    queryKey: ["paged-coins", page, pageSize],
    queryFn: async () => {
      // If we have global data, use that instead
      if (pageItemsFromGlobal) return pageItemsFromGlobal;

      const start = page * pageSize;
      // In case we fetched the count directly but don't have global data
      const total = totalCoinsCount || 0;
      if (total === 0) return [];

      const end = Math.min(start + pageSize, total);
      if (start >= end) return [];

      console.log(`Fetching coins directly for page ${page} (${start}-${end})...`);

      try {
        const rawData = (await publicClient.readContract({
          address: CoinsMetadataHelperAddress,
          abi: CoinsMetadataHelperAbi,
          functionName: "getCoinDataBatch",
          args: [BigInt(start), BigInt(end)],
        })) as any[];

        // Process each coin's data
        const processedData = await Promise.all(rawData.map(processRawCoinData));

        return processedData;
      } catch (error) {
        console.error(`Error fetching coins for page ${page}:`, error);
        return [];
      }
    },
    enabled: !pageItemsFromGlobal || pageItemsFromGlobal.length === 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Combine the data sources
  const pageItems = useMemo(() => {
    return pageItemsFromGlobal || directPageItems || [];
  }, [pageItemsFromGlobal, directPageItems]);

  // Ensure page is valid
  useEffect(() => {
    if (page >= totalPages && totalPages > 0) {
      setPage(totalPages - 1);
    }
  }, [page, totalPages]);

  // Pagination helpers
  const hasNextPage = page < totalPages - 1;
  const hasPreviousPage = page > 0;

  const goToNextPage = useCallback(() => {
    if (hasNextPage) {
      setPage((p) => p + 1);
    }
  }, [hasNextPage]);

  const goToPreviousPage = useCallback(() => {
    if (hasPreviousPage) {
      setPage((p) => p - 1);
    }
  }, [hasPreviousPage]);

  const goToPage = useCallback(
    (newPage: number) => {
      if (newPage >= 0 && newPage < totalPages) {
        setPage(newPage);
      }
    },
    [totalPages],
  );

  // Loading state
  const isLoading = isGlobalLoading || isCountLoading || isPageLoading;

  return {
    coins: pageItems,
    total: totalCoinsCount || totalCoinsFromGlobal || 0,
    page,
    totalPages,
    setPage: goToPage,
    isLoading,
    error: pageError,
    hasNextPage,
    hasPreviousPage,
    goToNextPage,
    goToPreviousPage,
  };
}

// Import the processTokenURI and formatImageURL functions from use-global-coins-data.ts
import { formatImageURL } from "./use-global-coins-data";

// Helper function to process raw coin data
async function processRawCoinData(rawData: any): Promise<CoinData> {
  console.log("Processing raw coin data:", rawData);

  // Enhanced handling - properly check the structure of the response
  let coinId, tokenURI, reserve0, reserve1, poolId, liquidity;

  // Handle both tuple object and array response formats
  if (Array.isArray(rawData)) {
    // If it's an array (some contracts return tuples as arrays)
    [coinId, tokenURI, reserve0, reserve1, poolId, liquidity] = rawData;
  } else {
    // If it's an object with properties (standard viem response)
    coinId = rawData.coinId;
    tokenURI = rawData.tokenURI;
    reserve0 = rawData.reserve0;
    reserve1 = rawData.reserve1;
    poolId = rawData.poolId;
    liquidity = rawData.liquidity;
  }

  // Convert all values to ensure correct types
  const coinData: CoinData = {
    coinId: BigInt(coinId),
    tokenURI: tokenURI?.toString() || "",
    reserve0: BigInt(reserve0 || 0),
    reserve1: BigInt(reserve1 || 0),
    poolId: BigInt(poolId || 0),
    liquidity: BigInt(liquidity || 0),
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
    coinData.priceInEth = r0 / r1;
  }

  // Fetch and process metadata immediately for direct coin requests
  if (coinData.tokenURI && coinData.tokenURI !== "N/A") {
    try {
      console.log(`Fetching metadata for coin ${coinData.coinId.toString()} with URI: ${coinData.tokenURI}`);

      // Handle IPFS URIs with gateway
      let uri = coinData.tokenURI;
      if (uri.startsWith("ipfs://")) {
        uri = `https://content.wrappr.wtf/ipfs/${uri.slice(7)}`;
      }

      // Skip if it's not an HTTP or HTTPS URI
      if (uri.startsWith("http")) {
        const response = await fetch(uri);
        if (response.ok) {
          const metadata = await response.json();
          console.log(`Successfully fetched metadata for coin ${coinData.coinId.toString()}:`, metadata);

          // Extract common fields
          coinData.metadata = metadata;
          coinData.name = metadata.name || null;
          coinData.symbol = metadata.symbol || null;
          coinData.description = metadata.description || null;

          // Process image URL
          if (metadata.image) {
            coinData.imageUrl = formatImageURL(metadata.image);
            console.log(`Set image URL for coin ${coinData.coinId.toString()}: ${coinData.imageUrl}`);
          } else if (metadata.image_url) {
            coinData.imageUrl = formatImageURL(metadata.image_url);
            console.log(`Set image_url for coin ${coinData.coinId.toString()}: ${coinData.imageUrl}`);
          } else if (metadata.imageUrl) {
            coinData.imageUrl = formatImageURL(metadata.imageUrl);
            console.log(`Set imageUrl for coin ${coinData.coinId.toString()}: ${coinData.imageUrl}`);
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching metadata for coin ${coinData.coinId.toString()}:`, error);
    }
  }

  return coinData;
}
