import { useState, useEffect, useCallback, useMemo, memo } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  usePublicClient,
  useBalance,
  useSendTransaction,
} from "wagmi";
import { mainnet } from "viem/chains";
import { handleWalletError, isUserRejectionError } from "./utils";
import {
  parseEther,
  parseUnits,
  formatEther,
  formatUnits,
  Address,
} from "viem";
import { CoinsAbi, CoinsAddress } from "./constants/Coins";
import { CoinchanAbi, CoinchanAddress } from "./constants/Coinchan";
import {
  CoinsMetadataHelperAbi,
  CoinsMetadataHelperAddress,
} from "./constants/CoinsMetadataHelper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { cn } from "./lib/utils";

// Cache constants
const BALANCE_CACHE_VALIDITY_MS = 60 * 1000; // 1 minute validity for balance caching

// Add CSS animations for token loading states
const tokenLoadingStyles = `
@keyframes shimmer {
  0% { opacity: 0.5; }
  50% { opacity: 1; }
  100% { opacity: 0.5; }
}
.token-loading {
  animation: shimmer 1.5s infinite;
  background: linear-gradient(90deg, rgba(255,234,0,0.1) 0%, rgba(255,255,255,0.2) 50%, rgba(255,234,0,0.1) 100%);
  background-size: 200% 100%;
  border-radius: 4px;
}

@keyframes pulse {
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
}
`;

// Add styles to document head
if (typeof document !== 'undefined') {
  const styleElem = document.createElement('style');
  styleElem.innerHTML = tokenLoadingStyles;
  document.head.appendChild(styleElem);
}

// Constants & helpers
const ETH_SVG = `<svg fill="#000000" width="800px" height="800px" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
<g fill-rule="evenodd">
<path d="M16 32C7.163 32 0 24.837 0 16S7.163 0 16 0s16 7.163 16 16-7.163 16-16 16zm7.994-15.781L16.498 4 9 16.22l7.498 4.353 7.496-4.354zM24 17.616l-7.502 4.351L9 17.617l7.498 10.378L24 17.616z"/>
<g fill-rule="nonzero">
<path fill-opacity=".298" d="M16.498 4v8.87l7.497 3.35zm0 17.968v6.027L24 17.616z"/>
<path fill-opacity=".801" d="M16.498 20.573l7.497-4.353-7.497-3.348z"/>
<path fill-opacity=".298" d="M9 16.22l7.498 4.353v-7.701z"/>
</g>
</g>
</svg>`;

