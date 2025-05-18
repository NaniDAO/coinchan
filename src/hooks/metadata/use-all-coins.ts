import { CoinchanAbi, CoinchanAddress } from "@/constants/Coinchan";
import { CoinsAbi, CoinsAddress } from "@/constants/Coins";
import {
  CoinsMetadataHelperAbi,
  CoinsMetadataHelperAddress,
} from "@/constants/CoinsMetadataHelper";
import { ZAAMAbi, ZAAMAddress } from "@/constants/ZAAM";
import {
  ETH_TOKEN,
  TokenMeta,
  USDT_ADDRESS,
  USDT_POOL_ID,
  USDT_TOKEN,
} from "@/lib/coins";
import { SWAP_FEE } from "@/lib/swap";
import { useEffect, useState } from "react";
import { formatEther, formatUnits } from "viem";
import { mainnet } from "viem/chains";
import { useAccount, useBalance, usePublicClient } from "wagmi";

// Cache constants
const BALANCE_CACHE_VALIDITY_MS = 60 * 1000; // 1 minute validity for balance caching

export const useAllCoins = () => {
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
      refetchInterval: 30_000, // Periodically refresh balance every 30s
      staleTime: 30_000, // treat result as “fresh” for 30 s
      // cacheTime not recognised in wagmi’s narrowed types
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
          balance: prevEth.balance, // Keep previous balance during loading
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
          lastUpdated: Date.now(), // Add timestamp for caching/staleness checks
        };

        // Persist to sessionStorage for faster initialization on next visit
        try {
          sessionStorage.setItem(
            "ethToken",
            JSON.stringify({
              balance: newBal.toString(),
              lastUpdated: Date.now(),
            }),
          );
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
        // Fetch USDT-ETH pool reserves first
        let usdtTokenWithReserves = { ...USDT_TOKEN };
        try {
          // Fetch USDT-ETH pool reserves using the poolId
          const usdtPoolResult = await publicClient.readContract({
            address: ZAAMAddress,
            abi: ZAAMAbi,
            functionName: "pools",
            args: [USDT_POOL_ID],
          });

          // Handle the result
          if (usdtPoolResult) {
            const poolData = usdtPoolResult as unknown as readonly bigint[];
            usdtTokenWithReserves.reserve0 = poolData[0]; // ETH reserves
            usdtTokenWithReserves.reserve1 = poolData[1]; // USDT reserves
            usdtTokenWithReserves.liquidity = poolData[6] || 0n; // Liquidity
          }
        } catch (error) {
          // If pool doesn't exist yet, use placeholder values
          console.log(
            "USDT-ETH pool reserves fetch failed, using placeholders",
          );
        }

        // Get the total coin count first to verify
        const countResult = await publicClient.readContract({
          address: CoinchanAddress,
          abi: CoinchanAbi,
          functionName: "getCoinsCount",
        });
        const totalCoinCount = Number(countResult);

        // Fetch all coins data

        // Step 1: Try to get all coins data directly from CoinsMetadataHelper
        // This is more efficient than fetching each coin individually and includes liquidity data
        let allCoinsData;
        try {
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
            // Fewer coins than expected, using batch fetching
            allCoinsData = null; // Force fallback
          }
        } catch (error) {
          // Error fetching all coins data
          allCoinsData = null; // Force fallback
        }

        // Fallback: If getAllCoinsData doesn't return all coins or fails,
        // fetch in batches using the getCoinDataBatch method
        if (!allCoinsData) {
          // Use batch fetching as fallback
          const batchSize = 50; // Adjust based on network performance
          const batches = [];

          for (let i = 0; i < totalCoinCount; i += batchSize) {
            const end = Math.min(i + batchSize, totalCoinCount);
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
          // Completed batch fetching
        }

        // Process the raw data
        if (!Array.isArray(allCoinsData) || allCoinsData.length === 0) {
          // No coins data found
          setTokens([ETH_TOKEN]);
          setLoading(false);
          return;
        }

        // Successfully received coins

        // Verify that we're getting all coins
        if (allCoinsData.length < totalCoinCount) {
          // Received fewer coins than expected
        }

        // Transform CoinsMetadataHelper data into TokenMeta objects with parallel metadata fetch
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
            const [symbolResult, nameResult, lockupResult] =
              await Promise.allSettled([
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
                publicClient.readContract({
                  address: CoinchanAddress,
                  abi: CoinchanAbi,
                  functionName: "lockups",
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

            // Extract custom swap fee from lockup if available
            let swapFee = SWAP_FEE; // Default swap fee
            if (lockupResult.status === "fulfilled") {
              try {
                const lockup = lockupResult.value as readonly [
                  string,
                  number,
                  number,
                  boolean,
                  bigint,
                  bigint,
                ];
                // Extract the swapFee (5th element in the lockups array)
                if (lockup && lockup.length >= 5) {
                  const lockupSwapFee = lockup[4];
                  if (lockupSwapFee && lockupSwapFee > 0n) {
                    swapFee = lockupSwapFee;
                  }
                }
              } catch (err) {
                // Failed to process swap fee
              }
            }

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
              liquidity, // Include liquidity value from the contract
              swapFee, // Include custom swap fee
              balance,
            } as TokenMeta;
          } catch (err) {
            // Failed to process coin data
            return null;
          }
        });

        const tokenResults = await Promise.all(tokenPromises);

        // Filter out any tokens with fetch errors or null IDs (except ETH token)
        const validTokens = tokenResults.filter(
          (token): token is TokenMeta =>
            token !== null &&
            token.id !== undefined &&
            // Allow ETH token which has null ID, filter out any other tokens with null ID
            (token.id !== null || token.symbol === "ETH"),
        );

        // Process valid coins

        // Now sort tokens by ETH reserves for display

        // Sort tokens by ETH reserves (reserve0) from highest to lowest
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
          return liquidityB > liquidityA ? 1 : liquidityB < liquidityA ? -1 : 0;
        });

        // Get the updated ETH token with balance from current state or use ethBalance directly
        const currentEthToken =
          tokens.find((token) => token.id === null) || ETH_TOKEN;

        // Create a new ETH token with balance preserved - ALWAYS prioritize the latest ethBalance
        const ethTokenWithBalance = {
          ...currentEthToken,
          // If we have ethBalance, ALWAYS use it as the most up-to-date value
          balance:
            ethBalance?.value !== undefined
              ? ethBalance.value
              : currentEthToken.balance,
          // Add formatted balance for debugging
          formattedBalance:
            ethBalance?.formatted ||
            (currentEthToken.balance
              ? formatEther(currentEthToken.balance)
              : "0"),
        };

        // Update ETH balance when it changes

        // Take the top 100 coins by ETH reserves
        const top100ByEthReserves = sortedByEthReserves.slice(0, 100);

        // Create array with ETH and top tokens, but use this in the final allTokensWithUsdt instead
        // This avoids having an unused variable
        const topTokens = top100ByEthReserves;

        // If user has USDT balance, fetch it with caching
        // Only attempt if we have a valid address AND a publicClient
        if (address && publicClient) {
          try {
            // Try to get the balance from cache first with same caching mechanism as other tokens
            const usdtBalanceCacheKey = `coinchan_usdt_balance_${address}`;
            const usdtBalanceCacheTimestampKey = `${usdtBalanceCacheKey}_timestamp`;
            const now = Date.now();

            let usdtBalance: bigint = 0n;
            let shouldFetchFromChain = true;

            // Check for valid cached balance
            try {
              const cachedBalance = localStorage.getItem(usdtBalanceCacheKey);
              const cachedTimestamp = localStorage.getItem(
                usdtBalanceCacheTimestampKey,
              );

              // Use cache if it's valid and recent
              if (
                cachedBalance &&
                cachedTimestamp &&
                now - parseInt(cachedTimestamp) < BALANCE_CACHE_VALIDITY_MS
              ) {
                usdtBalance = BigInt(cachedBalance);
                shouldFetchFromChain = false;
                usdtTokenWithReserves.balance = usdtBalance;
              }
            } catch (e) {
              // Ignore cache errors
              shouldFetchFromChain = false; // Skip chain fetch on cache error to avoid crashes
            }

            // Fetch fresh balance from chain if needed and we have a valid client
            if (shouldFetchFromChain && publicClient.chain) {
              try {
                // Try to get USDT balance from ERC20
                const freshUsdtBalance = await publicClient.readContract({
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

                if (freshUsdtBalance) {
                  usdtBalance = freshUsdtBalance as bigint;
                  usdtTokenWithReserves.balance = usdtBalance;

                  console.log("Fetched USDT balance:", {
                    rawBalance: usdtBalance.toString(),
                    formattedBalance: formatUnits(usdtBalance, 6), // Always use 6 decimals for USDT
                    decimals: usdtTokenWithReserves.decimals,
                  });

                  // Cache the balance
                  try {
                    localStorage.setItem(
                      usdtBalanceCacheKey,
                      usdtBalance.toString(),
                    );
                    localStorage.setItem(
                      usdtBalanceCacheTimestampKey,
                      now.toString(),
                    );
                  } catch (e) {
                    // Ignore storage errors
                  }
                }
              } catch (innerError) {
                // Handle errors during balance fetch but don't crash the app
                console.log(
                  "USDT balance fetch skipped:",
                  innerError instanceof Error
                    ? innerError.message
                    : "Unknown error",
                );
                // Just keep balance as 0
              }
            }
          } catch (error) {
            // Ignore errors fetching USDT balance, but don't crash initialization
            console.log(
              "USDT balance handling skipped:",
              error instanceof Error ? error.message : "Unknown error",
            );
          }
        }

        // Add USDT token to the list, but keep it out of view initially (only show when searched)
        // Place USDT after the top tokens instead of at the top
        const allTokensWithUsdt = [
          ethTokenWithBalance,
          ...topTokens,
          usdtTokenWithReserves,
        ];

        // Use top tokens by ETH reserves plus our special USDT token at the end
        setTokens(allTokensWithUsdt);
      } catch (err) {
        // Error fetching tokens
        setError("Failed to load tokens");
      } finally {
        setLoading(false);
      }
    };

    fetchTokens();
  }, [publicClient, address, ethBalance]); // Add ethBalance as a dependency to re-fetch tokens when ETH balance changes

  return {
    tokens,
    tokenCount: tokens?.length,
    loading,
    error,
    isEthBalanceFetching,
    refetchEthBalance,
  };
};
