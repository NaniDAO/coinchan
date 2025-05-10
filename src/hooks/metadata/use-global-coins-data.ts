import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http, formatEther, formatUnits } from "viem";
import { mainnet } from "viem/chains";
import {
  CoinsMetadataHelperAbi,
  CoinsMetadataHelperAddress,
} from "@/constants/CoinsMetadataHelper";

// Create a public client instance for direct contract calls
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http("https://eth-mainnet.g.alchemy.com/v2/demo"),
});

// Define the CoinData type based on our contract
export type RawCoinData = {
  coinId: bigint;
  tokenURI: string;
  reserve0: bigint; // ETH reserve
  reserve1: bigint; // Coin reserve
  poolId: bigint;
  liquidity: bigint;
};

// Extended type with derived fields that we'll populate
export type CoinData = RawCoinData & {
  // Derived fields from metadata
  name: string | null;
  symbol: string | null;
  description: string | null;
  imageUrl: string | null;
  metadata: Record<string, any> | null;
  // Additional derived fields
  priceInEth: number | null;
};

// Cache key for localStorage
const CACHE_KEY = "coinchan-metadata-cache";

/**
 * A hook that provides access to global coin data
 * Uses the CoinsMetadataHelper contract to fetch data in a single call
 */
export function useGlobalCoinsData() {
  // We no longer need to track enriched coins since we handle it directly in the queryFn

  // Function to load data from cache
  const loadFromCache = useCallback(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        // Convert the serialized data back to the correct format
        return JSON.parse(cached, (_key, value) => {
          // Convert serialized BigInts back to actual BigInts(ensure value is bigInt and not token name)
          // FIX: Improved deserialization of BigInt values from cache.
          // Previously, any string ending in "n" (e.g., "Ross Coin") would be incorrectly parsed as a BigInt,
          // causing runtime errors. Replaced loose check with strict regex /^\d+n$/ to ensure only actual
          // BigInt-like strings (e.g., "123n") are converted.
          // This fixes cases where token names or symbols (like "Token") were mistakenly treated as BigInts.
          if (typeof value === "string" && /^\d+n$/.test(value)) {
            return BigInt(value.slice(0, -1));
          }

          return value;
        }) as CoinData[];
      }
    } catch (error) {
      console.error("Failed to load from cache:", error);
    }
    return null;
  }, []);

  // Function to save data to cache
  const saveToCache = useCallback((data: CoinData[]) => {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify(data, (_key, value) => {
          // Convert BigInts to strings for serialization
          if (typeof value === "bigint") {
            return value.toString() + "n";
          }
          return value;
        }),
      );
    } catch (error) {
      console.error("Failed to save to cache:", error);
    }
  }, []);

  // Fetch all coins data from the contract
  const {
    data: coinsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["all-coins-data"],
    queryFn: async () => {
      try {
        // Try to use the cached data first while we fetch fresh data
        const cachedData = loadFromCache();

        const rawCoinsData = await publicClient.readContract({
          address: CoinsMetadataHelperAddress,
          abi: CoinsMetadataHelperAbi,
          functionName: "getAllCoinsData",
        });

        // Process the raw data into our CoinData format
        const processedData: CoinData[] = [];

        if (Array.isArray(rawCoinsData)) {
          // Map the raw data to our CoinData format with immediate metadata extraction
          for (const rawCoin of rawCoinsData) {
            // Enhanced handling - properly check the structure of the response
            let coinId, tokenURI, reserve0, reserve1, poolId, liquidity;

            // Handle both tuple object and array response formats
            if (Array.isArray(rawCoin)) {
              // If it's an array (some contracts return tuples as arrays)
              [coinId, tokenURI, reserve0, reserve1, poolId, liquidity] =
                rawCoin;
            } else {
              // If it's an object with properties (standard viem response)
              coinId = rawCoin.coinId;
              tokenURI = rawCoin.tokenURI;
              reserve0 = rawCoin.reserve0;
              reserve1 = rawCoin.reserve1;
              poolId = rawCoin.poolId;
              liquidity = rawCoin.liquidity;
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

            // Calculate price in ETH
            if (coinData.reserve0 > 0n && coinData.reserve1 > 0n) {
              // Calculate price based on reserves
              const r0 = Number(formatEther(coinData.reserve0)); // ETH reserves in decimal
              const r1 = Number(formatUnits(coinData.reserve1, 18)); // Token reserves in decimal
              coinData.priceInEth = r0 / r1;
            }

            processedData.push(coinData);
          }
        } else {
          console.error(
            "Contract returned unexpected data format:",
            rawCoinsData,
          );
          throw new Error("Invalid data format from contract");
        }

        // Merge with cached metadata if available for faster rendering
        let mergedData: CoinData[];
        if (cachedData) {
          // Create a map of coin IDs to cached metadata for quick lookup
          const cachedMap = new Map(
            cachedData.map((coin) => [coin.coinId.toString(), coin]),
          );

          // For each fresh coin data, use cached metadata if available
          mergedData = processedData.map((freshCoin) => {
            const cachedCoin = cachedMap.get(freshCoin.coinId.toString());
            if (cachedCoin) {
              // Merge fresh blockchain data with cached metadata
              return {
                ...freshCoin,
                name: cachedCoin.name || null,
                symbol: cachedCoin.symbol || null,
                description: cachedCoin.description || null,
                imageUrl: cachedCoin.imageUrl || null,
                metadata: cachedCoin.metadata || null,
              };
            }
            return freshCoin;
          });
        } else {
          mergedData = processedData;
        }

        // Save the merged data to cache
        saveToCache(mergedData);

        // Start processing metadata immediately but use Promise.all to wait for all metadata
        // This ensures the data is processed before we return it to React Query
        // and helps React render the component with the updated metadata
        const metadataPromises = mergedData.map(async (coin) => {
          if (!coin.metadata && coin.tokenURI) {
            try {
              const metadata = await processTokenURI(coin.tokenURI);

              if (metadata) {
                // Create a new object to ensure React detects the change
                const updatedCoin = {
                  ...coin,
                  metadata: metadata,
                  name: metadata.name || null,
                  symbol: metadata.symbol || null,
                  description: metadata.description || null,
                };

                // Process image URL
                if (metadata.image) {
                  updatedCoin.imageUrl = formatImageURL(metadata.image);
                } else if (metadata.image_url) {
                  updatedCoin.imageUrl = formatImageURL(metadata.image_url);
                } else if (metadata.imageUrl) {
                  updatedCoin.imageUrl = formatImageURL(metadata.imageUrl);
                }

                // Replace the original coin in the array with the updated one
                const index = mergedData.findIndex(
                  (c) => c.coinId === coin.coinId,
                );
                if (index !== -1) {
                  mergedData[index] = updatedCoin;
                }

                // Return the updated coin
                return updatedCoin;
              }
            } catch (err) {
              console.error(
                `Error processing token URI for coin ${coin.coinId.toString()}:`,
                err,
              );
            }
          }

          // If no metadata was processed, return the original coin
          return coin;
        });

        // Wait for all metadata to be processed
        await Promise.all(metadataPromises);

        saveToCache(mergedData);

        return mergedData;
      } catch (err) {
        console.error("Error fetching all coins data:", err);

        // If we have cached data, use it as a fallback
        const cachedData = loadFromCache();
        if (cachedData && cachedData.length > 0) {
          return cachedData;
        }

        // Re-throw the error if we don't have cached data
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - stale after 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache for 30 minutes
  });

  // We no longer need a separate useEffect since we start processing metadata
  // directly in the queryFn for more immediate results

  // Helper functions to access specific coins
  const getCoinById = useCallback(
    (id: bigint): CoinData | undefined => {
      return coinsData?.find((coin) => coin.coinId === id);
    },
    [coinsData],
  );

  return {
    allCoins: coinsData || [],
    isLoading,
    error,
    refetch,
    getCoinById,
  };
}

// Process token URI to get metadata
async function processTokenURI(
  tokenURI: string,
): Promise<Record<string, any> | null> {
  if (!tokenURI || tokenURI === "N/A") {
    return null;
  }

  try {
    // Handle IPFS URIs with multiple gateway fallbacks
    let uri = tokenURI;

    // First attempt with primary gateway
    if (uri.startsWith("ipfs://")) {
      uri = `${IPFS_GATEWAYS[0]}${uri.slice(7)}`;
    }

    // Skip if it's not an HTTP or HTTPS URI
    if (!uri.startsWith("http")) {
      return null;
    }

    // Try to fetch with timeout to avoid hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    // Fetch the metadata
    let response;
    try {
      response = await fetch(uri, { signal: controller.signal });
    } catch (fetchError) {
      console.warn(`Primary fetch failed for ${uri}:`, fetchError);

      // If the URI is IPFS and the primary gateway failed, try alternative gateways
      if (tokenURI.startsWith("ipfs://")) {
        const ipfsHash = tokenURI.slice(7);

        // Try alternative gateways
        for (let i = 1; i < IPFS_GATEWAYS.length; i++) {
          const altUri = `${IPFS_GATEWAYS[i]}${ipfsHash}`;

          try {
            clearTimeout(timeoutId);
            const altController = new AbortController();
            const altTimeoutId = setTimeout(() => altController.abort(), 5000);

            response = await fetch(altUri, { signal: altController.signal });
            clearTimeout(altTimeoutId);

            if (response.ok) {
              break;
            }
          } catch (altError) {
            console.warn(
              `Alternative gateway ${IPFS_GATEWAYS[i]} failed:`,
              altError,
            );
          }
        }
      }

      // If still no valid response after trying alternatives
      if (!response || !response.ok) {
        throw new Error("All gateway attempts failed");
      }
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response || !response.ok) {
      throw new Error(`HTTP error! status: ${response?.status || "unknown"}`);
    }

    // Parse the JSON response
    try {
      const text = await response.text();

      let metadata;
      try {
        metadata = JSON.parse(text);
      } catch (jsonError) {
        console.error("Error parsing JSON metadata:", jsonError);

        // Try to clean the text response and parse again
        // Some metadata services return invalid JSON with extra characters
        const cleanedText = text.trim().replace(/^\s*[\r\n]/gm, "");
        try {
          metadata = JSON.parse(cleanedText);
        } catch (secondJsonError) {
          console.error(
            "Failed to parse JSON even after cleaning:",
            secondJsonError,
          );
          return null;
        }
      }

      // Check for non-standard image field names
      const normalizedMetadata = normalizeMetadata(metadata);

      return normalizedMetadata;
    } catch (error) {
      console.error("Error processing metadata response:", error);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching metadata from ${tokenURI}:`, error);
    return null;
  }
}

// Function to normalize metadata fields
function normalizeMetadata(metadata: Record<string, any>): Record<string, any> {
  // Create a copy to avoid modifying the original
  const normalized = { ...metadata };

  // Check for possible image field names if standard one is missing
  if (!normalized.image) {
    // Common variations of image field names
    const possibleImageFields = [
      "image_url",
      "imageUrl",
      "image_uri",
      "imageUri",
      "img",
      "avatar",
      "thumbnail",
      "logo",
      "icon",
      "media",
      "artwork",
      "picture",
      "url",
    ];

    // Find the first matching field
    for (const field of possibleImageFields) {
      if (normalized[field] && typeof normalized[field] === "string") {
        normalized.image = normalized[field];
        break;
      }
    }

    // Check if image is in a nested field like 'properties.image'
    if (!normalized.image && normalized.properties) {
      for (const field of ["image", ...possibleImageFields]) {
        if (
          normalized.properties[field] &&
          typeof normalized.properties[field] === "string"
        ) {
          normalized.image = normalized.properties[field];
          break;
        } else if (
          normalized.properties[field]?.url &&
          typeof normalized.properties[field].url === "string"
        ) {
          normalized.image = normalized.properties[field].url;
          break;
        }
      }
    }

    // Check for media arrays
    if (!normalized.image && Array.isArray(normalized.media)) {
      const mediaItem = normalized.media.find(
        (item: any) =>
          item &&
          (item.type?.includes("image") || item.mimeType?.includes("image")),
      );
      if (mediaItem?.uri || mediaItem?.url) {
        normalized.image = mediaItem.uri || mediaItem.url;
      }
    }
  }

  return normalized;
}

// Define IPFS gateways at module level for consistency
const IPFS_GATEWAYS = [
  "https://content.wrappr.wtf/ipfs/", // Primary gateway
  "https://cloudflare-ipfs.com/ipfs/", // Cloudflare gateway is very reliable
  "https://gateway.pinata.cloud/ipfs/", // Pinata gateway (often fast)
  "https://ipfs.io/ipfs/", // Standard gateway
  "https://dweb.link/ipfs/", // Protocol Labs gateway
  "https://ipfs.fleek.co/ipfs/", // Fleek gateway
];

// Format image URL (handle IPFS URLs)
export function formatImageURL(imageURL: string): string {
  if (!imageURL) {
    return "";
  }

  // Extract IPFS hash if present
  let ipfsHash = "";

  // Handle IPFS URLs
  if (imageURL.startsWith("ipfs://")) {
    ipfsHash = imageURL.slice(7);
  }
  // Handle direct IPFS gateway references
  else if (imageURL.includes("/ipfs/")) {
    const parts = imageURL.split("/ipfs/");
    if (parts.length >= 2) {
      ipfsHash = parts[1];
    }
  }
  // Handle ipfs.io URLs which sometimes have rate limits
  else if (imageURL.includes("ipfs.io")) {
    const ipfsMatch = imageURL.match(/\/ipfs\/([a-zA-Z0-9]+)/);
    if (ipfsMatch && ipfsMatch[1]) {
      ipfsHash = ipfsMatch[1];
    }
  }

  // If we found an IPFS hash, use the primary gateway
  if (ipfsHash) {
    return `${IPFS_GATEWAYS[0]}${ipfsHash}`;
  }

  // Return the original URL if no IPFS hash was found
  return imageURL;
}

// Get alternative IPFS URLs for fallback handling
export function getAlternativeImageUrls(imageURL: string): string[] {
  if (!imageURL) {
    return [];
  }

  // Extract IPFS hash if present
  let ipfsHash = "";

  // Handle IPFS URLs
  if (imageURL.startsWith("ipfs://")) {
    ipfsHash = imageURL.slice(7);
  }
  // Handle direct IPFS gateway references
  else if (imageURL.includes("/ipfs/")) {
    const parts = imageURL.split("/ipfs/");
    if (parts.length >= 2) {
      ipfsHash = parts[1];
    }
  }
  // Handle ipfs.io URLs which sometimes have rate limits
  else if (imageURL.includes("ipfs.io")) {
    const ipfsMatch = imageURL.match(/\/ipfs\/([a-zA-Z0-9]+)/);
    if (ipfsMatch && ipfsMatch[1]) {
      ipfsHash = ipfsMatch[1];
    }
  }

  // If we found an IPFS hash, generate URLs for all gateways
  if (ipfsHash) {
    // Skip the first gateway as it's used as the primary one in formatImageURL
    return IPFS_GATEWAYS.slice(1).map((gateway) => `${gateway}${ipfsHash}`);
  }

  // Return an empty array if no IPFS hash was found
  return [];
}