// USDT Tether logo SVG
const USDT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 2000" width="2000" height="2000">
<path d="M1000,0c552.26,0,1000,447.74,1000,1000S1552.24,2000,1000,2000,0,1552.38,0,1000,447.68,0,1000,0" fill="#53ae94"/>
<path d="M1123.42,866.76V718H1463.6V491.34H537.28V718H877.5V866.64C601,879.34,393.1,934.1,393.1,999.7s208,120.36,484.4,133.14v476.5h246V1132.8c276-12.74,483.48-67.46,483.48-133s-207.48-120.26-483.48-133m0,225.64v-0.12c-8.54.44-65.84,3.22-123.68,3.22-59.52,0-115.78-2.78-123.68-3.22V999.7c8.12-.44,67.58-5.18,123.68-5.18,58.08,0,115.75,4.74,123.68,5.18v92.7Z" fill="#fff"/>
</svg>`;

// USDT address on mainnet (official Tether USD address)
const USDT_ADDRESS =
  "0xdAC17F958D2ee523a2206206994597C13D831ec7" as `0x${string}`;

// Interface for token metadata
export interface TokenMeta {
  id: bigint | null; // null = ETH pseudo-token
  name: string;
  symbol: string;
  tokenUri?: string; // Added tokenUri field to display thumbnails
  balance?: bigint; // User's balance of this token
  // Custom properties for USDT
  isCustomPool?: boolean; // Flag to identify custom pools
  decimals?: number; // Number of decimals for the token
  reserve0?: bigint;
  reserve1?: bigint;
  liquidity?: bigint;
  isFetching?: boolean; // Whether the balance is currently being fetched
  lastUpdated?: number; // Timestamp when balance was last updated
}

// Helper function to format token balance with appropriate precision
export const formatTokenBalance = (token: TokenMeta): string => {
  if (token.balance === undefined) {
    // For ETH specifically, always show 0 rather than blank
    return token.id === null ? "0" : "";
  }

  if (token.balance === 0n) return "0";

  try {
    // Special case for ETH
    if (token.id === null) {
      // Convert ETH balance to string first for precise formatting
      const ethBalanceStr = formatEther(token.balance);
      const ethValue = Number(ethBalanceStr);

      if (ethValue === 0) return "0"; // If somehow zero after conversion

      // Display ETH with appropriate precision based on size
      if (ethValue >= 1000) {
        return `${Math.floor(ethValue).toLocaleString()}`;
      } else if (ethValue >= 1) {
        return ethValue.toFixed(4); // Show 4 decimals for values ≥ 1
      } else if (ethValue >= 0.001) {
        return ethValue.toFixed(6); // Show 6 decimals for medium values
      } else if (ethValue >= 0.0000001) {
        // For very small values, use 8 decimals (typical for ETH)
        return ethValue.toFixed(8);
      } else {
        // For extremely small values, use readable scientific notation
        return ethValue.toExponential(4);
      }
    }

    // For regular tokens
    // Use correct decimals for the token (default to 18)
    const decimals = token.decimals || 18;
    const tokenValue = Number(formatUnits(token.balance, decimals));

    if (tokenValue >= 1000) {
      return `${Math.floor(tokenValue).toLocaleString()}`;
    } else if (tokenValue >= 1) {
      return tokenValue.toFixed(3); // 3 decimals for ≥ 1
    } else if (tokenValue >= 0.001) {
      return tokenValue.toFixed(4); // 4 decimals for smaller values
    } else if (tokenValue >= 0.0001) {
      return tokenValue.toFixed(6); // 6 decimals for tiny values
    } else if (tokenValue > 0) {
      return tokenValue.toExponential(2); // Scientific notation for extremely small
    }

    return "0";
  } catch (error) {
    // Error formatting balance
    return token.id === null ? "0" : ""; // Always return 0 for ETH on error
  }
};

// Define ETH token
const ETH_TOKEN: TokenMeta = {
  id: null,
  name: "Ether",
  symbol: "ETH",
  tokenUri: `data:image/svg+xml;base64,${btoa(ETH_SVG)}`, // Embed ETH SVG as data URI
  balance: 0n, // Will be updated with actual balance
};

const USDT_TOKEN: TokenMeta = {
  id: 0n, // Special USDT token with ID 0
  name: "Tether USD",
  symbol: "USDT",
  tokenUri: `data:image/svg+xml;base64,${btoa(USDT_SVG)}`,
  balance: 0n, // User balance
  isCustomPool: true,
  decimals: 6, // USDT has 6 decimals
};

// Hook to fetch all available tokens with balances
const useAllTokens = () => {
  const publicClient = usePublicClient({ chainId: mainnet.id }); // Always use mainnet
  const { address } = useAccount();
  const [tokens, setTokens] = useState<TokenMeta[]>([ETH_TOKEN]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get ETH balance using wagmi hook with optimized settings
  const {
    data: ethBalance,
    isSuccess: ethBalanceSuccess,
    isFetching: isEthBalanceFetching,
    refetch: refetchEthBalance,
  } = useBalance({
    address,
    chainId: mainnet.id,
    scopeKey: "ethBalance",
    query: {
      enabled: !!address, // only fetch when wallet connected
      staleTime: 30_000, // treat result as "fresh" for 30 s
    },
  });

  // More robust ETH balance handling with visual feedback
  useEffect(() => {
    if (!address) return; // nothing to do when wallet disconnected

    // Always immediately update with pending state if balance is being fetched
    if (isEthBalanceFetching) {
      setTokens((prev) => {
        // Find current ETH token inside existing list (if any)
        const prevEth = prev.find((t) => t.id === null) ?? ETH_TOKEN;
        
        // Only update if not already in fetching state
        if (prevEth.isFetching) return prev;
        
        // Create new ETH token with fetching state but preserve old balance for stability
        const nextEth = {
          ...prevEth,
          isFetching: true, // Add a flag to indicate loading state
          balance: prevEth.balance // Keep previous balance during loading
        };
        
        // Return new tokens array with stable references for the rest
        return [nextEth, ...prev.filter((t) => t.id !== null)];
      });
    }
    // When the new balance arrives, update with the actual value
    else if (ethBalanceSuccess && ethBalance) {
      setTokens((prev) => {
        // Find current ETH token inside existing list (if any)
        const prevEth = prev.find((t) => t.id === null) ?? ETH_TOKEN;
        const prevBal = prevEth.balance;
        const newBal = ethBalance.value;

        // If the balance really hasn't changed, just update the fetching state
        if (newBal === prevBal && !prevEth.isFetching) return prev;

        // Create a new ETH token with updated balance and fetching state reset
        const nextEth = {
          ...prevEth,
          isFetching: false,
          balance: newBal,
          lastUpdated: Date.now() // Add timestamp for caching/staleness checks
        };

        // Persist to sessionStorage for faster initialization on next visit
        try {
          sessionStorage.setItem('ethToken', JSON.stringify({
            balance: newBal.toString(),
            lastUpdated: Date.now()
          }));
        } catch (e) {
          // Ignore storage errors
        }

        // Return new tokens array with stable references for the rest
        return [nextEth, ...prev.filter((t) => t.id !== null)];
      });
    }
  }, [address, ethBalance, ethBalanceSuccess, isEthBalanceFetching]);

  useEffect(() => {
    const fetchTokens = async () => {
      if (!publicClient) {
        setError("No wallet connection available");
        setLoading(false);
        return;
      }

      try {
        // Get the total coin count directly from the CoinchanAddress contract
        const countResult = await publicClient.readContract({
          address: CoinchanAddress,
          abi: CoinchanAbi,
          functionName: "getCoinsCount",
        });
        const totalCoinCount = Number(countResult);

        console.log(`Found ${totalCoinCount} total coins`);

        // Step 1: Try to get all coins data directly from CoinsMetadataHelper
        // This is more efficient than fetching each coin individually and includes liquidity data
        let allCoinsData;
        try {
          console.log(
            "Attempting to fetch all coins data from CoinsMetadataHelper...",
          );
          allCoinsData = await publicClient.readContract({
            address: CoinsMetadataHelperAddress,
            abi: CoinsMetadataHelperAbi,
            functionName: "getAllCoinsData",
          });

          // Check if we're getting all coins
          if (
            Array.isArray(allCoinsData) &&
            allCoinsData.length < totalCoinCount
          ) {
            console.log(
              `Received only ${allCoinsData.length}/${totalCoinCount} coins, falling back to batch fetching`,
            );
            // Fewer coins than expected, using batch fetching
            allCoinsData = null; // Force fallback
          } else {
            console.log(
              `Successfully fetched all ${allCoinsData.length} coins data`,
            );
          }
        } catch (error) {
          console.error("Error fetching all coins data:", error);
          // Error fetching all coins data
          allCoinsData = null; // Force fallback
        }

        // Fallback: If getAllCoinsData doesn't return all coins or fails,
        // fetch in batches using the getCoinDataBatch method
        if (!allCoinsData) {
          console.log("Using batch fetching as fallback...");
          // Use batch fetching as fallback
          const batchSize = 50; // Adjust based on network performance
          const batches = [];

          for (let i = 0; i < totalCoinCount; i += batchSize) {
            const end = Math.min(i + batchSize, totalCoinCount);
            console.log(`Fetching batch from ${i} to ${end}`);
            // Fetch batch
            batches.push(
              publicClient.readContract({
                address: CoinsMetadataHelperAddress,
                abi: CoinsMetadataHelperAbi,
                functionName: "getCoinDataBatch",
                args: [BigInt(i), BigInt(end)],
              }),
            );
          }

          const batchResults = await Promise.all(batches);
          // Combine all batches
          allCoinsData = batchResults.flat();
          console.log(
            `Batch fetching completed with ${allCoinsData.length} total coins`,
          );
        }

        // Process the raw data from CoinsMetadataHelper
        if (Array.isArray(allCoinsData) && allCoinsData.length > 0) {
          console.log(`Processing ${allCoinsData.length} coin metadata...`);

          // Transform CoinsMetadataHelper data into TokenMeta objects
          const tokenPromises = allCoinsData.map(async (coinData: any) => {
            try {
              // Enhanced handling - properly check the structure of the response
              let coinId, tokenURI, reserve0, reserve1, poolId, liquidity;

              // Handle both tuple object and array response formats
              if (Array.isArray(coinData)) {
                // If it's an array (some contracts return tuples as arrays)
                [coinId, tokenURI, reserve0, reserve1, poolId, liquidity] =
                  coinData;
              } else {
                // If it's an object with properties (standard viem response)
                coinId = coinData.coinId;
                tokenURI = coinData.tokenURI;
                reserve0 = coinData.reserve0;
                reserve1 = coinData.reserve1;
                poolId = coinData.poolId;
                liquidity = coinData.liquidity;
              }

              // Convert all values to ensure correct types
              coinId = BigInt(coinId);
              reserve0 = BigInt(reserve0 || 0);
              reserve1 = BigInt(reserve1 || 0);
              poolId = BigInt(poolId || 0);
              liquidity = BigInt(liquidity || 0);
              tokenURI = tokenURI?.toString() || "";

              // Fetch more metadata and custom swap fee
              const [symbolResult, nameResult] = await Promise.allSettled([
                publicClient.readContract({
                  address: CoinsAddress,
                  abi: CoinsAbi,
                  functionName: "symbol",
                  args: [coinId],
                }),
                publicClient.readContract({
                  address: CoinsAddress,
                  abi: CoinsAbi,
                  functionName: "name",
                  args: [coinId],
                }),
              ]);

              const symbol =
                symbolResult.status === "fulfilled"
                  ? (symbolResult.value as string)
                  : `C#${coinId.toString()}`;
              const name =
                nameResult.status === "fulfilled"
                  ? (nameResult.value as string)
                  : `Coin #${coinId.toString()}`;

              // Fetch user's balance if address is connected - with caching
              let balance: bigint = 0n;
              if (address) {
                // Try to get the balance from cache first
                const balanceCacheKey = `coinchan_token_balance_${address}_${coinId}`;
                const balanceCacheTimestampKey = `${balanceCacheKey}_timestamp`;

                try {
                  const cachedBalance = localStorage.getItem(balanceCacheKey);
                  const cachedTimestamp = localStorage.getItem(
                    balanceCacheTimestampKey,
                  );
                  const now = Date.now();

                  // Use cache if it's valid and recent
                  if (
                    cachedBalance &&
                    cachedTimestamp &&
                    now - parseInt(cachedTimestamp) < BALANCE_CACHE_VALIDITY_MS
                  ) {
                    balance = BigInt(cachedBalance);
                  } else {
                    // Fetch fresh balance from chain
                    const balanceResult = await publicClient.readContract({
                      address: CoinsAddress,
                      abi: CoinsAbi,
                      functionName: "balanceOf",
                      args: [address, coinId],
                    });

                    balance = balanceResult as bigint;

                    // Save balance to cache
                    try {
                      localStorage.setItem(balanceCacheKey, balance.toString());
                      localStorage.setItem(
                        balanceCacheTimestampKey,
                        now.toString(),
                      );
                    } catch (e) {
                      // Cache error, can continue without caching
                    }
                  }
                } catch (err) {
                  // Failed to fetch balance or cache issue
                  try {
                    const balanceResult = await publicClient.readContract({
                      address: CoinsAddress,
                      abi: CoinsAbi,
                      functionName: "balanceOf",
                      args: [address, coinId],
                    });

                    balance = balanceResult as bigint;
                  } catch (e) {
                    // Keep balance as 0n if we couldn't fetch it
                  }
                }
              }

              return {
                id: coinId,
                symbol,
                name,
                tokenUri: tokenURI,
                reserve0,
                reserve1,
                liquidity,
                balance,
              } as TokenMeta;
            } catch (err) {
              console.error(`Error processing coin data:`, err);
              return null;
            }
          });

          const tokenResults = await Promise.all(tokenPromises);
          // Filter out any tokens with fetch errors
          const validTokens = tokenResults.filter(
            (token): token is TokenMeta => token !== null,
          );

          // If user has USDT balance, fetch it with caching
          // Only attempt if we have a valid address AND a publicClient
          let usdtTokenWithBalance = { ...USDT_TOKEN };

          if (address && publicClient) {
            try {
              // Try to get USDT balance from ERC20
              const usdtBalance = await publicClient.readContract({
                address: USDT_ADDRESS,
                abi: [
                  {
                    inputs: [
                      {
                        internalType: "address",
                        name: "account",
                        type: "address",
                      },
                    ],
                    name: "balanceOf",
                    outputs: [
                      { internalType: "uint256", name: "", type: "uint256" },
                    ],
                    stateMutability: "view",
                    type: "function",
                  },
                ],
                functionName: "balanceOf",
                args: [address],
              });

              if (usdtBalance) {
                usdtTokenWithBalance.balance = usdtBalance as bigint;
                console.log(
                  "USDT balance:",
                  formatUnits(usdtBalance as bigint, 6),
                );
              }
            } catch (error) {
              console.log("Failed to fetch USDT balance:", error);
            }
          }

          // Get the updated ETH token with balance
          const currentEthToken =
            tokens.find((token) => token.id === null) || ETH_TOKEN;

          // Create a new ETH token with balance preserved
          const ethTokenWithBalance = {
            ...currentEthToken,
            // Use the latest ethBalance if available
            balance:
              ethBalance?.value !== undefined
                ? ethBalance.value
                : currentEthToken.balance,
          };

          // Sort tokens by liquidity (highest first) like in SwapTile
          const sortedByEthReserves = [...validTokens].sort((a, b) => {
            // ETH token (null ID) should always be first
            if (a.id === null) return -1;
            if (b.id === null) return 1;

            // Primary sort by ETH reserves (reserve0)
            const reserveA = a.reserve0 || 0n;
            const reserveB = b.reserve0 || 0n;

            if (reserveB > reserveA) return 1;
            if (reserveB < reserveA) return -1;

            // Secondary sort by liquidity if ETH reserves are equal
            const liquidityA = a.liquidity || 0n;
            const liquidityB = b.liquidity || 0n;
            return liquidityB > liquidityA
              ? 1
              : liquidityB < liquidityA
                ? -1
                : 0;
          });

          // Add ETH and USDT to the tokens list, with ETH first, sorted tokens next, and USDT last
          setTokens([
            ethTokenWithBalance,
            ...sortedByEthReserves,
            usdtTokenWithBalance,
          ]);
          setLoading(false);
        } else {
          // Fallback: No coin metadata found, so use default ETH and USDT
          console.log("No coin metadata found, using default tokens");

          // Get the current ETH token
          const currentEthToken =
            tokens.find((token) => token.id === null) || ETH_TOKEN;

          // Create a new ETH token with balance preserved
          const ethTokenWithBalance = {
            ...currentEthToken,
            balance:
              ethBalance?.value !== undefined
                ? ethBalance.value
                : currentEthToken.balance,
          };

          // Create default tokens list
          setTokens([ethTokenWithBalance, USDT_TOKEN]);
          setLoading(false);
        }
      } catch (error) {
        console.error("Failed to fetch coin metadata:", error);

        // Fallback: Use existing ETH token and USDT
        const currentEthToken =
          tokens.find((token) => token.id === null) || ETH_TOKEN;
        const ethTokenWithBalance = {
          ...currentEthToken,
          balance:
            ethBalance?.value !== undefined
              ? ethBalance.value
              : currentEthToken.balance,
        };

        setTokens([ethTokenWithBalance, USDT_TOKEN]);
        setLoading(false);
      }
    };

    fetchTokens();
  }, [publicClient, address, ethBalance]);

  return { tokens, loading, error, isEthBalanceFetching, refetchEthBalance };
};

