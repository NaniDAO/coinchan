import { useQuery } from "@tanstack/react-query";
import { type TokenMeta, ETH_TOKEN } from "@/lib/coins";
import { useMulticallBalances } from "./use-multicall-balances";
import { INDEXER_URL } from "@/lib/indexer";
import { SWAP_FEE } from "@/lib/swap";
import { isCookbookCoin } from "@/lib/coin-utils";

/**
 * Cache for image preloading
 */
const imageCache = new Map<string, boolean>();

/**
 * Preload images for better UX
 */
const preloadImage = (url: string): Promise<boolean> => {
  return new Promise((resolve) => {
    if (imageCache.has(url)) {
      resolve(imageCache.get(url)!);
      return;
    }

    const img = new Image();
    img.onload = () => {
      imageCache.set(url, true);
      resolve(true);
    };
    img.onerror = () => {
      imageCache.set(url, false);
      resolve(false);
    };
    img.src = url;
  });
};

/**
 * Process token URI to get image URL
 */
const processTokenImage = async (tokenUri: string): Promise<string | null> => {
  if (!tokenUri) return null;

  // Handle data URIs
  if (tokenUri.startsWith("data:")) {
    return tokenUri;
  }

  // Handle direct image URLs
  if (
    (tokenUri.startsWith("http") || tokenUri.startsWith("/")) &&
    (tokenUri.includes(".jpg") || tokenUri.includes(".png") || tokenUri.includes(".gif") || tokenUri.includes(".webp"))
  ) {
    await preloadImage(tokenUri);
    return tokenUri;
  }

  // Handle IPFS URIs
  if (tokenUri.startsWith("ipfs://")) {
    const hash = tokenUri.slice(7);
    const primaryUrl = `https://content.wrappr.wtf/ipfs/${hash}`;

    // Try primary IPFS gateway
    if (await preloadImage(primaryUrl)) {
      return primaryUrl;
    }

    // Fallback gateways
    const fallbackUrls = [
      `https://cloudflare-ipfs.com/ipfs/${hash}`,
      `https://content.wrappr.wtf/ipfs/${hash}`,
      `https://gateway.pinata.cloud/ipfs/${hash}`,
    ];

    for (const url of fallbackUrls) {
      if (await preloadImage(url)) {
        return url;
      }
    }
  }

  // Try to fetch metadata JSON
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const uri = tokenUri.startsWith("ipfs://") ? `https://content.wrappr.wtf/ipfs/${tokenUri.slice(7)}` : tokenUri;

    const response = await fetch(uri, { signal: controller.signal });
    clearTimeout(timeoutId);

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      let imageUrl = data.image || data.image_url || data.imageUrl || data.properties?.image;

      if (imageUrl) {
        const formattedUrl = imageUrl.startsWith("ipfs://")
          ? `https://content.wrappr.wtf/ipfs/${imageUrl.slice(7)}`
          : imageUrl;

        await preloadImage(formattedUrl);
        return formattedUrl;
      }
    }
  } catch (error) {
    console.warn("Failed to fetch token metadata:", error);
  }

  return null;
};

/**
 * Fetch token metadata with GraphQL
 */
const fetchTokenMetadata = async (): Promise<TokenMeta[]> => {
  try {
    const response = await fetch(`${INDEXER_URL}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          query GetPools {
            pools(limit: 1000, orderBy: "reserve0", orderDirection: "desc") {
              items {
                coinId
                coin0Name
                coin0Symbol
                coin0TokenURI
                coin0Decimals
                coin1Name
                coin1Symbol
                coin1TokenURI
                coin1Decimals
                reserve0
                reserve1
                poolId
                swapFee
              }
            }
          }
        `,
      }),
    });

    const { data } = await response.json();

    // Process tokens and preload popular token images
    const tokens: TokenMeta[] = await Promise.all(
      data.pools.items
        .filter((pool: any) => pool.coinId != null)
        .map(async (pool: any) => {
          const token: TokenMeta = {
            id: BigInt(pool.coinId),
            name: pool.coin1Name || `Token ${pool.coinId}`,
            symbol: pool.coin1Symbol || `T${pool.coinId}`,
            tokenUri: pool.coin1TokenURI || "",
            decimals: pool.coin1Decimals || 18,
            reserve0: pool.reserve0 ? BigInt(pool.reserve0) : undefined,
            reserve1: pool.reserve1 ? BigInt(pool.reserve1) : undefined,
            poolId: pool.poolId ? BigInt(pool.poolId) : undefined,
            source: isCookbookCoin(BigInt(pool.coinId)) ? "COOKBOOK" : "ZAMM",
            liquidity: 0n,
            swapFee: pool.swapFee ? BigInt(pool.swapFee) : SWAP_FEE,
            balance: 0n,
          };

          // Preload image for tokens with high liquidity (top 20)
          if (pool.reserve0 && BigInt(pool.reserve0) > 0n && pool.coin1TokenURI) {
            processTokenImage(pool.coin1TokenURI).then((imageUrl) => {
              if (imageUrl) {
                // Cache the processed image URL
                try {
                  sessionStorage.setItem(`token-image-${pool.coinId}-url`, imageUrl);
                } catch (e) {
                  // Ignore storage errors
                }
              }
            });
          }

          return token;
        }),
    );

    return tokens.sort((a, b) => {
      const aLiquidity = a.reserve0 ? Number(a.reserve0) : 0;
      const bLiquidity = b.reserve0 ? Number(b.reserve0) : 0;

      if (aLiquidity === bLiquidity) {
        return Number(b.id) - Number(a.id); // Secondary sort by ID
      }

      return bLiquidity - aLiquidity; // Primary sort by liquidity
    });
  } catch (error) {
    console.error("Failed to fetch token metadata:", error);
    return [];
  }
};

/**
 * Optimized hook for coins with better loading performance
 */
export function useOptimizedCoins() {
  // Fetch metadata
  const {
    data: tokenMetadata = [],
    isLoading: isMetadataLoading,
    error: metadataError,
  } = useQuery({
    queryKey: ["optimized-token-metadata"],
    queryFn: fetchTokenMetadata,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Add ETH token
  const tokensWithEth = [ETH_TOKEN, ...tokenMetadata];

  // Fetch all balances efficiently
  const {
    data: tokensWithBalances = tokensWithEth,
    isLoading: isBalancesLoading,
    error: balancesError,
    refetch: refetchBalances,
  } = useMulticallBalances(tokensWithEth);

  return {
    tokens: tokensWithBalances,
    tokenCount: tokensWithBalances.length,
    loading: isMetadataLoading || isBalancesLoading,
    error: metadataError || balancesError ? "Failed to load tokens" : null,
    isEthBalanceFetching: isBalancesLoading,
    refetchEthBalance: refetchBalances,
  };
}