// Safe string helper function
const safeStr = (val: any): string => {
  if (val === undefined || val === null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  if (typeof val === "bigint") return String(val);
  return "";
};

// Custom TokenSelector component for selecting assets - memoized for performance
const TokenSelector = memo(
  ({
    selectedToken,
    tokens,
    onSelect,
    isEthBalanceFetching = false,
    className,
  }: {
    selectedToken: TokenMeta;
    tokens: TokenMeta[];
    onSelect: (token: TokenMeta) => void;
    isEthBalanceFetching?: boolean;
    className?: string;
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const selectedValue = selectedToken.id?.toString() ?? "eth";

    // Handle selection change
    const handleSelect = (token: TokenMeta) => {
      onSelect(token);
      setIsOpen(false);
    };

    // Get initials for fallback display
    const getInitials = (symbol: string) => {
      return symbol.slice(0, 2).toUpperCase();
    };

    // Color map for token initials
    const getColorForSymbol = (symbol: string) => {
      const symbolKey = symbol.toLowerCase();
      const colorMap: Record<string, { bg: string; text: string }> = {
        eth: { bg: "bg-black", text: "text-background" },
        us: { bg: "bg-chart-2", text: "text-background" },
        za: { bg: "bg-destructive", text: "text-background" },
        pe: { bg: "bg-chart-2", text: "text-background" },
        ro: { bg: "bg-destructive", text: "text-background" },
        "..": { bg: "bg-muted-foreground", text: "text-background" },
      };

      const initials = symbolKey.slice(0, 2);
      return colorMap[initials] || { bg: "bg-primary", text: "text-background" };
    };

    // Memoized token image component with improved handling for all token types
    const TokenImage = memo(
      ({ token }: { token: TokenMeta }) => {
        const [imageLoaded, setImageLoaded] = useState(false);
        const [imageError, setImageError] = useState(false);
        const [actualImageUrl, setActualImageUrl] = useState<string | null>(
          null,
        );
        const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());
        const [alternativeUrls, setAlternativeUrls] = useState<string[]>([]);
        const { bg, text } = getColorForSymbol(token.symbol);

        // Helper function to safely handle IPFS URIs
        const handleIpfsUri = useCallback((ipfsUri: string) => {
          if (!ipfsUri.startsWith("ipfs://")) return ipfsUri;

          const hash = ipfsUri.slice(7);
          return `https://content.wrappr.wtf/ipfs/${hash}`;
        }, []);

        // Generate alternative IPFS gateway URLs
        const getIpfsAlternatives = useCallback((ipfsUri: string) => {
          if (!ipfsUri.startsWith("ipfs://")) return [];

          const hash = ipfsUri.slice(7);
          return [
            `https://cloudflare-ipfs.com/ipfs/${hash}`,
            `https://ipfs.io/ipfs/${hash}`,
            `https://gateway.pinata.cloud/ipfs/${hash}`,
            `https://ipfs.fleek.co/ipfs/${hash}`,
          ];
        }, []);

        // Cache images in sessionStorage to prevent repeated fetches
        const cacheKey = `token-image-${token.id ?? "eth"}-url`;

        // Use sessionStorage to speed up image URL loading
        useEffect(() => {
          // First check if we have a cached version
          try {
            const cachedUrl = sessionStorage.getItem(cacheKey);
            if (cachedUrl) {
              setActualImageUrl(cachedUrl);
              return;
            }
          } catch (e) {
            // Ignore sessionStorage errors
          }

          const fetchMetadata = async () => {
            if (!token.tokenUri) return;

            // Skip for data URIs like the ETH SVG
            if (token.tokenUri.startsWith("data:")) {
              setActualImageUrl(token.tokenUri);
              try {
                sessionStorage.setItem(cacheKey, token.tokenUri);
              } catch (e) {
                // Ignore sessionStorage errors
              }
              return;
            }

            try {
              // Handle IPFS URIs immediately to prevent direct IPFS fetch errors
              if (token.tokenUri.startsWith("ipfs://")) {
                // Convert IPFS URI to HTTP URL using a gateway
                const uri = handleIpfsUri(token.tokenUri);

                // Set alternative URLs for fallbacks
                setAlternativeUrls(getIpfsAlternatives(token.tokenUri));

                setActualImageUrl(uri);
                try {
                  sessionStorage.setItem(cacheKey, uri);
                } catch (e) {
                  // Ignore sessionStorage errors
                }

                // Return early to avoid the fetch - we'll handle the image directly
                return;
              }

              // Process the token URI - convert IPFS to HTTP if needed
              const uri = handleIpfsUri(token.tokenUri);

              // Try to fetch as JSON (might be metadata)
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 3000); // Shorter timeout

              try {
                const response = await fetch(uri, {
                  signal: controller.signal,
                });
                clearTimeout(timeoutId);

                const contentType = response.headers.get("content-type");

                // If it's JSON, try to extract image URL
                if (contentType && contentType.includes("application/json")) {
                  const data = await response.json();
                  let imageUrl = null;

                  // Try multiple image field variations
                  if (data.image) {
                    imageUrl = data.image;
                  } else if (data.image_url) {
                    imageUrl = data.image_url;
                  } else if (data.imageUrl) {
                    imageUrl = data.imageUrl;
                  } else if (data.properties?.image) {
                    imageUrl = data.properties.image;
                  }

                  if (imageUrl) {
                    // Handle IPFS image URL using our helper
                    const formattedUrl = handleIpfsUri(imageUrl);

                    setActualImageUrl(formattedUrl);
                    try {
                      sessionStorage.setItem(cacheKey, formattedUrl);
                    } catch (e) {
                      // Ignore sessionStorage errors
                    }
                    return;
                  }
                }

                // If not valid JSON or no image field, use the URI directly
                setActualImageUrl(uri);
                try {
                  sessionStorage.setItem(cacheKey, uri);
                } catch (e) {
                  // Ignore sessionStorage errors
                }
              } catch (err) {
                clearTimeout(timeoutId);
                // Error fetching metadata
                // Don't mark as error yet, try alternate URLs
                setFailedUrls((prev) => new Set([...prev, uri]));
              }
            } catch (err) {
              // Error handling metadata
              setImageError(true);
            }
          };

          fetchMetadata();
        }, [
          token.tokenUri,
          token.symbol,
          token.id,
          cacheKey,
          handleIpfsUri,
          getIpfsAlternatives,
        ]);

        // If image fails to load, try alternatives
        const tryNextAlternative = useCallback(() => {
          if (alternativeUrls.length > 0) {
            // Find the next URL that hasn't been tried
            const nextUrl = alternativeUrls.find((url) => !failedUrls.has(url));
            if (nextUrl) {
              // Try alternative URL
              setActualImageUrl(nextUrl);
              return;
            }
          }

          // If we've exhausted all alternatives or have none, show error
          setImageError(true);
        }, [alternativeUrls, failedUrls]);

        // Handle image load error by trying an alternative URL
        const handleImageError = useCallback(() => {
          if (actualImageUrl) {
            setFailedUrls((prev) => new Set([...prev, actualImageUrl]));
          }
          tryNextAlternative();
        }, [actualImageUrl, tryNextAlternative]);

        // If token has no URI, show colored initial
        if (!token.tokenUri) {
          // Use token ID as a cache key to maintain stable identities
          const cacheKey = `token-initial-${token.id ?? "eth"}`;

          // Check if we have this component cached in sessionStorage
          try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached === "true") {
              // We know this token has no URI, use the optimized render path
              return (
                <div
                  className={`w-8 h-8 flex ${bg} ${text} justify-center items-center rounded-full text-xs font-medium`}
                >
                  {getInitials(token.symbol)}
                </div>
              );
            }
            // Cache this result for future renders
            sessionStorage.setItem(cacheKey, "true");
          } catch (e) {
            // Ignore sessionStorage errors
          }

          return (
            <div
              className={`w-8 h-8 flex ${bg} ${text} justify-center items-center rounded-full text-xs font-medium`}
            >
              {getInitials(token.symbol)}
            </div>
          );
        }

        // Show loading placeholder if we don't have the actual image URL yet
        if (!actualImageUrl && !imageError) {
          return (
            <div className="relative w-8 h-8 rounded-full overflow-hidden">
              <div
                className={`w-8 h-8 flex ${bg} ${text} justify-center items-center rounded-full`}
              >
                {getInitials(token.symbol)}
              </div>
            </div>
          );
        }

        // Otherwise, try to load the token image
        return (
          <div className="relative w-8 h-8 rounded-full overflow-hidden">
            {/* Show colored initials while loading or on error */}
            {(!imageLoaded || imageError) && (
              <div
                className={`absolute inset-0 w-8 h-8 flex ${bg} ${text} justify-center items-center rounded-full text-xs font-medium`}
              >
                {getInitials(token.symbol)}
              </div>
            )}

            {/* Actual token image */}
            {actualImageUrl && !imageError && (
              <img
                src={actualImageUrl}
                alt={`${token.symbol} logo`}
                className={`w-8 h-8 object-cover rounded-full ${imageLoaded ? "opacity-100" : "opacity-0"} transition-opacity duration-200`}
                onLoad={() => setImageLoaded(true)}
                onError={handleImageError}
                loading="lazy"
              />
            )}
          </div>
        );
      },
      (prevProps, nextProps) => {
        // Only re-render if token ID or URI changes
        return (
          prevProps.token.id === nextProps.token.id &&
          prevProps.token.tokenUri === nextProps.token.tokenUri
        );
      },
    );

    return (
      <div className="relative">
        {/* Selected token display with thumbnail */}
        <div
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex items-center gap-2 cursor-pointer bg-transparent border border-primary/30 rounded-md px-2 py-1 hover:bg-secondary/50 touch-manipulation",
            className,
          )}
        >
          <TokenImage token={selectedToken} />
          <div className="flex flex-col">
            <div className="flex items-center gap-1">
              <span className="font-medium">{selectedToken.symbol}</span>
            </div>
            <div className="flex items-center gap-1">
              <div 
                className={`text-xs font-medium text-muted-foreground min-w-[50px] h-[14px] ${(
                  selectedToken.id === null && isEthBalanceFetching) || selectedToken.isFetching
                    ? 'token-loading px-1 rounded' 
                    : ''
                }`}
              >
                {formatTokenBalance(selectedToken)}
                {/* Show loading indicator for ETH */}
                {selectedToken.id === null && isEthBalanceFetching && (
                  <span
                    className="text-xs text-primary ml-1 inline-block"
                    style={{ animation: "pulse 1.5s infinite" }}
                  >
                    ⟳
                  </span>
                )}
                {/* Show loading indicator for other tokens */}
                {selectedToken.id !== null && selectedToken.isFetching && (
                  <span
                    className="text-xs text-primary ml-1 inline-block"
                    style={{ animation: "pulse 1.5s infinite" }}
                  >
                    ⟳
                  </span>
                )}
              </div>
            </div>
          </div>
          <svg
            className="w-4 h-4 ml-1"
            viewBox="0 0 24 24"
            stroke="currentColor"
            fill="none"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>

        {/* Dropdown list with thumbnails */}
        {isOpen && (
          <div
            className="absolute z-20 mt-1 w-[calc(100vw-40px)] sm:w-64 max-h-[60vh] sm:max-h-96 overflow-y-auto bg-background border border-primary/30 shadow-lg rounded-md"
            style={{ contain: "content" }}
          >
            {/* Search input */}
            <div className="sticky top-0 bg-card p-2 border-b border-primary/20">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by symbol or ID..."
                  onChange={(e) => {
                    // Use optimized search with debouncing for better performance
                    const query = e.target.value.toLowerCase();

                    // Check for special searches (USDT, Tether, Stable)
                    const isStableSearch =
                      query === "usdt" ||
                      query === "tether" ||
                      query.includes("stable") ||
                      query.includes("usd");

                    // Debounce the search with requestAnimationFrame for better performance
                    const w = window as any; // Type assertion for the debounce property
                    if (w.searchDebounce) {
                      cancelAnimationFrame(w.searchDebounce);
                    }

                    w.searchDebounce = requestAnimationFrame(() => {
                      // Get all token items by data attribute - limit to visible ones first for better performance
                      const visibleItems = document.querySelectorAll(
                        "[data-token-symbol]:not(.hidden)",
                      );
                      const allItems = document.querySelectorAll(
                        "[data-token-symbol]",
                      );

                      // Special case: If searching for stablecoins, make sure USDT is visible
                      if (isStableSearch) {
                        const usdtItem = document.querySelector(
                          "[data-token-symbol='USDT']",
                        );
                        if (usdtItem) {
                          usdtItem.classList.remove("hidden");
                        }
                      }

                      // Only query all items if no visible items match
                      const itemsToSearch =
                        query.length === 0 || visibleItems.length === 0
                          ? allItems
                          : visibleItems;
                      const itemsArray = Array.from(itemsToSearch);

                      // Search through items with optimized approach
                      for (let i = 0; i < itemsArray.length; i++) {
                        const item = itemsArray[i];
                        const symbol =
                          item
                            .getAttribute("data-token-symbol")
                            ?.toLowerCase() || "";
                        const name =
                          item.getAttribute("data-token-name")?.toLowerCase() ||
                          "";
                        const id = item.getAttribute("data-token-id") || "";

                        if (
                          symbol.includes(query) ||
                          name.includes(query) ||
                          id.toLowerCase().includes(query)
                        ) {
                          item.classList.remove("hidden");
                        } else {
                          item.classList.add("hidden");
                        }
                      }
                    });
                  }}
                  className="w-full p-2 pl-8 border border-primary/30 rounded focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                />
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>

            {/* Token list */}
            <div>
              {tokens.map((token) => {
                const isSelected =
                  (token.id === null && selectedValue === "eth") ||
                  (token.id !== null && token.id.toString() === selectedValue);

                const balance = formatTokenBalance(token);

                return (
                  <div
                    key={token.id?.toString() ?? "eth"}
                    onClick={() => handleSelect(token)}
                    data-token-symbol={token.symbol}
                    data-token-name={token.name}
                    data-token-id={token.id?.toString() ?? "eth"}
                    className={`flex items-center justify-between p-3 sm:p-2 hover:bg-secondary/50 cursor-pointer touch-manipulation ${
                      isSelected ? "bg-primary/10" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <TokenImage token={token} />
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {safeStr(token.symbol)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {safeStr(token.name)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right min-w-[60px]">
                      <div 
                        className={`text-sm font-medium h-[18px] ${(
                          token.id === null && isEthBalanceFetching) || token.isFetching
                            ? 'token-loading px-1 rounded' 
                            : ''
                        }`}
                      >
                        {safeStr(balance)}
                        {/* Show loading indicator for ETH */}
                        {token.id === null && isEthBalanceFetching && (
                          <span
                            className="text-xs text-primary ml-1 inline-block"
                            style={{ animation: "pulse 1.5s infinite" }}
                          >
                            ⟳
                          </span>
                        )}
                        {/* Show loading indicator for other tokens */}
                        {token.id !== null && token.isFetching && (
                          <span
                            className="text-xs text-primary ml-1 inline-block"
                            style={{ animation: "pulse 1.5s infinite" }}
                          >
                            ⟳
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison to prevent unnecessary re-renders
    return (
      prevProps.selectedToken.id === nextProps.selectedToken.id &&
      prevProps.tokens.length === nextProps.tokens.length &&
      prevProps.isEthBalanceFetching === nextProps.isEthBalanceFetching
    );
  },
);

// Main SendTile component - Memoized for better performance
const SendTileComponent = () => {
  const {
    tokens,
    error: loadError,
    isEthBalanceFetching,
    refetchEthBalance,
  } = useAllTokens();
  const [selectedToken, setSelectedToken] = useState<TokenMeta>(ETH_TOKEN);
  const [recipientAddress, setRecipientAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [parsedAmount, setParsedAmount] = useState<bigint>(0n);
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);

  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const { writeContractAsync, isPending } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // Update selected token when tokens load, with improved error handling
  useEffect(() => {
    if (tokens.length > 0) {
      // Find ETH token in the loaded tokens
      const ethToken = tokens.find((token) => token.id === null);
      if (ethToken) {
        setSelectedToken(ethToken);
        console.log(
          "Selected ETH token with balance:",
          ethToken.balance?.toString() || "0",
        );
      }

      // Log all available tokens for debugging
      console.log(
        "Available tokens:",
        tokens.map((t) => ({
          symbol: t.symbol,
          id: t.id?.toString() || "ETH",
          balance: t.balance?.toString() || "0",
        })),
      );
    }
  }, [tokens]);

  // Handle token selection
  const handleTokenSelect = useCallback(
    (token: TokenMeta) => {
      // Clear any errors when changing tokens
      if (txError) setTxError(null);
      // Reset input values
      setAmount("");
      // Set the new token
      setSelectedToken(token);
    },
    [txError],
  );

  // Handle amount input change
  const handleAmountChange = (value: string) => {
    // Accept only numbers, one decimal point, and no more than 18 decimal places
    if (value === "" || /^(?:\d+(?:\.\d{0,18})?|\.\d{0,18})$/.test(value)) {
      setAmount(value);

      try {
        // Parse the amount based on token type
        if (selectedToken.id === null) {
          // ETH: 18 decimals
          setParsedAmount(value ? parseEther(value) : 0n);
        } else if (
          selectedToken.isCustomPool &&
          selectedToken.symbol === "USDT"
        ) {
          // USDT: 6 decimals
          setParsedAmount(value ? parseUnits(value, 6) : 0n);
        } else {
          // Regular ERC6909 tokens: 18 decimals
          setParsedAmount(value ? parseEther(value) : 0n);
        }
      } catch (error) {
        console.error("Error parsing amount:", error);
        setParsedAmount(0n);
      }
    }
  };

  // Max button handler
  const handleMaxClick = () => {
    if (!selectedToken.balance || selectedToken.balance === 0n) {
      console.log("MAX clicked but token has no balance");
      return;
    }

    console.log(
      `MAX clicked for ${selectedToken.symbol} with balance ${selectedToken.balance.toString()}`,
    );

    let maxValue: string;
    let maxParsedAmount: bigint;

    if (selectedToken.id === null) {
      // For ETH, use a percentage-based approach (like in SwapTile) to leave gas
      // Use 99% of balance to ensure there's always enough for gas
      const ethAmount = (selectedToken.balance * 99n) / 100n;

      // Format to a reasonable number of decimal places
      const formattedValue = formatEther(ethAmount);
      // Parse to number and format to avoid excessive decimals
      const parsedValue = parseFloat(formattedValue).toFixed(6);
      // Remove trailing zeros for cleaner display
      maxValue = parsedValue.replace(/\.?0+$/, "");
      maxParsedAmount = ethAmount;

      console.log(`ETH MAX: ${maxValue} (${maxParsedAmount.toString()})`);
    } else if (selectedToken.isCustomPool && selectedToken.symbol === "USDT") {
      // USDT: 6 decimals
      const formattedValue = formatUnits(selectedToken.balance, 6);
      const parsedValue = parseFloat(formattedValue).toFixed(2);
      maxValue = parsedValue.replace(/\.?0+$/, ""); // Remove trailing zeros
      maxParsedAmount = selectedToken.balance;

      console.log(`USDT MAX: ${maxValue} (${maxParsedAmount.toString()})`);
    } else {
      // Regular ERC6909 tokens: 18 decimals
      const formattedValue = formatEther(selectedToken.balance);
      const parsedValue = parseFloat(formattedValue).toFixed(4);
      maxValue = parsedValue.replace(/\.?0+$/, ""); // Remove trailing zeros
      maxParsedAmount = selectedToken.balance;

      console.log(`Token MAX: ${maxValue} (${maxParsedAmount.toString()})`);
    }

    // Set UI values and update the parsed amount
    setAmount(maxValue);
    setParsedAmount(maxParsedAmount);
  };

  // Check if send is allowed
  const canSend = useMemo(() => {
    // Must have a valid recipient address
    if (
      !recipientAddress ||
      !recipientAddress.startsWith("0x") ||
      recipientAddress.length !== 42
    ) {
      return false;
    }

    // Amount must be greater than 0 and not exceed balance
    if (
      !parsedAmount ||
      parsedAmount <= 0n ||
      !selectedToken.balance ||
      parsedAmount > selectedToken.balance
    ) {
      return false;
    }

    return true;
  }, [recipientAddress, parsedAmount, selectedToken.balance]);

  // Send transaction handler
  const handleSend = async () => {
    if (!address || !isConnected || !publicClient || !canSend) return;

    // Clear previous tx state
    setTxHash(undefined);
    setTxError(null);

    try {
      // Different logic based on token type
      if (selectedToken.id === null) {
        // Send ETH directly
        console.log(
          "Sending ETH:",
          formatEther(parsedAmount),
          "to",
          recipientAddress,
        );

        // For ETH transfers, use the correct sendTransaction approach
        const hash = await sendTransactionAsync({
          to: recipientAddress as Address,
          value: parsedAmount, // Amount to send
        });

        setTxHash(hash);
      } else if (
        selectedToken.isCustomPool &&
        selectedToken.symbol === "USDT"
      ) {
        // Send USDT (ERC20) - simplified approach
        console.log(
          "Sending USDT:",
          formatUnits(parsedAmount, 6),
          "to",
          recipientAddress,
        );

        // Define USDT standard ERC20 transfer ABI
        const erc20Abi = [
          {
            inputs: [
              { internalType: "address", name: "to", type: "address" },
              { internalType: "uint256", name: "value", type: "uint256" },
            ],
            name: "transfer",
            outputs: [{ internalType: "bool", name: "", type: "bool" }],
            stateMutability: "nonpayable",
            type: "function",
          },
        ];

        // ERC20 transfer with detailed logging
        console.log("USDT contract address:", USDT_ADDRESS);
        console.log("USDT amount in raw units:", parsedAmount.toString());

        const hash = await writeContractAsync({
          account: address,
          chainId: mainnet.id, // Explicitly set chainId
          address: USDT_ADDRESS,
          abi: erc20Abi, // Use the variable to avoid inline definition
          functionName: "transfer",
          args: [recipientAddress as `0x${string}`, parsedAmount],
        });

        setTxHash(hash);
      } else {
        // Send ERC6909 token (Coin)
        console.log(
          `Sending ${selectedToken.symbol} (ID: ${selectedToken.id}):`,
          formatEther(parsedAmount),
          "to",
          recipientAddress,
        );

        // ERC6909 transfer with detailed logging
        console.log("Coins contract address:", CoinsAddress);
        console.log("Token ID:", selectedToken.id?.toString());
        console.log("Amount in raw units:", parsedAmount.toString());

        const hash = await writeContractAsync({
          account: address,
          chainId: mainnet.id, // Explicitly set chainId
          address: CoinsAddress,
          abi: CoinsAbi,
          functionName: "transfer",
          args: [
            recipientAddress as `0x${string}`,
            selectedToken.id!,
            parsedAmount,
          ],
        });

        setTxHash(hash);
      }
    } catch (error) {
      console.error("Send transaction error:", error);

      // Handle user rejection gracefully
      if (isUserRejectionError(error)) {
        setTxError("Transaction rejected by user");
      } else {
        // Handle contract errors
        const errorMsg = handleWalletError(error) || "Transaction failed";
        setTxError(errorMsg);
      }
    }
  };

  // Success handling - refresh balances
  useEffect(() => {
    if (isSuccess && txHash) {
      // Reset UI state
      setAmount("");
      setParsedAmount(0n);

      // Display success message
      console.log("Transaction successful: " + txHash);

      // Refresh ETH balance
      refetchEthBalance();

      // Refresh token balances after a slight delay
      setTimeout(() => {
        refetchEthBalance();
      }, 1500); // Extra refresh after 1.5s to ensure balances are updated
    }
  }, [isSuccess, txHash, refetchEthBalance]);

  // Safe string renderer helper to prevent rendering non-string types directly
  const safeStr = (val: any): string => {
    if (val === undefined || val === null) return "";
    if (typeof val === "string") return val;
    if (typeof val === "number") return String(val);
    if (typeof val === "bigint") return String(val);
    return "";
  };

  // Calculate percent of balance
  const percentOfBalance = useMemo((): number => {
    if (!selectedToken.balance || selectedToken.balance === 0n || !parsedAmount)
      return 0;

    // Convert to number explicitly
    const percent = Number((parsedAmount * 100n) / selectedToken.balance);
    return Number.isFinite(percent) ? percent : 0;
  }, [selectedToken.balance, parsedAmount]);

  return (
    <Card className="border-border shadow-md mb-4">
      <CardHeader>
        <CardTitle>Send Coins</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Recipient address input */}
        <div className="grid grid-cols-5 gap-4 w-full mb-4">
          <div className="col-span-3">
            <label className="block text-sm font-medium text-foreground mb-1">
              Recipient Address
            </label>
            <div className="h-12">
              {" "}
              {/* Set fixed height to match TokenSelector */}
              <input
                type="text"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                placeholder="0x..."
                className="w-full p-2 border-2 border-primary/40 rounded focus-within:ring-2 hover:bg-secondary/50 focus-within:ring-primary focus-within:outline-none h-full"
              />
            </div>
            {recipientAddress &&
              (!recipientAddress.startsWith("0x") ||
                recipientAddress.length !== 42) && (
                <p className="mt-1 text-sm text-destructive">
                  Please enter a valid Ethereum address
                </p>
              )}
          </div>
          {/* Token selector */}
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Asset to Send
            </label>
            <TokenSelector
              selectedToken={selectedToken}
              tokens={tokens.length > 0 ? tokens : [ETH_TOKEN]} // Ensure we always have at least ETH
              onSelect={handleTokenSelect}
              isEthBalanceFetching={isEthBalanceFetching}
              className="h-12"
            />
          </div>
        </div>

        {/* Amount input */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1">
            <label className="block text-sm font-medium text-foreground">
              Amount
            </label>
            <button
              onClick={handleMaxClick}
              className="text-xs text-primary hover:text-primary/80"
              disabled={!selectedToken.balance || selectedToken.balance === 0n}
            >
              MAX
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0.0"
              className={`w-full h-12 p-2 border-2 border-primary/40 rounded focus-within:ring-2 hover:bg-secondary/50 focus-within:ring-primary focus-within:outline-none ${
                selectedToken.isFetching ? 'token-loading' : ''
              }`}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 font-medium text-sm text-muted-foreground">
              {safeStr(selectedToken.symbol)}
              {/* Show loading indicator if token is being fetched */}
              {selectedToken.isFetching && (
                <span
                  className="text-xs text-primary ml-1 inline-block"
                  style={{ animation: "pulse 1.5s infinite" }}
                >
                  ⟳
                </span>
              )}
            </div>
          </div>

          {amount && typeof selectedToken.balance === "bigint" && (
            <div className="mt-1 text-xs text-muted-foreground flex justify-between">
              <span>
                {percentOfBalance > 100 ? (
                  <span className="text-destructive">Insufficient balance</span>
                ) : (
                  `${percentOfBalance.toFixed(0)}% of balance`
                )}
              </span>
              <span>
                Balance: {formatTokenBalance(selectedToken)}{" "}
                {selectedToken.symbol !== undefined
                  ? safeStr(selectedToken.symbol)
                  : ""}
              </span>
            </div>
          )}
        </div>

        {/* Send button */}
        <Button
          onClick={handleSend}
          disabled={!canSend || isPending}
          className="w-full bg-primary hover:bg-primary/80 text-background font-bold py-2 px-4 rounded"
        >
          {isPending ? (
            <div className="flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span>Sending...</span>
            </div>
          ) : (
            "Send 🪁"
          )}
        </Button>

        {/* Transaction status */}
        {txHash && (
          <div className="mt-4 p-3 bg-chart-2/10 border border-chart-2/20 rounded">
            <p className="text-sm text-chart-2">
              {isSuccess ? "Transaction successful!" : "Transaction submitted!"}{" "}
              <a
                href={`https://etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                View on Etherscan
              </a>
              {/* Show animation while waiting for transaction */}
              {!isSuccess && (
                <span
                  className="inline-block ml-2 text-primary"
                  style={{ animation: "pulse 1.5s infinite" }}
                >
                  (waiting for confirmation...)
                </span>
              )}
            </p>
          </div>
        )}

        {/* Error message */}
        {txError && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded">
            <p className="text-sm text-destructive">{txError}</p>
          </div>
        )}

        {/* Loading error */}
        {loadError && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded">
            <p className="text-sm text-destructive">{loadError}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Export memoized version of the component for better performance
export const SendTile = memo(SendTileComponent);
