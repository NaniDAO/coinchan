import { mainnet } from "viem/chains";
import React, { useState, useEffect, useRef, useCallback } from "react";

// Cache constants
const BALANCE_CACHE_VALIDITY_MS = 60 * 1000; // 1 minute validity for balance caching

import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  usePublicClient,
  useChainId,
  useBalance,
} from "wagmi";
import { handleWalletError, isUserRejectionError } from "./utils";
import {
  parseEther,
  parseUnits,
  formatEther,
  formatUnits,
  keccak256,
  zeroAddress,
  encodeAbiParameters,
  parseAbiParameters,
} from "viem";
import { CoinsAbi, CoinsAddress } from "./constants/Coins";
import { ZAAMAbi, ZAAMAddress } from "./constants/ZAAM";
import { ZAMMHelperAbi, ZAMMHelperAddress } from "./constants/ZAMMHelper";
import {
  ZAMMSingleLiqETHAbi,
  ZAMMSingleLiqETHAddress,
} from "./constants/ZAMMSingleLiqETH";
import { CoinchanAbi, CoinchanAddress } from "./constants/Coinchan";
import {
  CoinsMetadataHelperAbi,
  CoinsMetadataHelperAddress,
} from "./constants/CoinsMetadataHelper";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowDownUp, Plus, Minus } from "lucide-react";
import {
  estimateContractGas,
  simulateContractInteraction,
} from "./lib/simulate";
import PoolPriceChart from "./PoolPriceChart";

/* ────────────────────────────────────────────────────────────────────────────
  CONSTANTS & HELPERS
──────────────────────────────────────────────────────────────────────────── */
const SWAP_FEE = 100n; // 1% pool fee
const DEFAULT_SLIPPAGE_BPS = 200n; // 2% default slippage tolerance for regular swaps
const DEFAULT_SINGLE_ETH_SLIPPAGE_BPS = 500n; // 5% default slippage tolerance for Single-ETH operations
const DEADLINE_SEC = 20 * 60; // 20 minutes

// Slippage options for the selector
const SLIPPAGE_OPTIONS = [
  { label: "0.5%", value: 50n },
  { label: "1%", value: 100n },
  { label: "2%", value: 200n },
  { label: "3%", value: 300n },
  { label: "5%", value: 500n },
];

// Calculate amount with slippage tolerance applied
const getAmountWithSlippage = (amount: bigint, slippageBps: bigint) =>
  (amount * (10000n - slippageBps)) / 10000n;

// Helper function to format token balance with appropriate precision (exported to avoid unused variable error)
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

export interface TokenMeta {
  id: bigint | null; // null = ETH pseudo-token
  name: string;
  symbol: string;
  tokenUri?: string; // Added tokenUri field to display thumbnails
  reserve0?: bigint; // ETH reserves in the pool
  reserve1?: bigint; // Token reserves in the pool
  liquidity?: bigint; // Total liquidity in the pool
  swapFee?: bigint; // Custom swap fee for the pool (default is 100n - 1%)
  balance?: bigint; // User's balance of this token
  // Below fields are for custom pools (like USDT-ETH)
  isCustomPool?: boolean; // Flag to identify custom pools
  poolId?: bigint; // Computed pool ID
  poolKey?: {
    id0: bigint;
    id1: bigint;
    token0: `0x${string}`;
    token1: `0x${string}`;
    swapFee: bigint;
  }; // Pool key object with typed properties
  token0?: `0x${string}`; // Address of token0 (ETH = address(0))
  token1?: `0x${string}`; // Address of token1 (e.g., USDT address)
  decimals?: number; // Number of decimals for the token
}

// Inline SVG for ETH
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

const ETH_TOKEN: TokenMeta = {
  id: null,
  name: "Ether",
  symbol: "ETH",
  tokenUri: `data:image/svg+xml;base64,${btoa(ETH_SVG)}`, // Embed ETH SVG as data URI
  reserve0: BigInt(Number.MAX_SAFE_INTEGER), // Ensure ETH is always at the top (special case)
  balance: 0n, // Will be updated with actual balance in useAllTokens hook
};

const computePoolKey = (coinId: bigint) => ({
  id0: 0n,
  id1: coinId,
  token0: zeroAddress,
  token1: CoinsAddress,
  swapFee: SWAP_FEE,
});

const computePoolId = (coinId: bigint) =>
  BigInt(
    keccak256(
      encodeAbiParameters(
        parseAbiParameters(
          "uint256 id0, uint256 id1, address token0, address token1, uint96 swapFee",
        ),
        [0n, coinId, zeroAddress, CoinsAddress, SWAP_FEE],
      ),
    ),
  );

// Function to compute a custom pool ID with specific tokens and fee
const computeCustomPoolId = (
  id0: bigint,
  id1: bigint,
  token0: `0x${string}`,
  token1: `0x${string}`,
  swapFee: bigint,
) =>
  BigInt(
    keccak256(
      encodeAbiParameters(
        parseAbiParameters(
          "uint256 id0, uint256 id1, address token0, address token1, uint96 swapFee",
        ),
        [id0, id1, token0, token1, swapFee],
      ),
    ),
  );

// USDT address on mainnet (official Tether USD address)
const USDT_ADDRESS =
  "0xdAC17F958D2ee523a2206206994597C13D831ec7" as `0x${string}`;

// Create USDT-ETH pool with 30 bps fee
const USDT_POOL_KEY: {
  id0: bigint;
  id1: bigint;
  token0: `0x${string}`;
  token1: `0x${string}`;
  swapFee: bigint;
} = {
  id0: 0n, // ETH token ID
  id1: 0n, // USDT token ID
  token0: zeroAddress, // ETH address (0x0)
  token1: USDT_ADDRESS, // USDT address
  swapFee: 30n, // 0.3% fee (30 bps) - Standard Uniswap V2 fee tier
};

// Compute the pool ID for USDT-ETH
const USDT_POOL_ID = computeCustomPoolId(
  USDT_POOL_KEY.id0,
  USDT_POOL_KEY.id1,
  USDT_POOL_KEY.token0,
  USDT_POOL_KEY.token1,
  USDT_POOL_KEY.swapFee,
);

// Define USDT token
const USDT_TOKEN: TokenMeta = {
  id: 0n, // Special USDT token with ID 0
  name: "Tether USD",
  symbol: "USDT",
  tokenUri: `data:image/svg+xml;base64,${btoa(USDT_SVG)}`,
  reserve0: 1000000000000000000000n, // 1000 ETH (placeholder - will be updated by hook)
  reserve1: 2000000000000n, // 2M USDT (6 decimals, placeholder)
  swapFee: 30n, // 0.3% fee tier (30 bps)
  balance: 0n, // User balance
  // Custom properties for the special ETH-USDT pool
  isCustomPool: true,
  poolId: USDT_POOL_ID,
  poolKey: USDT_POOL_KEY as any, // Cast to any to avoid type errors
  decimals: 6, // USDT has 6 decimals
};

// x*y=k AMM with fee — forward (amountIn → amountOut)
const getAmountOut = (
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  swapFee: bigint,
) => {
  if (amountIn === 0n || reserveIn === 0n || reserveOut === 0n) return 0n;

  const amountInWithFee = amountIn * (10000n - swapFee);
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 10000n + amountInWithFee;
  return numerator / denominator;
};

// inverse — desired amountOut → required amountIn
const getAmountIn = (
  amountOut: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  swapFee: bigint,
) => {
  if (
    amountOut === 0n ||
    reserveIn === 0n ||
    reserveOut === 0n ||
    amountOut >= reserveOut
  )
    return 0n;

  const numerator = reserveIn * amountOut * 10000n;
  const denominator = (reserveOut - amountOut) * (10000n - swapFee);
  return numerator / denominator + 1n; // +1 for ceiling rounding
};

/* ────────────────────────────────────────────────────────────────────────────
  HOOK: Simplified approach to fetch all tokens with tokenUri and balances
──────────────────────────────────────────────────────────────────────────── */

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
      staleTime: 30_000, // treat result as “fresh” for 30 s
      // cacheTime not recognised in wagmi’s narrowed types
    },
  });

  // More robust ETH balance handling
  useEffect(() => {
    if (!address) return; // nothing to do when wallet disconnected

    setTokens((prev) => {
      // find current ETH token inside existing list (if any)
      const prevEth = prev.find((t) => t.id === null) ?? ETH_TOKEN;
      const prevBal = prevEth.balance;

      // keep old balance while a new query is still loading
      const newBal =
        ethBalanceSuccess && ethBalance ? ethBalance.value : prevBal;

      // if the balance really hasn’t changed, bail out early → no re-render flicker
      if (newBal === prevBal) return prev;

      // otherwise create a *single* new ETH token object
      const nextEth = { ...prevEth, balance: newBal };

      // return new tokens array with stable references for the rest
      return [nextEth, ...prev.filter((t) => t.id !== null)];
    });
  }, [address, ethBalance, ethBalanceSuccess]);

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

  return { tokens, loading, error, isEthBalanceFetching, refetchEthBalance };
};

/* ────────────────────────────────────────────────────────────────────────────
  ENHANCED TOKEN SELECTOR: With thumbnail display
──────────────────────────────────────────────────────────────────────────── */
// Memoize the TokenSelector to prevent unnecessary re-renders when input values change
const TokenSelector = React.memo(
  ({
    selectedToken,
    tokens,
    onSelect,
    isEthBalanceFetching = false,
  }: {
    selectedToken: TokenMeta;
    tokens: TokenMeta[];
    onSelect: (token: TokenMeta) => void;
    isEthBalanceFetching?: boolean;
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const selectedValue = selectedToken.id?.toString() ?? "eth";

    // Handle selection change
    const handleSelect = (token: TokenMeta) => {
      onSelect(token);
      setIsOpen(false);
    };

    // Helper functions for formatting and display

    // Enhanced format token balance function with special handling for ETH
    const formatBalance = (token: TokenMeta) => {
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
            const scientificNotation = ethValue.toExponential(4);
            return scientificNotation;
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

    // Get initials for fallback display
    const getInitials = (symbol: string) => {
      return symbol.slice(0, 2).toUpperCase();
    };

    // Color map for token initials - matching your screenshot
    const getColorForSymbol = (symbol: string) => {
      const symbolKey = symbol.toLowerCase();
      const colorMap: Record<string, { bg: string; text: string }> = {
        eth: { bg: "bg-black", text: "text-white" },
        za: { bg: "bg-red-500", text: "text-white" },
        pe: { bg: "bg-green-700", text: "text-white" },
        ro: { bg: "bg-red-700", text: "text-white" },
        "..": { bg: "bg-gray-800", text: "text-white" },
      };

      const initials = symbolKey.slice(0, 2);
      return colorMap[initials] || { bg: "bg-yellow-500", text: "text-white" };
    };

    // Custom token image display with improved caching and fallbacks
    // Memoize the TokenImage to prevent re-renders when parent re-renders
    const TokenImage = React.memo(
      ({ token }: { token: TokenMeta }) => {
        const [imageLoaded, setImageLoaded] = useState(false);
        const [imageError, setImageError] = useState(false);
        const [actualImageUrl, setActualImageUrl] = useState<string | null>(
          null,
        );
        const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());
        const [alternativeUrls, setAlternativeUrls] = useState<string[]>([]);
        const { bg, text } = getColorForSymbol(token.symbol);

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
              // Handle IPFS URIs
              const uri = token.tokenUri.startsWith("ipfs://")
                ? `https://content.wrappr.wtf/ipfs/${token.tokenUri.slice(7)}`
                : token.tokenUri;

              // Generate alternative URLs for fallbacks
              if (token.tokenUri.startsWith("ipfs://")) {
                const hash = token.tokenUri.slice(7);
                setAlternativeUrls([
                  `https://cloudflare-ipfs.com/ipfs/${hash}`,
                  `https://ipfs.io/ipfs/${hash}`,
                  `https://gateway.pinata.cloud/ipfs/${hash}`,
                  `https://ipfs.fleek.co/ipfs/${hash}`,
                ]);
              }

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
                    // Handle IPFS image URL
                    const formattedUrl = imageUrl.startsWith("ipfs://")
                      ? `https://content.wrappr.wtf/ipfs/${imageUrl.slice(7)}`
                      : imageUrl;

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
        }, [token.tokenUri, token.symbol, token.id, cacheKey]);

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
        }, [alternativeUrls, failedUrls, token.symbol]);

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
          className="flex items-center gap-2 cursor-pointer bg-transparent border border-yellow-200 rounded-md px-2 py-1 hover:bg-yellow-50 touch-manipulation"
        >
          <TokenImage token={selectedToken} />
          <div className="flex flex-col">
            <div className="flex items-center gap-1">
              <span className="font-medium">{selectedToken.symbol}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="text-xs font-medium text-gray-700 min-w-[50px] h-[14px]">
                {formatBalance(selectedToken)}
                {selectedToken.id === null && isEthBalanceFetching && (
                  <span
                    className="text-xs text-yellow-500 ml-1"
                    style={{ animation: "pulse 1.5s infinite" }}
                  >
                    ·
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
            className="absolute z-20 mt-1 w-[calc(100vw-40px)] sm:w-64 max-h-[60vh] sm:max-h-96 overflow-y-auto bg-white border border-yellow-200 shadow-lg rounded-md"
            style={{ contain: "content" }}
          >
            {/* Search input */}
            <div className="sticky top-0 bg-white p-2 border-b border-yellow-100">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by symbol or ID..."
                  onChange={(e) => {
                    // Use memo version for faster search - throttle search for better performance
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
                      // Get all token items by data attribute - limit to visible ones first
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
                        visibleItems.length > 0 ? visibleItems : allItems;

                      // Use more efficient iteration
                      const itemsArray = Array.from(itemsToSearch);
                      let anyVisible = false;

                      // First pass - show matches
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
                          anyVisible = true;
                        } else {
                          item.classList.add("hidden");
                        }
                      }

                      // For USDT searches, ensure we always check for USDT even if no visible items match
                      if (isStableSearch && !anyVisible) {
                        const usdtItem = document.querySelector(
                          "[data-token-symbol='USDT']",
                        );
                        if (usdtItem) {
                          usdtItem.classList.remove("hidden");
                          anyVisible = true;
                        }
                      }

                      // If nothing is visible with current search, try again with all items
                      if (!anyVisible && visibleItems.length > 0) {
                        const allItemsArray = Array.from(allItems);
                        for (let i = 0; i < allItemsArray.length; i++) {
                          const item = allItemsArray[i];
                          const symbol =
                            item
                              .getAttribute("data-token-symbol")
                              ?.toLowerCase() || "";
                          const name =
                            item
                              .getAttribute("data-token-name")
                              ?.toLowerCase() || "";
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
                      }
                    });
                  }}
                  className="w-full p-2 pl-8 border border-yellow-200 rounded focus:outline-none focus:ring-2 focus:ring-yellow-300 text-sm"
                />
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
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

            {/* Pre-compute token list items for better performance with content visibility optimization */}
            <div
              className="virtualized-token-list"
              style={{
                contentVisibility: "auto",
                containIntrinsicSize: "0 5000px",
                contain: "content",
              }}
            >
              {tokens.map((token) => {
                const isSelected =
                  (token.id === null && selectedValue === "eth") ||
                  (token.id !== null && token.id.toString() === selectedValue);

                // Memoize reserve formatting to improve performance
                const formatReserves = (token: TokenMeta) => {
                  if (token.id === null) return "";

                  // Cache key for this computation
                  const cacheKey = `reserve-format-${token.id}`;
                  try {
                    const cached = sessionStorage.getItem(cacheKey);
                    if (cached) return cached;
                  } catch (e) {
                    // Ignore storage errors
                  }

                  // Format the custom fee if available (as percentage)
                  const feePercentage = token.swapFee
                    ? Number(token.swapFee) / 100
                    : 1; // Default is 1%

                  // Format fee: For 0.3% (USDT), display it without trailing zeros
                  // For integer percentages like 1%, show without decimal places
                  let feeStr;
                  if (feePercentage % 1 === 0) {
                    // Integer percentage (e.g., 1%)
                    feeStr = `${feePercentage.toFixed(0)}%`;
                  } else if ((feePercentage * 10) % 1 === 0) {
                    // One decimal place needed (e.g., 0.3%)
                    feeStr = `${feePercentage.toFixed(1)}%`;
                  } else {
                    // Two decimal places (e.g., 0.25%)
                    feeStr = `${feePercentage.toFixed(2)}%`;
                  }

                  // Handle special case for USDT (6 decimals)
                  const tokenDecimals = token.decimals || 18;

                  // If no liquidity data available or zero liquidity
                  if (!token.liquidity || token.liquidity === 0n) {
                    // Fall back to reserves if available
                    if (token.reserve0 && token.reserve0 > 0n) {
                      // Format ETH reserves to a readable format
                      const ethValue = Number(formatEther(token.reserve0));
                      let reserveStr = "";

                      if (ethValue >= 1000) {
                        reserveStr = `${Math.floor(ethValue).toLocaleString()} ETH`;
                      } else if (ethValue >= 1.0) {
                        reserveStr = `${ethValue.toFixed(3)} ETH`;
                      } else if (ethValue >= 0.001) {
                        reserveStr = `${ethValue.toFixed(4)} ETH`;
                      } else if (ethValue >= 0.0001) {
                        reserveStr = `${ethValue.toFixed(6)} ETH`;
                      } else if (ethValue > 0) {
                        reserveStr = `${ethValue.toFixed(8)} ETH`;
                      }

                      const result = `${reserveStr} • ${feeStr}`;
                      try {
                        sessionStorage.setItem(cacheKey, result);
                      } catch (e) {
                        // Ignore storage errors
                      }
                      return result;
                    }

                    const result = `No liquidity • ${feeStr}`;
                    try {
                      sessionStorage.setItem(cacheKey, result);
                    } catch (e) {
                      // Ignore storage errors
                    }
                    return result;
                  }

                  // Format the reserves
                  // For custom pools like USDT-ETH, format differently
                  let reserveStr = "";

                  if (token.isCustomPool) {
                    // Show both reserves
                    const ethReserveValue = Number(
                      formatEther(token.reserve0 || 0n),
                    );
                    const tokenReserveValue = Number(
                      formatUnits(token.reserve1 || 0n, tokenDecimals),
                    );

                    let ethStr = "";
                    if (ethReserveValue >= 10000) {
                      ethStr = `${Math.floor(ethReserveValue / 1000)}K ETH`;
                    } else if (ethReserveValue >= 1000) {
                      ethStr = `${(ethReserveValue / 1000).toFixed(1)}K ETH`;
                    } else if (ethReserveValue >= 1.0) {
                      ethStr = `${ethReserveValue.toFixed(2)} ETH`;
                    } else if (ethReserveValue > 0) {
                      ethStr = `${ethReserveValue.toFixed(4)} ETH`;
                    }

                    let tokenStr = "";
                    if (tokenReserveValue >= 1000000) {
                      tokenStr = `${Math.floor(tokenReserveValue / 1000000)}M ${token.symbol}`;
                    } else if (tokenReserveValue >= 1000) {
                      tokenStr = `${Math.floor(tokenReserveValue / 1000)}K ${token.symbol}`;
                    } else {
                      tokenStr = `${tokenReserveValue.toFixed(2)} ${token.symbol}`;
                    }

                    // For USDT-ETH pool, format reserves with more clarity
                    if (token.token1 === USDT_ADDRESS) {
                      reserveStr = `${ethStr} • ${tokenStr} • ${feeStr}`;
                    } else {
                      reserveStr = `${ethStr} / ${tokenStr}`;
                    }
                  } else {
                    // Regular token pools
                    const ethReserveValue = Number(
                      formatEther(token.reserve0 || 0n),
                    );

                    if (ethReserveValue >= 10000) {
                      reserveStr = `${Math.floor(ethReserveValue / 1000)}K ETH`;
                    } else if (ethReserveValue >= 1000) {
                      reserveStr = `${(ethReserveValue / 1000).toFixed(1)}K ETH`;
                    } else if (ethReserveValue >= 1.0) {
                      reserveStr = `${ethReserveValue.toFixed(2)} ETH`;
                    } else if (ethReserveValue >= 0.001) {
                      reserveStr = `${ethReserveValue.toFixed(4)} ETH`;
                    } else if (ethReserveValue > 0) {
                      reserveStr = `${ethReserveValue.toFixed(6)} ETH`;
                    } else {
                      const result = `No ETH reserves • ${feeStr}`;
                      try {
                        sessionStorage.setItem(cacheKey, result);
                        return result;
                      } catch (e) {
                        // Ignore storage errors
                        return result;
                      }
                    }
                  }

                  // If we have reserveStr, return the result with the fee
                  const result = `${reserveStr} • ${feeStr}`;
                  try {
                    sessionStorage.setItem(cacheKey, result);
                  } catch (e) {
                    // Ignore storage errors
                  }
                  return result;
                };

                const reserves = formatReserves(token);
                const balance = formatBalance(token);

                return (
                  <div
                    key={token.id?.toString() ?? "eth"}
                    onClick={() => handleSelect(token)}
                    data-token-symbol={token.symbol}
                    data-token-name={token.name}
                    data-token-id={token.id?.toString() ?? "eth"}
                    className={`flex items-center justify-between p-3 sm:p-2 hover:bg-yellow-50 cursor-pointer touch-manipulation ${
                      isSelected ? "bg-yellow-100" : ""
                    }`}
                    style={{
                      contentVisibility: "auto",
                      containIntrinsicSize: "0 50px",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <TokenImage token={token} />
                      <div className="flex flex-col">
                        <span className="font-medium">{token.symbol}</span>
                        {reserves && (
                          <span className="text-xs text-gray-500">
                            {reserves}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right min-w-[60px]">
                      <div className="text-sm font-medium h-[18px]">
                        {balance}
                        {token.id === null && isEthBalanceFetching && (
                          <span
                            className="text-xs text-yellow-500 ml-1"
                            style={{ animation: "pulse 1.5s infinite" }}
                          >
                            ·
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
    // Custom comparison function to prevent unnecessary re-renders
    // Only re-render if token identity or selection state changes
    return (
      prevProps.selectedToken.id === nextProps.selectedToken.id &&
      prevProps.tokens.length === nextProps.tokens.length &&
      prevProps.isEthBalanceFetching === nextProps.isEthBalanceFetching
    );
  },
);

/* ────────────────────────────────────────────────────────────────────────────
  Mode types and constants
──────────────────────────────────────────────────────────────────────────── */
type TileMode = "swap" | "liquidity";
type LiquidityMode = "add" | "remove" | "single-eth";

/* ────────────────────────────────────────────────────────────────────────────
  SwapTile main component
──────────────────────────────────────────────────────────────────────────── */
export const SwapTile = () => {
  const {
    tokens,
    loading,
    error: loadError,
    isEthBalanceFetching,
    refetchEthBalance,
  } = useAllTokens();
  const [sellToken, setSellToken] = useState<TokenMeta>(ETH_TOKEN);
  const [buyToken, setBuyToken] = useState<TokenMeta | null>(null);
  const [mode, setMode] = useState<TileMode>("swap");
  const [liquidityMode, setLiquidityMode] = useState<LiquidityMode>("add");

  // Slippage settings with defaults
  const [slippageBps, setSlippageBps] = useState<bigint>(DEFAULT_SLIPPAGE_BPS);
  const [singleEthSlippageBps, setSingleEthSlippageBps] = useState<bigint>(
    DEFAULT_SINGLE_ETH_SLIPPAGE_BPS,
  );
  const [showSlippageSettings, setShowSlippageSettings] =
    useState<boolean>(false);

  // Price chart visibility
  const [showPriceChart, setShowPriceChart] = useState<boolean>(false);

  // Helper functions for slippage calculation
  const withSlippage = (amount: bigint) =>
    getAmountWithSlippage(amount, slippageBps);
  const withSingleEthSlippage = (amount: bigint) =>
    getAmountWithSlippage(amount, singleEthSlippageBps);

  // Single-ETH estimation values
  const [singleETHEstimatedCoin, setSingleETHEstimatedCoin] =
    useState<string>("");

  // Track ETH balance separately to ensure it's always maintained correctly
  const [ethBalance, setEthBalance] = useState<bigint | undefined>(undefined);

  // When switching to single-eth mode, ensure ETH is selected as the sell token
  // and set a default target token if none is selected
  useEffect(() => {
    if (mode === "liquidity" && liquidityMode === "single-eth") {
      // If current sell token is not ETH, set it to ETH
      if (sellToken.id !== null) {
        // Find ETH token in tokens list
        const ethToken = tokens.find((t) => t.id === null);

        if (ethToken) {
          // Create a new ETH token but ensure it has the correct balance
          // Use our tracked ethBalance instead of potentially incorrect token.balance
          const safeEthToken = {
            ...ethToken,
            balance: ethBalance !== undefined ? ethBalance : ethToken.balance,
          };

          // Set the sell token to ETH with the safe balance
          setSellToken(safeEthToken);
        }
      } else if (
        sellToken.id === null &&
        ethBalance !== undefined &&
        sellToken.balance !== ethBalance
      ) {
        // If ETH is already selected but has wrong balance, update it
        setSellToken((prev) => ({
          ...prev,
          balance: ethBalance,
        }));
      }

      // If no target token is selected or it's ETH (but not a custom pool like USDT), set a default non-ETH token
      if (!buyToken || (buyToken.id === null && !buyToken.isCustomPool)) {
        // Find the first non-ETH token with the highest liquidity
        // Also include custom pools like USDT even if their ID is 0
        const defaultTarget = tokens.find(
          (token) => token.id !== null || token.isCustomPool,
        );
        if (defaultTarget) {
          setBuyToken(defaultTarget);
        }
      }
    }
  }, [mode, liquidityMode, tokens, sellToken, buyToken, ethBalance]);
  const [lpTokenBalance, setLpTokenBalance] = useState<bigint>(0n);
  const [lpBurnAmount, setLpBurnAmount] = useState<string>("");

  // Get wagmi hooks
  const { address, isConnected } = useAccount();

  // Get the public client for contract interactions
  const publicClient = usePublicClient({ chainId: mainnet.id });

  // Debug info
  const tokenCount = tokens.length;

  // Set initial buyToken once tokens are loaded
  useEffect(() => {
    if (!buyToken && tokens.length > 1) {
      setBuyToken(tokens[1]);
    }
  }, [tokens, buyToken]);

  // Any additional setup can go here

  // Create a memoized version of tokens that doesn't change with every render
  const memoizedTokens = React.useMemo(() => tokens, [tokens]);

  // Also create a memoized version of non-ETH tokens to avoid conditional hook calls
  const memoizedNonEthTokens = React.useMemo(
    () => memoizedTokens.filter((token) => token.id !== null),
    [memoizedTokens],
  );

  // Define transaction-related state upfront to avoid reference errors
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);

  // Enhanced hook to keep ETH token state in sync with refresh-resistant behavior
  useEffect(() => {
    if (memoizedTokens.length === 0) return;

    const updatedEthToken = memoizedTokens.find((token) => token.id === null);
    if (!updatedEthToken) return;

    // Update sellToken if it's ETH, preserving balance whenever possible
    if (sellToken.id === null) {
      // Only update if the balance has changed from non-zero to different non-zero
      // or from zero/undefined to a real value
      const shouldUpdate =
        (updatedEthToken.balance &&
          updatedEthToken.balance > 0n &&
          (!sellToken.balance ||
            sellToken.balance === 0n ||
            updatedEthToken.balance !== sellToken.balance)) ||
        // Or if the updated token has no balance but we previously had one, keep the old one
        ((!updatedEthToken.balance || updatedEthToken.balance === 0n) &&
          sellToken.balance &&
          sellToken.balance > 0n);

      if (shouldUpdate) {
        // Update ETH token with balance changes

        // If the updated token has no balance but we already have one, merge them
        if (
          (!updatedEthToken.balance || updatedEthToken.balance === 0n) &&
          sellToken.balance &&
          sellToken.balance > 0n
        ) {
          setSellToken({
            ...updatedEthToken,
            balance: sellToken.balance,
          });
        } else {
          setSellToken(updatedEthToken);
        }
      }
    }

    // Update buyToken if it's ETH with similar logic
    if (buyToken && buyToken.id === null) {
      const shouldUpdate =
        (updatedEthToken.balance &&
          updatedEthToken.balance > 0n &&
          (!buyToken.balance ||
            buyToken.balance === 0n ||
            updatedEthToken.balance !== buyToken.balance)) ||
        ((!updatedEthToken.balance || updatedEthToken.balance === 0n) &&
          buyToken.balance &&
          buyToken.balance > 0n);

      if (shouldUpdate) {
        // Update buyToken ETH balance

        if (
          (!updatedEthToken.balance || updatedEthToken.balance === 0n) &&
          buyToken.balance &&
          buyToken.balance > 0n
        ) {
          setBuyToken({
            ...updatedEthToken,
            balance: buyToken.balance,
          });
        } else {
          setBuyToken(updatedEthToken);
        }
      }
    }
  }, [tokens]);

  // Enhanced token selection handlers with error clearing, memoized to prevent re-renders
  const handleSellTokenSelect = useCallback(
    (token: TokenMeta) => {
      // Clear any errors when changing tokens
      if (txError) setTxError(null);
      // Reset input values to prevent stale calculations
      setSellAmt("");
      setBuyAmt("");
      // Set the new token
      setSellToken(token);
    },
    [txError],
  );

  const handleBuyTokenSelect = useCallback(
    (token: TokenMeta) => {
      // Clear any errors when changing tokens
      if (txError) setTxError(null);
      // Reset input values to prevent stale calculations
      setSellAmt("");
      setBuyAmt("");
      // Set the new token
      setBuyToken(token);
    },
    [txError],
  );

  const flipTokens = () => {
    if (!buyToken) return;

    // Clear any errors when flipping tokens
    if (txError) setTxError(null);

    // Reset input values to prevent stale calculations
    setSellAmt("");
    setBuyAmt("");

    // Enhanced flip with better state handling
    const tempToken = sellToken;
    setSellToken(buyToken);
    setBuyToken(tempToken);

    // Ensure wallet connection is properly tracked during token swaps
    // This helps avoid "lost connection" errors when rapidly changing tokens
    if (address && isConnected) {
      sessionStorage.setItem("lastConnectedAddress", address);
    }
  };

  /* derived flags */
  const canSwap =
    sellToken &&
    buyToken &&
    // Special case for USDT custom pool
    (sellToken.isCustomPool ||
      buyToken?.isCustomPool ||
      // Original cases: ETH → Coin or Coin → ETH
      sellToken.id === null ||
      buyToken.id === null ||
      // New case: Coin → Coin (different IDs)
      (sellToken.id !== null &&
        buyToken?.id !== null &&
        sellToken.id !== buyToken.id));
  const isSellETH = sellToken.id === null;
  // For custom USDT-ETH pool, we need special logic to determine if it's a multihop
  // Check if either token is USDT by symbol instead of relying on token1
  const isSellUSDT = sellToken.isCustomPool && sellToken.symbol === "USDT";
  const isBuyUSDT = buyToken?.isCustomPool && buyToken?.symbol === "USDT";

  // USDT-ETH direct swaps (either direction) should NOT be treated as multihop
  const isDirectUsdtEthSwap =
    // ETH <-> USDT direct swap
    (sellToken.id === null && isBuyUSDT) ||
    (buyToken?.id === null && isSellUSDT);

  // Log the direct USDT swap detection for debugging
  if (sellToken.isCustomPool || buyToken?.isCustomPool) {
    console.log("ETH-USDT Swap Detection:", {
      isDirectUsdtEthSwap,
      sellIsETH: sellToken.id === null,
      buyIsETH: buyToken?.id === null,
      sellIsCustom: sellToken.isCustomPool,
      buyIsCustom: buyToken?.isCustomPool,
      isSellUSDT,
      isBuyUSDT,
      sellSymbol: sellToken.symbol,
      buySymbol: buyToken?.symbol,
    });
  }

  const isCoinToCoin =
    // Regular coin-to-coin logic (both have non-null IDs and different IDs)
    (sellToken.id !== null &&
      buyToken?.id !== null &&
      buyToken?.id !== undefined &&
      sellToken.id !== buyToken.id) ||
    // Handle custom pools only when they're part of a multi-hop (non-direct) swap
    ((sellToken.isCustomPool || buyToken?.isCustomPool) &&
      !isDirectUsdtEthSwap);
  // Ensure coinId is always a valid bigint, never undefined
  // Special case: if dealing with a custom pool like USDT, we need to use 0n but mark it as valid
  const isCustomPool = sellToken?.isCustomPool || buyToken?.isCustomPool;
  let coinId;

  if (isCustomPool) {
    // For custom pools, use the non-ETH token's ID
    if (isSellETH) {
      coinId = buyToken?.id ?? 0n;
    } else {
      coinId = sellToken?.id ?? 0n;
    }
    console.log("Using custom pool coinId:", coinId?.toString());
  } else {
    // For regular pools, ensure valid non-zero ID
    coinId =
      (isSellETH
        ? buyToken?.id !== undefined
          ? buyToken.id
          : 0n
        : sellToken.id) ?? 0n;
  }

  /* user inputs */
  const [sellAmt, setSellAmt] = useState("");
  const [buyAmt, setBuyAmt] = useState("");

  /* additional wagmi hooks */
  const {
    writeContractAsync,
    isPending,
    error: writeError,
  } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const chainId = useChainId();

  // Update ethBalance when ETH token balance changes in tokens array
  useEffect(() => {
    const ethToken = tokens.find((t) => t.id === null);
    if (
      ethToken &&
      (ethBalance === undefined || ethToken.balance !== ethBalance)
    ) {
      setEthBalance(ethToken.balance);
    }
  }, [tokens, ethBalance]);

  // Get direct ETH balance from wagmi
  const { data: wagmiEthBalance } = useBalance({
    address,
    chainId: mainnet.id,
    scopeKey: "wagmiEthBalance",
  });

  // Update our tracked ETH balance when direct ETH balance changes - with caching
  useEffect(() => {
    if (isConnected && wagmiEthBalance && wagmiEthBalance.value !== undefined) {
      setEthBalance(wagmiEthBalance.value);

      // Only try to cache if we have an address
      if (address) {
        try {
          const ethCacheKey = `coinchan_eth_${address}`;
          const ethCacheTimestampKey = `${ethCacheKey}_timestamp`;

          localStorage.setItem(ethCacheKey, wagmiEthBalance.value.toString());
          localStorage.setItem(ethCacheTimestampKey, Date.now().toString());
        } catch (e) {
          // Cache error, can continue without caching
        }
      }
    }
  }, [isConnected, wagmiEthBalance, address]);

  useEffect(() => {
    if (isSuccess) {
      // Refresh ETH balance
      refetchEthBalance();

      // Refresh token balances with caching to improve performance
      const refreshTokenBalances = async () => {
        if (!publicClient || !address) return;

        try {
          // Wait a moment for transaction to fully propagate
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Refresh balances for the specific tokens involved in the transaction
          const tokensToRefresh = [sellToken, buyToken].filter(
            (t) => t && t.id !== null,
          );

          // Only continue if we have tokens to refresh
          if (tokensToRefresh.length > 0) {
            // Fetch updated balances
            const balancePromises = tokensToRefresh.map(async (token) => {
              if (!token || token.id === null) return null;

              try {
                // Get the user's balance of this specific token
                const newBalance = await publicClient.readContract({
                  address: CoinsAddress,
                  abi: CoinsAbi,
                  functionName: "balanceOf",
                  args: [address, token.id],
                });

                // Cache the balance
                const balanceCacheKey = `coinchan_token_balance_${address}_${token.id}`;
                const balanceCacheTimestampKey = `${balanceCacheKey}_timestamp`;

                try {
                  localStorage.setItem(balanceCacheKey, newBalance.toString());
                  localStorage.setItem(
                    balanceCacheTimestampKey,
                    Date.now().toString(),
                  );
                } catch (e) {
                  // Cache error, continue without caching
                }

                return {
                  id: token.id,
                  balance: newBalance as bigint,
                };
              } catch (error) {
                // Failed to get balance
                return null;
              }
            });

            await Promise.all(balancePromises);
          }

          // Force a refresh of ETH balance
          refetchEthBalance();
        } catch (error) {
          // Failed to refresh token balances
        }
      };

      refreshTokenBalances();
    }
  }, [
    isSuccess,
    refetchEthBalance,
    publicClient,
    address,
    sellToken,
    buyToken,
  ]);

  // Create ref outside the effect to maintain persistence between renders
  const prevPairRef = useRef<string | null>(null);

  // Reset UI state when tokens change
  useEffect(() => {
    // Get the current pair of tokens (regardless of buy/sell order)
    const currentPair = [sellToken.id, buyToken?.id].sort().toString();

    // Get previous pair from ref
    const prevPair = prevPairRef.current;

    // Only reset price chart if the actual pair changes (not just flip)
    if (prevPair !== null && prevPair !== currentPair) {
      setShowPriceChart(false);
    }

    // Always reset chart visibility when mode changes
    if (mode === "liquidity") {
      setShowPriceChart(false);
    }

    // Update the ref with current pair
    prevPairRef.current = currentPair;

    // Reset transaction data
    setTxHash(undefined);
    setTxError(null);

    // Reset amounts
    setSellAmt("");
    setBuyAmt("");
  }, [sellToken.id, buyToken?.id, mode, liquidityMode]);

  /* Calculate pool reserves */
  const [reserves, setReserves] = useState<{
    reserve0: bigint;
    reserve1: bigint;
  } | null>(null);
  const [targetReserves, setTargetReserves] = useState<{
    reserve0: bigint;
    reserve1: bigint;
  } | null>(null);

  // Fetch reserves directly
  useEffect(() => {
    const fetchReserves = async () => {
      // Check if we're dealing with a custom pool (like USDT)
      const isCustomPool = sellToken?.isCustomPool || buyToken?.isCustomPool;

      // Skip fetch for invalid params, but explicitly allow custom pools even with id: 0n
      if (!publicClient) {
        // Skip if no publicClient available
        return;
      }

      // For regular coins (not custom pools), skip if coinId is invalid
      if (!isCustomPool && (!coinId || coinId === 0n)) {
        // Skip reserves fetch for invalid regular coin params
        return;
      }

      // Log for debugging
      console.log(
        "Fetching reserves for:",
        isCustomPool ? "custom pool" : `coinId: ${coinId}`,
      );

      try {
        let poolId;

        // Use the custom pool ID for USDT or similar custom pools
        if (isCustomPool) {
          const customToken = sellToken?.isCustomPool ? sellToken : buyToken;
          poolId = customToken?.poolId || USDT_POOL_ID;
        } else {
          // Regular pool ID
          poolId = computePoolId(coinId);
        }

        const result = await publicClient.readContract({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "pools",
          args: [poolId],
        });

        // Handle the returned data structure correctly
        // The contract might return more fields than just the reserves
        // Cast to unknown first, then extract the reserves from the array
        const poolData = result as unknown as readonly bigint[];

        setReserves({
          reserve0: poolData[0],
          reserve1: poolData[1],
        });
      } catch (err) {
        // Failed to fetch reserves
        setReserves(null);
      }
    };

    fetchReserves();
  }, [
    coinId,
    publicClient,
    sellToken?.isCustomPool,
    buyToken?.isCustomPool,
    sellToken?.poolId,
    buyToken?.poolId,
  ]);

  // Fetch target reserves for coin-to-coin swaps
  useEffect(() => {
    const fetchTargetReserves = async () => {
      // Allow custom pools with id: 0n but require a valid pool ID
      const isTargetCustomPool = buyToken?.isCustomPool;

      // First check if public client is available
      if (!publicClient) return;

      // Then check if this is a coin-to-coin swap
      if (!isCoinToCoin) return;

      // For regular tokens (not custom pools), make sure we have a valid ID
      if (!isTargetCustomPool && (!buyToken?.id || buyToken.id === 0n)) return;

      // Log for debugging
      console.log(
        "Fetching target reserves for:",
        isTargetCustomPool
          ? "custom target pool"
          : `target coinId: ${buyToken?.id}`,
      );

      try {
        let targetPoolId;

        // Use custom pool ID for special tokens like USDT
        if (isTargetCustomPool && buyToken?.poolId) {
          targetPoolId = buyToken.poolId;
        } else {
          // Regular pool ID
          targetPoolId = computePoolId(buyToken.id!);
        }

        const result = await publicClient.readContract({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "pools",
          args: [targetPoolId],
        });

        const poolData = result as unknown as readonly bigint[];

        setTargetReserves({
          reserve0: poolData[0],
          reserve1: poolData[1],
        });
      } catch (err) {
        console.error("Failed to fetch target reserves:", err);
        setTargetReserves(null);
      }
    };

    fetchTargetReserves();
  }, [
    isCoinToCoin,
    buyToken?.id,
    publicClient,
    buyToken?.isCustomPool,
    buyToken?.poolId,
  ]);

  // Fetch LP token balance when a pool is selected and user is connected
  useEffect(() => {
    const fetchLpBalance = async () => {
      // Special handling for custom pools like USDT-ETH which may have ID=0
      const isCustomPool = sellToken?.isCustomPool || buyToken?.isCustomPool;

      // Don't early return for custom pools with ID=0
      if (!address || !publicClient) return;
      if (!isCustomPool && (!coinId || coinId === 0n)) return;

      try {
        // Calculate the pool ID - different method for custom pools
        let poolId;

        if (isCustomPool) {
          // Use the custom token's poolId if available
          const customToken = sellToken?.isCustomPool ? sellToken : buyToken;
          poolId = customToken?.poolId || USDT_POOL_ID;
          console.log(
            "Fetching LP balance for custom pool:",
            customToken?.symbol,
            "pool ID:",
            poolId.toString(),
          );
        } else {
          // Regular pool ID calculation
          poolId = computePoolId(coinId);
        }

        // Read the user's LP token balance for this pool
        const balance = (await publicClient.readContract({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "balanceOf",
          args: [address, poolId],
        })) as bigint;

        console.log(
          "LP token balance:",
          formatUnits(balance, 18),
          "for pool ID:",
          poolId.toString(),
        );
        setLpTokenBalance(balance);
      } catch (err) {
        console.error("Failed to fetch LP token balance:", err);
        setLpTokenBalance(0n);
      }
    };

    fetchLpBalance();
  }, [
    address,
    publicClient,
    coinId,
    sellToken?.isCustomPool,
    buyToken?.isCustomPool,
    sellToken?.poolId,
    buyToken?.poolId,
  ]);

  /* Check if user has approved ZAAM as operator */
  const [isOperator, setIsOperator] = useState<boolean | null>(null);
  const [usdtAllowance, setUsdtAllowance] = useState<bigint | null>(null);

  // Function to check USDT allowance - available in global scope
  const checkUsdtAllowance = async () => {
    if (!address || !publicClient) return null;

    try {
      // Make sure publicClient is fully initialized
      if (!publicClient.chain) {
        console.log(
          "Skipping USDT allowance check - publicClient not fully initialized",
        );
        return null;
      }

      console.log("Checking USDT allowance for address:", address);

      // ERC20 allowance check
      const allowance = await publicClient.readContract({
        address: USDT_ADDRESS,
        abi: [
          {
            inputs: [
              { internalType: "address", name: "owner", type: "address" },
              { internalType: "address", name: "spender", type: "address" },
            ],
            name: "allowance",
            outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "allowance",
        args: [address, ZAAMAddress],
      });

      console.log("USDT allowance result:", (allowance as bigint).toString());
      setUsdtAllowance(allowance as bigint);
      return allowance as bigint;
    } catch (error) {
      // Log but don't crash - defaulting to 0 allowance is safe
      console.log(
        "Error checking USDT allowance, defaulting to 0:",
        error instanceof Error ? error.message : "Unknown error",
      );
      setUsdtAllowance(0n);
      return 0n;
    }
  };

  // USDT allowance checking effect
  useEffect(() => {
    // Check for any USDT tokens
    const checkUsdtRelevance = async () => {
      if (!address || !publicClient) return;

      // Enhanced check for USDT tokens in any position
      const isUsdtRelevant =
        // Check for USDT token1 address match
        (sellToken.isCustomPool && sellToken.token1 === USDT_ADDRESS) ||
        (buyToken?.isCustomPool && buyToken?.token1 === USDT_ADDRESS) ||
        // Check for USDT by symbol
        sellToken.symbol === "USDT" ||
        buyToken?.symbol === "USDT" ||
        // Check for custom pool with ID=0 (USDT pool)
        (sellToken.isCustomPool && sellToken.id === 0n) ||
        (buyToken?.isCustomPool && buyToken?.id === 0n) ||
        // Check if we're in liquidity mode with USDT
        (mode === "liquidity" &&
          ((sellToken.isCustomPool && sellToken.token1 === USDT_ADDRESS) ||
            (buyToken?.isCustomPool && buyToken?.token1 === USDT_ADDRESS)));

      // Always log the check attempt
      console.log("Checking USDT allowance:", {
        isUsdtRelevant,
        sellTokenSymbol: sellToken.symbol,
        buyTokenSymbol: buyToken?.symbol,
        sellTokenIsCustom: sellToken.isCustomPool,
        sellTokenAddress: sellToken.token1,
      });

      if (isUsdtRelevant) {
        try {
          // Make sure publicClient is fully initialized
          if (!publicClient.chain) {
            console.log(
              "Skipping USDT allowance check - publicClient not fully initialized",
            );
            return;
          }

          console.log("Performing USDT allowance check...");

          // ERC20 allowance check
          const allowance = await publicClient.readContract({
            address: USDT_ADDRESS,
            abi: [
              {
                inputs: [
                  { internalType: "address", name: "owner", type: "address" },
                  { internalType: "address", name: "spender", type: "address" },
                ],
                name: "allowance",
                outputs: [
                  { internalType: "uint256", name: "", type: "uint256" },
                ],
                stateMutability: "view",
                type: "function",
              },
            ],
            functionName: "allowance",
            args: [address, ZAAMAddress],
          });

          console.log(
            "USDT allowance result:",
            (allowance as bigint).toString(),
          );
          setUsdtAllowance(allowance as bigint);
        } catch (error) {
          // Log but don't crash - defaulting to 0 allowance is safe
          console.log(
            "Error checking USDT allowance, defaulting to 0:",
            error instanceof Error ? error.message : "Unknown error",
          );
          setUsdtAllowance(0n);
        }
      }
    };

    const checkOperator = async () => {
      if (!address || !publicClient || isSellETH) return;

      try {
        const result = (await publicClient.readContract({
          address: CoinsAddress,
          abi: CoinsAbi,
          functionName: "isOperator",
          args: [address, ZAAMAddress],
        })) as boolean;

        setIsOperator(result);
      } catch (err) {
        console.error("Failed to check operator status:", err);
        setIsOperator(null);
      }
    };

    // Run checks without extracting unnecessary variables
    checkOperator();

    // Check if any USDT token is in use and check allowance if needed
    // Use an IIFE to allow async execution in useEffect
    (async () => {
      try {
        await checkUsdtRelevance();
      } catch (error) {
        console.error("Error checking USDT relevance:", error);
      }
    })();
  }, [
    address,
    isSellETH,
    publicClient,
    sellToken?.isCustomPool,
    sellToken?.token1,
    buyToken?.isCustomPool,
    buyToken?.token1,
    mode,
  ]);

  /* helpers to sync amounts */
  const syncFromSell = async (val: string) => {
    // In Remove Liquidity mode, track the LP burn amount separately
    if (mode === "liquidity" && liquidityMode === "remove") {
      setLpBurnAmount(val);

      // Calculate the expected token amounts based on the LP amount to burn
      if (!reserves || !val) {
        setSellAmt("");
        setBuyAmt("");
        return;
      }

      try {
        // Calculate the pool ID - different method for custom pools
        const customPoolUsed =
          sellToken?.isCustomPool || buyToken?.isCustomPool;
        let poolId;

        if (customPoolUsed) {
          // Use the custom token's poolId if available
          const customToken = sellToken?.isCustomPool ? sellToken : buyToken;
          poolId = customToken?.poolId || USDT_POOL_ID;
          console.log(
            "Getting pool info for custom pool:",
            customToken?.symbol,
            "pool ID:",
            poolId.toString(),
          );
        } else {
          // Regular pool ID calculation
          poolId = computePoolId(coinId);
        }

        const poolInfo = (await publicClient.readContract({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "pools",
          args: [poolId],
        })) as any;

        // Ensure we have pool data
        if (!poolInfo) return;

        // Extract supply from pool data (the 7th item in the array for this contract, index 6)
        const totalSupply = poolInfo[6] as bigint; // Pool struct has supply at index 6

        if (totalSupply === 0n) return;

        // Calculate proportional amount of tokens based on removeLiquidity calculation in ZAMM.sol
        const burnAmount = parseUnits(val || "0", 18);

        // Calculate amounts: amount0 = liquidity * reserve0 / totalSupply (from ZAMM.sol)
        // This is the mulDiv function in ZAMM.sol converted to TypeScript
        const ethAmount = (burnAmount * reserves.reserve0) / totalSupply;
        const tokenAmount = (burnAmount * reserves.reserve1) / totalSupply;

        // Log calculation details for debugging

        // Sanity checks
        if (ethAmount > reserves.reserve0 || tokenAmount > reserves.reserve1) {
          console.error("Error: Calculated redemption exceeds pool reserves!");
          setSellAmt("");
          setBuyAmt("");
          return;
        }

        // Update the input fields with the calculated values
        setSellAmt(ethAmount === 0n ? "" : formatEther(ethAmount));
        // Use the correct decimals for the token (6 for USDT, 18 for regular tokens)
        const tokenDecimals = customPoolUsed
          ? sellToken?.isCustomPool
            ? sellToken?.decimals || 6
            : buyToken?.decimals || 6
          : 18;

        console.log(
          "Preview calculation using decimals:",
          tokenDecimals,
          "for",
          sellToken?.isCustomPool ? sellToken?.symbol : buyToken?.symbol,
        );

        setBuyAmt(
          tokenAmount === 0n ? "" : formatUnits(tokenAmount, tokenDecimals),
        );
      } catch (err) {
        console.error("Error calculating remove liquidity amounts:", err);
        setSellAmt("");
        setBuyAmt("");
      }
      return;
    }

    // Single-ETH liquidity mode - estimate the token amount the user will get
    if (mode === "liquidity" && liquidityMode === "single-eth") {
      setSellAmt(val);
      // Allow custom pools like USDT with id=0
      if (
        !reserves ||
        !val ||
        !buyToken ||
        (buyToken.id === null && !buyToken.isCustomPool)
      ) {
        setSingleETHEstimatedCoin("");
        return;
      }

      try {
        // Get the pool ID for the selected token pair
        let poolId;

        // Check if this is a custom pool like USDT
        if (buyToken.isCustomPool && buyToken.poolId) {
          poolId = buyToken.poolId;
          console.log(
            "Using custom pool ID for Single-ETH estimation:",
            poolId.toString(),
          );
        } else {
          poolId = computePoolId(buyToken.id || 0n);
        }

        // Fetch fresh reserves for the selected token
        let targetReserves = { ...reserves };

        // If the token ID is different from the current reserves or we have a custom pool, fetch new reserves
        if (buyToken.id !== coinId || buyToken.isCustomPool) {
          try {
            const result = await publicClient?.readContract({
              address: ZAAMAddress,
              abi: ZAAMAbi,
              functionName: "pools",
              args: [poolId],
            });

            // If we have a result, use it; otherwise fall back to current reserves
            if (result) {
              const poolData = result as unknown as readonly bigint[];
              targetReserves = {
                reserve0: poolData[0],
                reserve1: poolData[1],
              };
            }
          } catch (err) {
            console.error(
              `Failed to fetch reserves for target token ${buyToken.id}:`,
              err,
            );
            // Continue with existing reserves as fallback
          }
        }

        // The contract will use half of the ETH to swap for tokens
        const halfEthAmount = parseEther(val || "0") / 2n;

        // Get correct swap fee for the token (30bps for USDT, default 100bps for regular tokens)
        const swapFee = buyToken?.isCustomPool
          ? buyToken.swapFee || SWAP_FEE
          : SWAP_FEE;

        console.log("Single-ETH estimation using:", {
          token: buyToken.symbol,
          ethAmount: formatEther(halfEthAmount),
          reserve0: formatEther(targetReserves.reserve0),
          reserve1: formatUnits(
            targetReserves.reserve1,
            buyToken.decimals || 18,
          ),
          swapFee: `${Number(swapFee) / 100}%`,
          isCustomPool: buyToken.isCustomPool,
        });

        // Estimate how many tokens we'll get for half the ETH
        const estimatedTokens = getAmountOut(
          halfEthAmount,
          targetReserves.reserve0,
          targetReserves.reserve1,
          swapFee,
        );

        // Update the estimated coin display
        if (estimatedTokens === 0n) {
          setSingleETHEstimatedCoin("");
        } else {
          // Use correct decimals for the token (6 for USDT, 18 for regular tokens)
          const tokenDecimals = buyToken?.isCustomPool
            ? buyToken.decimals || 18
            : 18;

          const formattedTokens = formatUnits(estimatedTokens, tokenDecimals);
          setSingleETHEstimatedCoin(formattedTokens);
        }
      } catch (err) {
        console.error("Error estimating Single-ETH token amount:", err);
        setSingleETHEstimatedCoin("");
      }
      return;
    }

    // Regular Add Liquidity or Swap mode
    setSellAmt(val);
    if (!canSwap || !reserves) return setBuyAmt("");

    try {
      // Different calculation paths based on swap type
      if (isCoinToCoin && targetReserves && buyToken?.id && sellToken.id) {
        // For coin-to-coin swaps, we need to estimate a two-hop swap
        try {
          // Dynamically import helper to avoid circular dependencies
          const { estimateCoinToCoinOutput } = await import("./lib/swapHelper");

          // Use correct decimals for the sell token (6 for USDT, 18 for regular coins)
          const sellTokenDecimals = sellToken?.decimals || 18;
          const inUnits = parseUnits(val || "0", sellTokenDecimals);

          // Get correct swap fees for both pools
          const sourceSwapFee = sellToken.isCustomPool
            ? sellToken.swapFee || SWAP_FEE
            : SWAP_FEE;
          const targetSwapFee = buyToken?.isCustomPool
            ? buyToken.swapFee || SWAP_FEE
            : SWAP_FEE;

          // Pass custom swap fees for USDT or other custom pools
          const { amountOut } = estimateCoinToCoinOutput(
            sellToken.id,
            buyToken.id,
            inUnits,
            reserves,
            targetReserves,
            slippageBps, // Pass the current slippage tolerance setting
            sourceSwapFee, // Pass source pool fee (could be 30n for USDT)
            targetSwapFee, // Pass target pool fee (could be 30n for USDT)
          );

          // Use correct decimals for the buy token (6 for USDT, 18 for regular coins)
          const buyTokenDecimals = buyToken?.decimals || 18;
          setBuyAmt(
            amountOut === 0n ? "" : formatUnits(amountOut, buyTokenDecimals),
          );
        } catch (err) {
          console.error("Error estimating coin-to-coin output:", err);
          setBuyAmt("");
        }
      } else if (isSellETH) {
        // ETH → Coin path
        const inWei = parseEther(val || "0");
        const outUnits = getAmountOut(
          inWei,
          reserves.reserve0,
          reserves.reserve1,
          SWAP_FEE,
        );
        // Use correct decimals for the buy token (6 for USDT, 18 for regular coins)
        const buyTokenDecimals = buyToken?.decimals || 18;
        setBuyAmt(
          outUnits === 0n ? "" : formatUnits(outUnits, buyTokenDecimals),
        );
      } else {
        // Coin → ETH path
        // Use correct decimals for the sell token (6 for USDT, 18 for regular coins)
        const sellTokenDecimals = sellToken?.decimals || 18;
        const inUnits = parseUnits(val || "0", sellTokenDecimals);
        const outWei = getAmountOut(
          inUnits,
          reserves.reserve1,
          reserves.reserve0,
          SWAP_FEE,
        );
        setBuyAmt(outWei === 0n ? "" : formatEther(outWei));
      }
    } catch {
      setBuyAmt("");
    }
  };

  const syncFromBuy = async (val: string) => {
    setBuyAmt(val);
    if (!canSwap || !reserves) return setSellAmt("");

    try {
      // Different calculation paths based on swap type
      if (isCoinToCoin) {
        // Calculating input from output for coin-to-coin is very complex
        // Would require a recursive solver to find the right input amount
        // For UI simplicity, we'll just clear the input and let the user adjust
        setSellAmt("");

        // Optional: Show a notification that this direction is not supported
      } else if (isSellETH) {
        // ETH → Coin path (calculate ETH input)
        // Use correct decimals for the buy token (6 for USDT, 18 for regular coins)
        const buyTokenDecimals = buyToken?.decimals || 18;
        const outUnits = parseUnits(val || "0", buyTokenDecimals);
        const inWei = getAmountIn(
          outUnits,
          reserves.reserve0,
          reserves.reserve1,
          SWAP_FEE,
        );
        setSellAmt(inWei === 0n ? "" : formatEther(inWei));
      } else {
        // Coin → ETH path (calculate Coin input)
        const outWei = parseEther(val || "0");
        const inUnits = getAmountIn(
          outWei,
          reserves.reserve1,
          reserves.reserve0,
          SWAP_FEE,
        );
        // Use correct decimals for the sell token (6 for USDT, 18 for regular coins)
        const sellTokenDecimals = sellToken?.decimals || 18;
        setSellAmt(
          inUnits === 0n ? "" : formatUnits(inUnits, sellTokenDecimals),
        );
      }
    } catch {
      setSellAmt("");
    }
  };

  /* perform swap */
  const nowSec = () => BigInt(Math.floor(Date.now() / 1000));

  // Function to approve USDT token for spending by ZAMM contract
  const approveUsdtToken = async () => {
    if (!address || !publicClient || !writeContractAsync) {
      setTxError("Wallet connection required");
      return false;
    }

    try {
      // We don't need to set the txError here since it's already set by the caller
      // (to maintain consistent UX with operator approval)
      console.log("Starting USDT approval process");

      // Standard ERC20 approval for a large amount (max uint256 value would be too gas intensive)
      // 2^64 should be plenty for most transactions (18.4 quintillion units)
      const approvalAmount = 2n ** 64n;

      console.log(
        "Requesting approval for USDT amount:",
        approvalAmount.toString(),
      );

      const hash = await writeContractAsync({
        address: USDT_ADDRESS,
        abi: [
          {
            inputs: [
              { internalType: "address", name: "spender", type: "address" },
              { internalType: "uint256", name: "amount", type: "uint256" },
            ],
            name: "approve",
            outputs: [{ internalType: "bool", name: "", type: "bool" }],
            stateMutability: "nonpayable",
            type: "function",
          },
        ],
        functionName: "approve",
        args: [ZAAMAddress, approvalAmount],
      });

      setTxError("USDT approval submitted. Waiting for confirmation...");
      console.log("USDT approval transaction submitted:", hash);

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
      });

      if (receipt.status === "success") {
        console.log("USDT approval successful");
        setTxError(null); // Clear the error message as the approval succeeded

        // Set allowance directly to our approval amount first to ensure UI responsiveness
        const approvalAmount = 2n ** 64n;
        setUsdtAllowance(approvalAmount);

        // Optionally refresh allowance in the background for accuracy
        try {
          // Refresh the allowance directly without calling checkUsdtAllowance
          const allowance = await publicClient.readContract({
            address: USDT_ADDRESS,
            abi: [
              {
                inputs: [
                  { internalType: "address", name: "owner", type: "address" },
                  { internalType: "address", name: "spender", type: "address" },
                ],
                name: "allowance",
                outputs: [
                  { internalType: "uint256", name: "", type: "uint256" },
                ],
                stateMutability: "view",
                type: "function",
              },
            ],
            functionName: "allowance",
            args: [address, ZAAMAddress],
          });

          console.log(
            "Updated USDT allowance after approval:",
            (allowance as bigint).toString(),
          );
          setUsdtAllowance(allowance as bigint);
        } catch (err) {
          console.warn(
            "Failed to refresh USDT allowance, but approval succeeded:",
            err,
          );
          // We already set the allowance above, so this is just for logging
          // No need to set allowance again
        }
        return true;
      } else {
        console.error("USDT approval transaction failed", receipt);
        setTxError("USDT approval failed. Please try again.");
        return false;
      }
    } catch (err) {
      // Handle user rejection separately to avoid alarming errors
      if (isUserRejectionError(err)) {
        console.log("User rejected USDT approval");
        setTxError("USDT approval rejected");
        return false;
      }

      // Use our utility to handle other wallet errors
      const errorMsg = handleWalletError(err);
      setTxError(errorMsg || "Failed to approve USDT");
      console.error("USDT approval error:", err);
      return false;
    }
  };

  // Execute Single-Sided ETH Liquidity Provision
  const executeSingleETHLiquidity = async () => {
    // Validate inputs
    if (!address || !publicClient) {
      setTxError("Missing required data for transaction");
      return;
    }

    // For custom pools like USDT, allow buyToken.id to be 0n
    if (!buyToken?.isCustomPool && !buyToken?.id) {
      setTxError("Please select a valid target token");
      return;
    }

    if (!sellAmt || parseFloat(sellAmt) <= 0) {
      setTxError("Please enter a valid ETH amount");
      return;
    }

    setTxError(null);

    try {
      // Check if we're on mainnet
      if (chainId !== mainnet.id) {
        setTxError("Please connect to Ethereum mainnet to perform this action");
        return;
      }

      // Make sure buyToken.id is properly processed as a BigInt
      // This ensures both searched and manually selected tokens work the same
      const targetTokenId =
        typeof buyToken.id === "bigint"
          ? buyToken.id
          : buyToken.id !== null && buyToken.id !== undefined
            ? BigInt(String(buyToken.id))
            : 0n; // Fallback to 0n if ID is null/undefined (shouldn't happen based on validation)

      // Check if we're dealing with a custom pool like USDT
      let targetPoolKey;
      const isCustomPool = buyToken.isCustomPool;

      if (isCustomPool) {
        // Use the custom pool key for USDT-ETH
        targetPoolKey = buyToken.poolKey || USDT_POOL_KEY;
        console.log("Using custom pool key for Single-ETH liquidity:", {
          token: buyToken.symbol,
          poolKey: JSON.stringify({
            id0: targetPoolKey.id0.toString(),
            id1: targetPoolKey.id1.toString(),
            token0: targetPoolKey.token0,
            token1: targetPoolKey.token1,
            swapFee: targetPoolKey.swapFee.toString(),
          }),
        });
      } else {
        // Regular pool key
        targetPoolKey = computePoolKey(targetTokenId);
      }
      const deadline = nowSec() + BigInt(DEADLINE_SEC);
      const ethAmount = parseEther(sellAmt);

      // Get the reserves for the selected token
      let targetReserves = reserves;

      // If the target token is different from coinId, fetch the correct reserves
      if (targetTokenId !== coinId || isCustomPool) {
        try {
          // Get the pool ID for the target token
          let targetPoolId;

          if (isCustomPool && buyToken.poolId) {
            // Use the custom pool ID for USDT-ETH
            targetPoolId = buyToken.poolId;
            console.log(
              "Using custom pool ID for reserves:",
              targetPoolId.toString(),
            );
          } else {
            // Regular pool ID
            targetPoolId = computePoolId(targetTokenId);
          }

          const result = await publicClient.readContract({
            address: ZAAMAddress,
            abi: ZAAMAbi,
            functionName: "pools",
            args: [targetPoolId],
          });

          const poolData = result as unknown as readonly bigint[];
          targetReserves = {
            reserve0: poolData[0],
            reserve1: poolData[1],
          };
        } catch (err) {
          console.error(
            `Failed to fetch reserves for ${buyToken.symbol}:`,
            err,
          );
          setTxError(
            `Failed to get pool data for ${buyToken.symbol}. Please try again.`,
          );
          return;
        }
      }

      if (
        !targetReserves ||
        targetReserves.reserve0 === 0n ||
        targetReserves.reserve1 === 0n
      ) {
        setTxError(
          `No liquidity available for ${buyToken.symbol}. Please select another token.`,
        );
        return;
      }

      // Half of the ETH will be swapped to tokens by the contract
      const halfEthAmount = ethAmount / 2n;

      // Get correct swap fee for the token (30bps for USDT, default 100bps for regular tokens)
      const swapFee = isCustomPool ? buyToken.swapFee || SWAP_FEE : SWAP_FEE;
      console.log(
        `Using swap fee: ${Number(swapFee) / 100}% for ${buyToken.symbol} in single-ETH liquidity`,
      );

      // Estimate how many tokens we'll get for half the ETH
      const estimatedTokens = getAmountOut(
        halfEthAmount,
        targetReserves.reserve0,
        targetReserves.reserve1,
        swapFee,
      );

      // Apply higher slippage tolerance for Single-ETH operations
      const minTokenAmount = withSingleEthSlippage(estimatedTokens);

      // Min amounts for the addLiquidity portion with higher slippage for less liquid pools
      const amount0Min = withSingleEthSlippage(halfEthAmount);
      const amount1Min = withSingleEthSlippage(estimatedTokens);

      // Call addSingleLiqETH on the ZAMMSingleLiqETH contract
      const hash = await writeContractAsync({
        address: ZAMMSingleLiqETHAddress,
        abi: ZAMMSingleLiqETHAbi,
        functionName: "addSingleLiqETH",
        args: [
          targetPoolKey,
          minTokenAmount, // Minimum tokens from swap
          amount0Min, // Minimum ETH for liquidity
          amount1Min, // Minimum tokens for liquidity
          address, // LP tokens receiver
          deadline,
        ],
        value: ethAmount, // Send the full ETH amount
      });

      setTxHash(hash);
    } catch (err: unknown) {
      // Enhanced error handling with specific messages for common failure cases
      if (
        typeof err === "object" &&
        err !== null &&
        "message" in err &&
        typeof err.message === "string"
      ) {
        if (err.message.includes("InsufficientOutputAmount")) {
          console.error("Slippage too high in low liquidity pool:", err);
          setTxError(
            "Slippage too high in low liquidity pool. Try again with a smaller amount or use a pool with more liquidity.",
          );
        } else if (err.message.includes("K(")) {
          console.error("Pool balance constraints not satisfied:", err);
          setTxError(
            "Pool balance constraints not satisfied. This usually happens with extreme price impact in low liquidity pools.",
          );
        } else {
          // Default to standard error handling
          const errorMsg = handleWalletError(err);
          if (errorMsg) {
            console.error("Single-sided ETH liquidity execution error:", err);
            setTxError(errorMsg);
          }
        }
      } else {
        // Fallback for non-standard errors
        console.error("Unknown error in Single-ETH liquidity:", err);
        setTxError("An unexpected error occurred. Please try again.");
      }
    }
  };

  const executeRemoveLiquidity = async () => {
    // Validate inputs
    if (!reserves || !address || !publicClient) {
      setTxError("Missing required data for transaction");
      return;
    }

    if (!lpBurnAmount || parseFloat(lpBurnAmount) <= 0) {
      setTxError("Please enter a valid amount of LP tokens to burn");
      return;
    }

    // Check if burn amount exceeds user's balance
    // LP tokens always use 18 decimals
    const burnAmount = parseUnits(lpBurnAmount, 18);
    if (burnAmount > lpTokenBalance) {
      setTxError(
        `You only have ${formatUnits(lpTokenBalance, 18)} LP tokens available`,
      );
      return;
    }

    setTxError(null);

    try {
      // Check if we're on mainnet
      if (chainId !== mainnet.id) {
        setTxError("Please connect to Ethereum mainnet to perform this action");
        return;
      }

      // Check if we're dealing with the special USDT token
      let poolKey;
      const isUsdtPool = sellToken.isCustomPool || buyToken?.isCustomPool;

      if (isUsdtPool) {
        // Use the custom pool key for USDT-ETH pool
        const customToken = sellToken.isCustomPool ? sellToken : buyToken;
        poolKey = customToken?.poolKey || USDT_POOL_KEY;
        console.log("Using custom pool key for removing liquidity:", {
          token: customToken?.symbol || "USDT",
          poolKey: JSON.stringify({
            id0: poolKey.id0.toString(),
            id1: poolKey.id1.toString(),
            token0: poolKey.token0,
            token1: poolKey.token1,
            swapFee: poolKey.swapFee.toString(),
          }),
        });
      } else {
        // Regular pool key
        poolKey = computePoolKey(coinId);
      }

      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      // Parse the minimum amounts from the displayed expected return
      const amount0Min = sellAmt ? withSlippage(parseEther(sellAmt)) : 0n;

      // Use correct decimals for token1 (6 for USDT, 18 for regular coins)
      const tokenDecimals = isUsdtPool ? 6 : 18;
      const amount1Min = buyAmt
        ? withSlippage(parseUnits(buyAmt, tokenDecimals))
        : 0n;

      console.log("Removing liquidity:", {
        burnAmount: formatUnits(burnAmount, 18),
        amount0Min: formatEther(amount0Min),
        amount1Min: formatUnits(amount1Min, tokenDecimals),
        isUsdtPool,
      });

      // Call removeLiquidity on the ZAMM contract
      const hash = await writeContractAsync({
        address: ZAAMAddress,
        abi: ZAAMAbi,
        functionName: "removeLiquidity",
        args: [poolKey, burnAmount, amount0Min, amount1Min, address, deadline],
      });

      setTxHash(hash);
    } catch (err) {
      // Use our utility to handle wallet errors
      const errorMsg = handleWalletError(err);
      if (errorMsg) {
        console.error("Remove liquidity execution error:", err);
        setTxError(errorMsg);
      }
    }
  };

  const executeAddLiquidity = async () => {
    // More specific input validation to catch issues early
    if (!canSwap || !reserves || !address || !publicClient) {
      setTxError("Missing required data for transaction");
      return;
    }

    if (!sellAmt || parseFloat(sellAmt) <= 0) {
      setTxError("Please enter a valid sell amount");
      return;
    }

    if (!buyAmt || parseFloat(buyAmt) <= 0) {
      setTxError("Please enter a valid buy amount");
      return;
    }

    setTxError(null);

    try {
      // Check if we're on mainnet
      if (chainId !== mainnet.id) {
        setTxError("Please connect to Ethereum mainnet to perform this action");
        return;
      }

      // Check if we're dealing with the special USDT token
      let poolKey;
      const isUsdtPool = sellToken.isCustomPool || buyToken?.isCustomPool;

      // Enhanced detection of USDT usage for add liquidity
      // We need to make sure we detect all cases where USDT is being used
      const isUsingUsdt =
        // Standard checks for USDT token address
        (sellToken.isCustomPool && sellToken.token1 === USDT_ADDRESS) ||
        (buyToken?.isCustomPool && buyToken?.token1 === USDT_ADDRESS) ||
        // Additional checks by symbol and ID for redundancy
        sellToken.symbol === "USDT" ||
        buyToken?.symbol === "USDT" ||
        // Check for custom pool with ID=0 (USDT pool)
        (sellToken.isCustomPool && sellToken.id === 0n) ||
        (buyToken?.isCustomPool && buyToken?.id === 0n);

      console.log("Add liquidity with possible USDT:", {
        isUsdtPool,
        isUsingUsdt,
        sellTokenSymbol: sellToken.symbol,
        buyTokenSymbol: buyToken?.symbol,
        sellTokenIsCustom: sellToken.isCustomPool,
        sellTokenAddress: sellToken.token1,
        buyTokenIsCustom: buyToken?.isCustomPool,
        buyTokenAddress: buyToken?.token1,
      });

      // Get the amount of USDT being used
      let usdtAmount = 0n;
      if (isUsingUsdt) {
        console.log("USDT token detected for liquidity addition");

        // Determine which token is USDT and get its amount
        if (
          (sellToken.isCustomPool && sellToken.token1 === USDT_ADDRESS) ||
          sellToken.symbol === "USDT"
        ) {
          usdtAmount = parseUnits(sellAmt, 6); // USDT has 6 decimals
          console.log(
            "Using USDT as sell token with amount:",
            usdtAmount.toString(),
          );
        } else if (
          (buyToken?.isCustomPool && buyToken?.token1 === USDT_ADDRESS) ||
          buyToken?.symbol === "USDT"
        ) {
          usdtAmount = parseUnits(buyAmt, 6); // USDT has 6 decimals
          console.log(
            "Using USDT as buy token with amount:",
            usdtAmount.toString(),
          );
        }

        // Check if we need to verify USDT allowance first
        if (usdtAllowance === null) {
          console.log("USDT allowance is null, checking now...");
          await checkUsdtAllowance();
        }

        // If USDT amount is greater than allowance, request approval
        if (
          usdtAllowance === null ||
          usdtAllowance === 0n ||
          usdtAmount > usdtAllowance
        ) {
          console.log("USDT approval needed for liquidity:", {
            usdtAmount: usdtAmount.toString(),
            allowance: usdtAllowance?.toString() || "0",
          });

          // Maintain consistent UX with operator approval flow
          setTxError(
            "Waiting for USDT approval. Please confirm the transaction...",
          );
          const approved = await approveUsdtToken();
          if (!approved) {
            return; // Stop if approval failed or was rejected
          }
        } else {
          console.log("USDT already approved for liquidity:", {
            allowance: usdtAllowance.toString(),
            requiredAmount: usdtAmount.toString(),
          });
        }
      }

      if (isUsdtPool) {
        // Use the custom pool key for USDT-ETH pool
        const customToken = sellToken.isCustomPool ? sellToken : buyToken;
        poolKey = customToken?.poolKey || USDT_POOL_KEY;
      } else {
        // Regular pool key
        poolKey = computePoolKey(coinId);
      }

      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      // In ZAMM's design, for all pools:
      // - token0 is always ETH (zeroAddress), id0 is 0
      // - token1 is always the Coin contract (or USDT for custom pool), id1 is the coinId

      // So we need to ensure:
      // - amount0 is the ETH amount (regardless of which input field the user used)
      // - amount1 is the Coin amount

      // Use correct decimals for token1 (6 for USDT, 18 for regular coins)
      const tokenDecimals = isUsdtPool ? 6 : 18;

      const amount0 = isSellETH ? parseEther(sellAmt) : parseEther(buyAmt); // ETH amount
      const amount1 = isSellETH
        ? parseUnits(buyAmt, tokenDecimals)
        : parseUnits(sellAmt, tokenDecimals); // Token amount

      // Verify we have valid amounts
      if (amount0 === 0n || amount1 === 0n) {
        setTxError("Invalid liquidity amounts");
        return;
      }

      // Slippage protection will be calculated after getting exact amounts from ZAMMHelper

      // Check for USDT approvals first if using USDT pool
      if (
        isUsdtPool &&
        !isSellETH &&
        usdtAllowance !== null &&
        amount1 > usdtAllowance
      ) {
        try {
          // First, show a notification about the approval step
          setTxError(
            "Waiting for USDT approval. Please confirm the transaction...",
          );

          // Max approve (uint256 max)
          const maxApproval = 2n ** 256n - 1n;

          // Send the approval transaction
          const approvalHash = await writeContractAsync({
            address: USDT_ADDRESS,
            abi: [
              {
                inputs: [
                  { internalType: "address", name: "spender", type: "address" },
                  { internalType: "uint256", name: "amount", type: "uint256" },
                ],
                name: "approve",
                outputs: [{ internalType: "bool", name: "", type: "bool" }],
                stateMutability: "nonpayable",
                type: "function",
              },
            ],
            functionName: "approve",
            args: [ZAAMAddress, maxApproval],
          });

          // Show a waiting message
          setTxError("USDT approval submitted. Waiting for confirmation...");

          // Wait for the transaction to be mined
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: approvalHash,
          });

          // Check if the transaction was successful
          if (receipt.status === "success") {
            setUsdtAllowance(maxApproval);
            setTxError(null); // Clear the message
          } else {
            setTxError("USDT approval failed. Please try again.");
            return;
          }
        } catch (err) {
          // Use our utility to handle wallet errors
          const errorMsg = handleWalletError(err);
          if (errorMsg) {
            console.error("Failed to approve USDT:", err);
            setTxError("Failed to approve USDT");
          }
          return;
        }
      }

      // Check if the user needs to approve ZAMM as operator for their Coin token
      // This is needed when the user is providing Coin tokens (not just ETH)
      // Since we're always providing Coin tokens in liquidity, we need approval
      // Only needed for regular Coin tokens, not for USDT
      if (!isUsdtPool && isOperator === false) {
        try {
          // First, show a notification about the approval step
          setTxError(
            "Waiting for operator approval. Please confirm the transaction...",
          );

          // Send the approval transaction
          const approvalHash = await writeContractAsync({
            address: CoinsAddress,
            abi: CoinsAbi,
            functionName: "setOperator",
            args: [ZAAMAddress, true],
          });

          // Show a waiting message
          setTxError(
            "Operator approval submitted. Waiting for confirmation...",
          );

          // Wait for the transaction to be mined
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: approvalHash,
          });

          // Check if the transaction was successful
          if (receipt.status === "success") {
            setIsOperator(true);
            setTxError(null); // Clear the message
          } else {
            setTxError("Operator approval failed. Please try again.");
            return;
          }
        } catch (err) {
          // Use our utility to handle wallet errors
          const errorMsg = handleWalletError(err);
          if (errorMsg) {
            console.error("Failed to approve operator:", err);
            setTxError("Failed to approve the liquidity contract as operator");
          }
          return;
        }
      }

      // Use ZAMMHelper to calculate the exact ETH amount to provide
      try {
        // The contract call returns an array of values rather than an object
        const result = await publicClient.readContract({
          address: ZAMMHelperAddress,
          abi: ZAMMHelperAbi,
          functionName: "calculateRequiredETH",
          args: [
            poolKey,
            amount0, // amount0Desired
            amount1, // amount1Desired
          ],
        });

        // Extract the values from the result array
        const [ethAmount, calcAmount0, calcAmount1] = result as [
          bigint,
          bigint,
          bigint,
        ];

        // Detailed logging to help with debugging

        // Calculate minimum amounts based on the actual amounts that will be used by the contract
        const actualAmount0Min = withSlippage(calcAmount0);
        const actualAmount1Min = withSlippage(calcAmount1);

        // Use the ethAmount from ZAMMHelper as the exact value to send
        // IMPORTANT: We should also use the exact calculated amounts for amount0Desired and amount1Desired
        const hash = await writeContractAsync({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "addLiquidity",
          args: [
            poolKey,
            calcAmount0, // use calculated amount0 as amount0Desired
            calcAmount1, // use calculated amount1 as amount1Desired
            actualAmount0Min, // use adjusted min based on calculated amount
            actualAmount1Min, // use adjusted min based on calculated amount
            address, // to
            deadline,
          ],
          value: ethAmount, // Use the exact ETH amount calculated by ZAMMHelper
        });

        setTxHash(hash);
      } catch (calcErr) {
        // Use our utility to handle wallet errors
        const errorMsg = handleWalletError(calcErr);
        if (errorMsg) {
          console.error(
            "Error calling ZAMMHelper.calculateRequiredETH:",
            calcErr,
          );
          setTxError("Failed to calculate exact ETH amount");
        }
        return;
      }
    } catch (err) {
      // Handle errors, but don't display errors for user rejections
      // Use our utility to properly handle wallet errors
      const errorMsg = handleWalletError(err);
      if (errorMsg) {
        console.error("Add liquidity execution error:", err);

        // More specific error messages based on error type
        if (err instanceof Error) {
          if (err.message.includes("insufficient funds")) {
            setTxError("Insufficient funds for this transaction");
          } else if (err.message.includes("InvalidMsgVal")) {
            // This is our critical error where the msg.value doesn't match what the contract expects
            setTxError(
              "Contract rejected ETH value. Please try again with different amounts.",
            );
            console.error(
              "ZAMM contract rejected the ETH value due to strict msg.value validation.",
            );
          } else {
            setTxError("Transaction failed. Please try again.");
          }
        } else {
          setTxError("Unknown error during liquidity provision");
        }
      }
    }
  };

  const executeSwap = async () => {
    try {
      console.log("Starting swap execution with tokens:", {
        sellToken: sellToken.symbol,
        buyToken: buyToken?.symbol,
        sellTokenId: sellToken.id?.toString() || "null (ETH)",
        buyTokenId: buyToken?.id?.toString() || "null (ETH)",
        isCustomPoolSwap: isCustomPool,
        isDirectUsdtEthSwap: isDirectUsdtEthSwap || false,
        isCoinToCoin: isCoinToCoin,
      });

      // Ensure wallet is connected before proceeding
      if (!isConnected || !address) {
        setTxError("Wallet not connected. Please connect your wallet first.");
        return;
      }

      if (!canSwap || !sellAmt || !publicClient || !buyToken) {
        // Cannot execute swap - missing prerequisites
        // Check swap prerequisites
        setTxError(
          "Cannot execute swap. Please ensure you have selected a token pair and entered an amount.",
        );
        return;
      }

      // Important: For custom pools like USDT, we have to special-case the reserves check
      if (!reserves && !sellToken.isCustomPool && !buyToken.isCustomPool) {
        console.error("Missing reserves for regular pool swap");
        setTxError("Cannot execute swap. No pool reserves available.");
        return;
      }

      // Clear any previous errors
      setTxError(null);

      // Wait a moment to ensure wallet connection is stable
      if (publicClient && !publicClient.getChainId) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (!publicClient.getChainId) {
          setTxError(
            "Wallet connection not fully established. Please wait a moment and try again.",
          );
          return;
        }
      }

      // Check if we're on mainnet
      if (chainId !== mainnet.id) {
        setTxError("Please connect to Ethereum mainnet to perform this action");
        return;
      }

      // Check if we're dealing with the special USDT token
      let poolKey;
      if (sellToken.isCustomPool || buyToken?.isCustomPool) {
        // Use the custom pool key for USDT-ETH pool
        const customToken = sellToken.isCustomPool ? sellToken : buyToken;
        poolKey = customToken?.poolKey || USDT_POOL_KEY;
        // Create a safe version of poolKey for logging
        const safePoolKey = {
          id0: poolKey.id0.toString(),
          id1: poolKey.id1.toString(),
          token0: poolKey.token0,
          token1: poolKey.token1,
          swapFee: poolKey.swapFee.toString(),
        };
        console.log(
          "Using custom pool key:",
          JSON.stringify(safePoolKey),
          "with poolId:",
          customToken?.poolId?.toString() || USDT_POOL_ID.toString(),
        );
      } else {
        // Regular pool key
        poolKey = computePoolKey(coinId);
      }

      if (isSellETH) {
        // Get the correct swap fee (custom fee for USDT, default fee for regular tokens)
        const swapFee =
          sellToken.isCustomPool || buyToken?.isCustomPool
            ? (sellToken.isCustomPool
                ? sellToken.swapFee
                : buyToken?.swapFee) || SWAP_FEE
            : SWAP_FEE;

        const amountInWei = parseEther(sellAmt || "0");
        const rawOut = reserves
          ? getAmountOut(
              amountInWei,
              reserves.reserve0,
              reserves.reserve1,
              swapFee,
            )
          : 0n;

        if (rawOut === 0n) {
          setTxError("Output amount is zero. Check pool liquidity.");
          return;
        }

        // Create a deadline timestamp
        const deadline = nowSec() + BigInt(DEADLINE_SEC);

        // simulate multicall
        await simulateContractInteraction({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "swapExactIn",
          args: [
            poolKey,
            amountInWei,
            withSlippage(rawOut),
            true,
            address,
            deadline,
          ],
          value: amountInWei,
        });

        const gas = await estimateContractGas({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "swapExactIn",
          args: [
            poolKey,
            amountInWei,
            withSlippage(rawOut),
            true,
            address,
            deadline,
          ],
          value: amountInWei,
        });

        // Simulation complete

        // Create a safe version of poolKey for logging
        const safePoolKey = {
          id0: poolKey.id0.toString(),
          id1: poolKey.id1.toString(),
          token0: poolKey.token0,
          token1: poolKey.token1,
          swapFee: poolKey.swapFee.toString(),
        };

        // Check if this is a direct ETH->USDT swap
        const isUsdtSwap =
          buyToken?.isCustomPool && buyToken?.token1 === USDT_ADDRESS;

        console.log("Executing ETH->Coin swap with:", {
          poolKey: JSON.stringify(safePoolKey),
          amountIn: amountInWei.toString(),
          minOut: withSlippage(rawOut).toString(),
          fee: poolKey.swapFee.toString(),
          fromETH: true,
          isUsdtSwap,
        });

        const hash = await writeContractAsync({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "swapExactIn",
          args: [
            poolKey,
            amountInWei,
            withSlippage(rawOut),
            true,
            address,
            deadline,
          ],
          value: amountInWei,
          gas: gas,
        });
        setTxHash(hash);
      } else {
        // Check if we're dealing with USDT (custom token)
        // Improved detection to make sure we don't miss USDT tokens
        const isSellingUsdt =
          (sellToken.isCustomPool && sellToken.token1 === USDT_ADDRESS) ||
          // Double-check by symbol as a fallback
          sellToken.symbol === "USDT" ||
          // Also check ID=0 which is used for USDT
          (sellToken.isCustomPool && sellToken.id === 0n);

        const isBuyingUsdt =
          buyToken?.isCustomPool && buyToken?.token1 === USDT_ADDRESS;

        console.log("Direct swap involving:", {
          sellToken: sellToken.symbol,
          buyToken: buyToken?.symbol,
          sellTokenId: sellToken.id?.toString(),
          isCustomPool: sellToken.isCustomPool,
          token1Address: sellToken.token1,
          usdtAddress: USDT_ADDRESS,
          isSellingUsdt,
          isBuyingUsdt,
          currentAllowance: usdtAllowance?.toString() || "null",
        });

        const decimals = sellToken.decimals || 18;

        // Parse with correct decimals (6 for USDT, 18 for regular tokens)
        const amountInUnits = parseUnits(sellAmt || "0", decimals);

        // Special case for USDT: Check and approve USDT allowance
        if (isSellingUsdt) {
          console.log("Checking USDT allowance before swap");

          // If allowance is null, it hasn't been checked yet - wait for check to complete
          if (usdtAllowance === null) {
            console.log("USDT allowance is null, checking now...");
            await checkUsdtAllowance();
          }

          // Now check if we need approval - force approval dialog to appear for any USDT transaction
          if (
            usdtAllowance === null ||
            usdtAllowance === 0n ||
            amountInUnits > usdtAllowance
          ) {
            console.log("USDT approval needed:", {
              usdtAmount: amountInUnits.toString(),
              allowance: usdtAllowance?.toString() || "0",
            });

            // Maintain consistent UX with operator approval flow
            setTxError(
              "Waiting for USDT approval. Please confirm the transaction...",
            );
            const approved = await approveUsdtToken();
            if (!approved) {
              return; // Stop if approval failed or was rejected
            }
          } else {
            console.log("USDT already approved:", {
              allowance: usdtAllowance.toString(),
              requiredAmount: amountInUnits.toString(),
            });
          }
        }

        // Approve ZAAM as operator if needed (for regular tokens, not USDT)
        if (!isSellingUsdt && isOperator === false) {
          try {
            // First, show a notification about the approval step
            setTxError(
              "Waiting for operator approval. Please confirm the transaction...",
            );

            // Send the approval transaction
            const approvalHash = await writeContractAsync({
              address: CoinsAddress,
              abi: CoinsAbi,
              functionName: "setOperator",
              args: [ZAAMAddress, true],
            });

            // Show a waiting message
            setTxError(
              "Operator approval submitted. Waiting for confirmation...",
            );

            // Wait for the transaction to be mined
            const receipt = await publicClient.waitForTransactionReceipt({
              hash: approvalHash,
            });

            // Check if the transaction was successful
            if (receipt.status === "success") {
              setIsOperator(true);
              setTxError(null); // Clear the message
            } else {
              setTxError("Operator approval failed. Please try again.");
              return;
            }
          } catch (err) {
            // Use our utility to handle wallet errors
            const errorMsg = handleWalletError(err);
            if (errorMsg) {
              console.error("Failed to approve operator:", err);
              setTxError("Failed to approve the swap contract as operator");
            }
            return;
          }
        }

        // If we have two different Coin IDs, use the multicall path for Coin to Coin swap
        if (
          buyToken?.id !== null &&
          buyToken?.id !== undefined &&
          sellToken.id !== null &&
          buyToken.id !== sellToken.id
        ) {
          try {
            // Import our helper dynamically to avoid circular dependencies
            const { createCoinSwapMulticall, estimateCoinToCoinOutput } =
              await import("./lib/swapHelper");

            // Fetch target coin reserves
            let targetPoolId;
            if (buyToken.isCustomPool && buyToken.poolId) {
              // Use the custom pool ID for USDT-ETH
              targetPoolId = buyToken.poolId;
            } else {
              // Regular pool ID
              targetPoolId = computePoolId(buyToken.id!);
            }

            const targetPoolResult = await publicClient.readContract({
              address: ZAAMAddress,
              abi: ZAAMAbi,
              functionName: "pools",
              args: [targetPoolId],
            });

            const targetPoolData =
              targetPoolResult as unknown as readonly bigint[];
            const targetReserves = {
              reserve0: targetPoolData[0],
              reserve1: targetPoolData[1],
            };

            // Get correct swap fees for both pools
            const sourceSwapFee = sellToken.isCustomPool
              ? sellToken.swapFee || SWAP_FEE
              : SWAP_FEE;
            const targetSwapFee = buyToken?.isCustomPool
              ? buyToken.swapFee || SWAP_FEE
              : SWAP_FEE;

            // Estimate the final output amount and intermediate ETH amount
            const {
              amountOut,
              withSlippage: minAmountOut,
              ethAmountOut,
            } = estimateCoinToCoinOutput(
              sellToken.id!,
              buyToken.id!,
              amountInUnits,
              reserves || { reserve0: 0n, reserve1: 0n }, // source reserves
              targetReserves, // target reserves
              slippageBps, // Use current slippage setting
              sourceSwapFee, // Pass source pool fee (could be 30n for USDT)
              targetSwapFee, // Pass target pool fee (could be 30n for USDT)
            );

            if (amountOut === 0n) {
              setTxError("Output amount is zero. Check pool liquidity.");
              return;
            }

            // Create the multicall data for coin-to-coin swap via ETH
            // We need to provide custom pool keys for USDT pools
            // Cast to any to avoid TypeScript errors with `0x${string}` format
            const sourcePoolKey =
              sellToken.isCustomPool && sellToken.poolKey
                ? (sellToken.poolKey as any)
                : computePoolKey(sellToken.id!);

            const targetPoolKey =
              buyToken.isCustomPool && buyToken.poolKey
                ? (buyToken.poolKey as any)
                : computePoolKey(buyToken.id!);

            const multicallData = createCoinSwapMulticall(
              sellToken.id!,
              buyToken.id!,
              amountInUnits,
              ethAmountOut, // Pass the estimated ETH output for the second swap
              minAmountOut,
              address,
              sourcePoolKey, // Custom source pool key
              targetPoolKey, // Custom target pool key
            );

            // Log the calls we're making for debugging
            // simulate multicall
            await simulateContractInteraction({
              address: ZAAMAddress,
              abi: ZAAMAbi,
              functionName: "multicall",
              args: [multicallData],
            });

            const gas = await estimateContractGas({
              address: ZAAMAddress,
              abi: ZAAMAbi,
              functionName: "multicall",
              args: [multicallData],
            });

            // Simulation complete
            // Simulation complete

            // Create safe versions of pool keys for logging
            const safeSourcePoolKey = {
              id0: sourcePoolKey.id0.toString(),
              id1: sourcePoolKey.id1.toString(),
              token0: sourcePoolKey.token0,
              token1: sourcePoolKey.token1,
              swapFee: sourcePoolKey.swapFee.toString(),
            };

            const safeTargetPoolKey = {
              id0: targetPoolKey.id0.toString(),
              id1: targetPoolKey.id1.toString(),
              token0: targetPoolKey.token0,
              token1: targetPoolKey.token1,
              swapFee: targetPoolKey.swapFee.toString(),
            };

            console.log("Executing Coin->Coin swap with:", {
              sourcePoolKey: JSON.stringify(safeSourcePoolKey),
              targetPoolKey: JSON.stringify(safeTargetPoolKey),
              sourceSwapFee: sourceSwapFee.toString(),
              targetSwapFee: targetSwapFee.toString(),
              amountIn: amountInUnits.toString(),
              ethEstimate: ethAmountOut.toString(),
              minOut: minAmountOut.toString(),
            });

            // Execute the multicall transaction
            const hash = await writeContractAsync({
              address: ZAAMAddress,
              abi: ZAAMAbi,
              functionName: "multicall",
              args: [multicallData],
              gas,
            });

            setTxHash(hash);
            return;
          } catch (err) {
            // Use our utility to handle wallet errors
            const errorMsg = handleWalletError(err);
            if (errorMsg) {
              console.error("Error in multicall swap:", err);
              setTxError("Failed to execute coin-to-coin swap");
            }
            return;
          }
        }

        // Default path for Coin to ETH swap
        // Get the correct swap fee (custom fee for USDT, default fee for regular tokens)
        const swapFee =
          sellToken.isCustomPool || buyToken?.isCustomPool
            ? (sellToken.isCustomPool
                ? sellToken.swapFee
                : buyToken?.swapFee) || SWAP_FEE
            : SWAP_FEE;

        const rawOut = reserves
          ? getAmountOut(
              amountInUnits,
              reserves.reserve1,
              reserves.reserve0,
              swapFee,
            )
          : 0n;

        if (rawOut === 0n) {
          setTxError("Output amount is zero. Check pool liquidity.");
          return;
        }

        // Create a deadline timestamp
        const deadline = nowSec() + BigInt(DEADLINE_SEC);

        // Add debugging info
        console.log("Executing Coin->ETH swap with:", {
          poolKey: JSON.stringify({
            id0: poolKey.id0.toString(),
            id1: poolKey.id1.toString(),
            token0: poolKey.token0,
            token1: poolKey.token1,
            swapFee: poolKey.swapFee.toString(),
          }),
          amountIn: amountInUnits.toString(),
          minOut: withSlippage(rawOut).toString(),
          isSellingUsdt,
          hasAllowance: isSellingUsdt
            ? usdtAllowance !== null && usdtAllowance >= amountInUnits
            : "N/A",
        });

        // Execute the swap
        const hash = await writeContractAsync({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "swapExactIn",
          args: [
            poolKey,
            amountInUnits,
            withSlippage(rawOut),
            false,
            address,
            deadline,
          ],
        });
        setTxHash(hash);
      }
    } catch (err: unknown) {
      console.error("Swap execution error:", err);

      // Try to log more details about the error
      if (err instanceof Error) {
        console.error("Error details:", {
          name: err.name,
          message: err.message,
          stack: err.stack,
        });
      }

      // Enhanced error handling with specific messages for common swap failure cases
      if (
        typeof err === "object" &&
        err !== null &&
        "message" in err &&
        typeof err.message === "string"
      ) {
        const errMsg = err.message;

        // Handle wallet connection errors
        if (
          errMsg.includes("getChainId") ||
          errMsg.includes("connector") ||
          errMsg.includes("connection")
        ) {
          // Wallet connection issue
          setTxError(
            "Wallet connection issue detected. Please refresh the page and try again.",
          );

          // Log structured debug info
          const errorInfo = {
            type: "wallet_connection_error",
            message: errMsg,
            isConnected,
            hasChainId: !!chainId,
            hasPublicClient: !!publicClient,
            hasAccount: !!address,
          };
          // Show error info in console
          console.error("Wallet connection error:", errorInfo);
        } else if (errMsg.includes("InsufficientOutputAmount")) {
          setTxError(
            "Swap failed due to price movement in low liquidity pool. Try again or use a smaller amount.",
          );
        } else if (errMsg.includes("K(")) {
          setTxError(
            "Swap failed due to pool constraints. This usually happens with large orders in small pools.",
          );
        } else {
          // Default to standard error handling
          const errorMsg = handleWalletError(err);
          if (errorMsg) {
            setTxError(errorMsg);
          }
        }
      } else {
        // Fallback for non-standard errors
        setTxError("An unexpected error occurred. Please try again.");
      }
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  // Main UI
  return (
    <Card className="w-full max-w-lg p-4 sm:p-6 border-2 border-yellow-100 shadow-md rounded-xl">
      <CardContent className="p-0 sm:p-1 flex flex-col space-y-1">
        {/* Info showing token count */}
        <div className="text-xs text-gray-500 mb-2">
          Available tokens: {tokenCount} (ETH + {tokenCount - 1} coins, sorted
          by liquidity)
        </div>

        {/* Mode tabs */}
        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as TileMode)}
          className="mb-2"
        >
          <TabsList className="w-full bg-yellow-50 p-1 rounded-lg border border-yellow-100">
            <TabsTrigger
              value="swap"
              className="flex-1 data-[state=active]:bg-white data-[state=active]:border-yellow-200 data-[state=active]:shadow-sm h-10 touch-manipulation"
            >
              <ArrowDownUp className="h-4 w-4 mr-1" />
              <span className="text-sm sm:text-base">Swap</span>
            </TabsTrigger>
            <TabsTrigger
              value="liquidity"
              className="flex-1 data-[state=active]:bg-white data-[state=active]:border-yellow-200 data-[state=active]:shadow-sm h-10 touch-manipulation"
            >
              <Plus className="h-4 w-4 mr-1" />
              <span className="text-sm sm:text-base">Liquidity</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Liquidity mode tabs - only show when in liquidity mode */}
        {mode === "liquidity" && (
          <Tabs
            value={liquidityMode}
            onValueChange={(value) => setLiquidityMode(value as LiquidityMode)}
            className="mb-2"
          >
            <TabsList className="w-full bg-yellow-50 p-1 rounded-lg border border-yellow-100">
              <TabsTrigger
                value="add"
                className="flex-1 data-[state=active]:bg-white data-[state=active]:border-yellow-200 data-[state=active]:shadow-sm h-10 touch-manipulation"
              >
                <Plus className="h-4 w-4 mr-1" />
                <span className="text-xs sm:text-sm">Add</span>
              </TabsTrigger>
              <TabsTrigger
                value="remove"
                className="flex-1 data-[state=active]:bg-white data-[state=active]:border-yellow-200 data-[state=active]:shadow-sm h-10 touch-manipulation"
              >
                <Minus className="h-4 w-4 mr-1" />
                <span className="text-xs sm:text-sm">Remove</span>
              </TabsTrigger>
              <TabsTrigger
                value="single-eth"
                className="flex-1 data-[state=active]:bg-white data-[state=active]:border-yellow-200 data-[state=active]:shadow-sm h-10 touch-manipulation"
              >
                <span className="text-xs font-medium mr-1">Ξ</span>
                <span className="text-xs sm:text-sm">Single-ETH</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {/* Load error notification */}
        {loadError && (
          <div className="p-2 mb-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
            {loadError}
          </div>
        )}

        {/* SELL + FLIP + BUY panel container */}
        <div className="relative flex flex-col">
          {/* LP Amount Input (only visible in Remove Liquidity mode) */}
          {mode === "liquidity" && liquidityMode === "remove" && (
            <div className="border-2 border-yellow-500 group hover:bg-yellow-50 rounded-t-2xl p-3 pb-4 focus-within:ring-2 focus-within:ring-primary flex flex-col gap-2 bg-yellow-50">
              <div className="flex items-center justify-between">
                <span className="font-medium text-yellow-800">
                  LP Tokens to Burn
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-yellow-700">
                    Balance: {formatUnits(lpTokenBalance, 18)}
                  </span>
                  <button
                    className="text-xs bg-yellow-200 hover:bg-yellow-300 text-yellow-800 font-medium px-3 py-1.5 rounded touch-manipulation min-w-[50px]"
                    onClick={() =>
                      syncFromSell(formatUnits(lpTokenBalance, 18))
                    }
                  >
                    MAX
                  </button>
                </div>
              </div>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0.0"
                value={lpBurnAmount}
                onChange={(e) => syncFromSell(e.target.value)}
                className="text-lg sm:text-xl font-medium w-full bg-yellow-50 focus:outline-none h-10 text-right pr-1"
              />
              <div className="text-xs text-yellow-600 mt-1">
                Enter the amount of LP tokens you want to burn to receive ETH
                and tokens back.
              </div>
            </div>
          )}

          {/* SELL/PROVIDE panel */}
          <div
            className={`border-2 border-yellow-300 group hover:bg-yellow-50 ${mode === "liquidity" && liquidityMode === "remove" ? "rounded-md" : "rounded-t-2xl"} p-2 pb-4 focus-within:ring-2 focus-within:ring-primary flex flex-col gap-2 ${mode === "liquidity" && liquidityMode === "remove" ? "mt-2" : ""}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {mode === "swap"
                  ? "Sell"
                  : liquidityMode === "add"
                    ? "Provide"
                    : liquidityMode === "remove"
                      ? "You'll Receive (ETH)"
                      : "Provide ETH"}
              </span>
              {/* Render both options but hide one with CSS for hook stability */}
              <>
                {/* ETH-only display for Single-ETH mode */}
                <div
                  className={`flex items-center gap-2 bg-transparent border border-yellow-200 rounded-md px-2 py-1 ${mode === "liquidity" && liquidityMode === "single-eth" ? "" : "hidden"}`}
                >
                  <div className="w-8 h-8 overflow-hidden rounded-full">
                    <img
                      src={ETH_TOKEN.tokenUri}
                      alt="ETH"
                      className="w-8 h-8 object-cover"
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium">ETH</span>
                    <div className="text-xs font-medium text-gray-700 min-w-[50px] h-[14px]">
                      {sellToken.balance !== undefined
                        ? formatEther(sellToken.balance)
                        : "0"}
                      {isEthBalanceFetching && (
                        <span
                          className="text-xs text-yellow-500 ml-1"
                          style={{ animation: "pulse 1.5s infinite" }}
                        >
                          ·
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Token selector for all other modes */}
                <div
                  className={
                    mode === "liquidity" && liquidityMode === "single-eth"
                      ? "hidden"
                      : ""
                  }
                >
                  <TokenSelector
                    selectedToken={sellToken}
                    tokens={memoizedTokens}
                    onSelect={handleSellTokenSelect}
                    isEthBalanceFetching={isEthBalanceFetching}
                  />
                  {/* Removed hidden balance update for debugging that was causing errors */}
                </div>
              </>
            </div>
            <div className="flex justify-between items-center">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0.0"
                value={sellAmt}
                onChange={(e) => syncFromSell(e.target.value)}
                className="text-lg sm:text-xl font-medium w-full focus:outline-none h-10 text-right pr-1"
                readOnly={mode === "liquidity" && liquidityMode === "remove"}
              />
              {mode === "liquidity" && liquidityMode === "remove" && (
                <span className="text-xs text-yellow-600 font-medium">
                  Preview
                </span>
              )}
              {/* MAX button for using full balance */}
              {sellToken.balance !== undefined &&
                sellToken.balance > 0n &&
                (mode === "swap" ||
                  (mode === "liquidity" &&
                    (liquidityMode === "add" ||
                      liquidityMode === "single-eth"))) && (
                  <button
                    className="text-xs bg-yellow-100 hover:bg-yellow-200 text-yellow-800 font-medium px-3 py-1.5 rounded touch-manipulation min-w-[50px]"
                    onClick={() => {
                      // For ETH, leave a small amount for gas
                      if (sellToken.id === null) {
                        // Get 99% of ETH balance to leave some for gas
                        const ethAmount =
                          ((sellToken.balance as bigint) * 99n) / 100n;
                        syncFromSell(formatEther(ethAmount));
                      } else {
                        // For other tokens, use the full balance with correct decimals
                        // Handle non-standard decimals like USDT (6 decimals)
                        const decimals = sellToken.decimals || 18;
                        syncFromSell(
                          formatUnits(sellToken.balance as bigint, decimals),
                        );
                      }
                    }}
                  >
                    MAX
                  </button>
                )}
            </div>
          </div>

          {/* FLIP button - only shown in swap mode */}
          {mode === "swap" && (
            <button
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 p-3 rounded-full shadow-xl
                bg-yellow-500 hover:bg-yellow-600 focus:bg-yellow-600 active:scale-95
                focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all z-10 touch-manipulation"
              onClick={flipTokens}
            >
              <ArrowDownUp className="h-5 w-5 text-white" />
            </button>
          )}

          {/* ALL BUY/RECEIVE panels - rendering conditionally with CSS for hook stability */}
          {buyToken && (
            <>
              {/* Single-ETH mode panel */}
              <div
                className={`border-2 border-yellow-300 group rounded-b-2xl p-2 pt-3 focus-within:ring-2 hover:bg-yellow-50 focus-within:ring-primary flex flex-col gap-2 mt-2 ${mode === "liquidity" && liquidityMode === "single-eth" ? "" : "hidden"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Target Token
                  </span>
                  <TokenSelector
                    selectedToken={buyToken}
                    tokens={memoizedNonEthTokens} // Using pre-memoized non-ETH tokens
                    onSelect={handleBuyTokenSelect}
                    isEthBalanceFetching={isEthBalanceFetching}
                  />
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-xl font-medium w-full">
                    {singleETHEstimatedCoin || "0"}
                  </div>
                  <span className="text-xs text-yellow-600 font-medium">
                    Estimated
                  </span>
                </div>
                <div className="text-xs text-yellow-600 mt-1">
                  Half of your ETH will be swapped for {buyToken.symbol} and
                  paired with the remaining ETH.
                </div>
              </div>

              {/* Standard BUY/RECEIVE panel */}
              <div
                className={`border-2 border-yellow-300 group rounded-b-2xl p-2 pt-3 focus-within:ring-2 hover:bg-yellow-50 focus-within:ring-primary flex flex-col gap-2 mt-2 ${!(mode === "liquidity" && liquidityMode === "single-eth") ? "" : "hidden"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {mode === "swap"
                      ? "Buy"
                      : liquidityMode === "add"
                        ? "And"
                        : `You'll Receive (${buyToken.symbol})`}
                  </span>
                  <TokenSelector
                    selectedToken={buyToken}
                    tokens={memoizedTokens}
                    onSelect={handleBuyTokenSelect}
                    isEthBalanceFetching={isEthBalanceFetching}
                  />
                </div>
                <div className="flex justify-between items-center">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    placeholder="0.0"
                    value={buyAmt}
                    onChange={(e) => syncFromBuy(e.target.value)}
                    className="text-lg sm:text-xl font-medium w-full focus:outline-none h-10 text-right pr-1"
                    readOnly={
                      mode === "liquidity" && liquidityMode === "remove"
                    }
                  />
                  {mode === "liquidity" && liquidityMode === "remove" && (
                    <span className="text-xs text-yellow-600 font-medium">
                      Preview
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Network indicator */}
        {isConnected && chainId !== mainnet.id && (
          <div className="text-xs mt-1 px-2 py-1 bg-yellow-50 border border-yellow-200 rounded text-yellow-700">
            <strong>Wrong Network:</strong> Please switch to Ethereum mainnet in
            your wallet to{" "}
            {mode === "swap" ? "swap tokens" : "manage liquidity"}
          </div>
        )}

        {/* Slippage information - clickable to show settings */}
        <div
          onClick={() => setShowSlippageSettings(!showSlippageSettings)}
          className="text-xs mt-1 px-2 py-1 bg-blue-50 border border-blue-100 rounded text-blue-700 cursor-pointer hover:bg-blue-100 transition-colors"
        >
          <div className="flex justify-between items-center">
            <span>
              <strong>Slippage Tolerance:</strong>{" "}
              {mode === "liquidity" && liquidityMode === "single-eth"
                ? `${Number(singleEthSlippageBps) / 100}%`
                : `${Number(slippageBps) / 100}%`}
            </span>
            <span className="text-xs text-blue-500">
              {showSlippageSettings ? "▲" : "▼"}
            </span>
          </div>

          {/* Slippage Settings Panel */}
          {showSlippageSettings && (
            <div
              className="mt-2 p-2 bg-white border border-blue-200 rounded-md shadow-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2">
                <div className="flex gap-1 flex-wrap">
                  {SLIPPAGE_OPTIONS.map((option) => (
                    <button
                      key={option.value.toString()}
                      onClick={() =>
                        mode === "liquidity" && liquidityMode === "single-eth"
                          ? setSingleEthSlippageBps(option.value)
                          : setSlippageBps(option.value)
                      }
                      className={`px-2 py-1 text-xs rounded ${
                        (
                          mode === "liquidity" && liquidityMode === "single-eth"
                            ? singleEthSlippageBps === option.value
                            : slippageBps === option.value
                        )
                          ? "bg-blue-500 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                  {/* Simple custom slippage input */}
                  <div className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-gray-100 text-gray-700">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.1"
                      max="50"
                      step="0.1"
                      placeholder=""
                      className="w-12 bg-transparent outline-none text-center"
                      onChange={(e) => {
                        const value = parseFloat(e.target.value);
                        if (isNaN(value) || value < 0.1 || value > 50) return;

                        // Convert percentage to basis points
                        const bps = BigInt(Math.floor(value * 100));

                        if (
                          mode === "liquidity" &&
                          liquidityMode === "single-eth"
                        ) {
                          setSingleEthSlippageBps(bps);
                        } else {
                          setSlippageBps(bps);
                        }
                      }}
                    />
                    <span>%</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mode-specific information */}
        {mode === "liquidity" && (
          <div className="text-xs bg-yellow-50 border border-yellow-200 rounded p-2 mt-2 text-yellow-800">
            {liquidityMode === "add" ? (
              <>
                <p className="font-medium mb-1">Adding liquidity provides:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>LP tokens as a proof of your position</li>
                  <li>Earn {Number(SWAP_FEE) / 100}% fees from trades</li>
                  <li>Withdraw your liquidity anytime</li>
                </ul>
              </>
            ) : liquidityMode === "remove" ? (
              <>
                <p className="font-medium mb-1">Remove Liquidity:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>
                    Your LP balance: {formatUnits(lpTokenBalance, 18)} LP tokens
                  </li>
                  <li>Enter amount of LP tokens to burn</li>
                  <li>Preview shows expected return of ETH and tokens</li>
                </ul>
              </>
            ) : (
              <>
                <p className="font-medium mb-1">Single-Sided ETH Liquidity:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Provide only ETH to participate in a pool</li>
                  <li>Half your ETH is swapped to tokens automatically</li>
                  <li>Remaining ETH + tokens are added as liquidity</li>
                  <li>Earn {Number(SWAP_FEE) / 100}% fees from trades</li>
                </ul>
              </>
            )}
          </div>
        )}

        {/* Pool information */}
        {canSwap && reserves && (
          <div className="text-xs text-gray-500 flex justify-between px-1 mt-1">
            {mode === "swap" &&
            isCoinToCoin &&
            !isDirectUsdtEthSwap &&
            // Extra sanity check - don't show multihop if one token is ETH and the other is USDT
            !(
              (sellToken.id === null && buyToken?.symbol === "USDT") ||
              (buyToken?.id === null && sellToken.symbol === "USDT")
            ) ? (
              <span className="flex items-center">
                <span className="bg-yellow-200 text-yellow-800 px-1 rounded mr-1">
                  Multi-hop
                </span>
                {sellToken.symbol} → ETH → {buyToken?.symbol}
              </span>
            ) : (
              <span>
                Pool: {formatEther(reserves.reserve0).substring(0, 8)} ETH /{" "}
                {formatUnits(
                  reserves.reserve1,
                  // Use the correct decimals for the token (6 for USDT, 18 for others)
                  isCustomPool
                    ? sellToken.isCustomPool
                      ? sellToken.decimals || 18
                      : buyToken?.decimals || 18
                    : 18,
                ).substring(0, 8)}{" "}
                {coinId
                  ? tokens.find((t) => t.id === coinId)?.symbol || "Token"
                  : buyToken?.symbol}
              </span>
            )}
            <span>
              Fee:{" "}
              {
                // For USDT direct swaps, show the 0.3% fee
                isCustomPool &&
                // Direct USDT-ETH swaps are not multihop
                ((sellToken.id === null &&
                  buyToken?.isCustomPool &&
                  buyToken?.token1 === USDT_ADDRESS) ||
                  (buyToken?.id === null &&
                    sellToken.isCustomPool &&
                    sellToken.token1 === USDT_ADDRESS) ||
                  // Other direct USDT swaps
                  !isCoinToCoin)
                  ? "0.3%"
                  : // For multihop swaps, show double fee
                    mode === "swap" && isCoinToCoin
                    ? (Number(SWAP_FEE) * 2) / 100 + "%"
                    : // Default 1% fee for regular swaps
                      Number(SWAP_FEE) / 100 + "%"
              }
            </span>
          </div>
        )}

        {/* ACTION BUTTON */}
        <Button
          onClick={
            mode === "swap"
              ? executeSwap
              : liquidityMode === "add"
                ? executeAddLiquidity
                : liquidityMode === "remove"
                  ? executeRemoveLiquidity
                  : executeSingleETHLiquidity // Single-ETH mode
          }
          disabled={
            !isConnected ||
            (mode === "swap" && (!canSwap || !sellAmt)) ||
            (mode === "liquidity" &&
              liquidityMode === "add" &&
              (!canSwap || !sellAmt)) ||
            (mode === "liquidity" &&
              liquidityMode === "remove" &&
              (!lpBurnAmount ||
                parseFloat(lpBurnAmount) <= 0 ||
                parseUnits(lpBurnAmount || "0", 18) > lpTokenBalance)) ||
            (mode === "liquidity" &&
              liquidityMode === "single-eth" &&
              (!canSwap || !sellAmt || !reserves)) ||
            isPending
          }
          className="w-full text-base sm:text-lg mt-4 h-12 touch-manipulation"
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {mode === "swap"
                ? "Swapping…"
                : liquidityMode === "add"
                  ? "Adding Liquidity…"
                  : liquidityMode === "remove"
                    ? "Removing Liquidity…"
                    : "Adding Single-ETH Liquidity…"}
            </span>
          ) : mode === "swap" ? (
            "Swap"
          ) : liquidityMode === "add" ? (
            "Add Liquidity"
          ) : liquidityMode === "remove" ? (
            "Remove Liquidity"
          ) : (
            "Add Single-ETH Liquidity"
          )}
        </Button>

        {/* Status and error messages */}
        {/* Show transaction statuses */}
        {txError && txError.includes("Waiting for") && (
          <div className="text-sm text-yellow-600 mt-2 flex items-center">
            <Loader2 className="h-3 w-3 animate-spin mr-2" />
            {txError}
          </div>
        )}

        {/* Show actual errors (only if not a user rejection) */}
        {((writeError && !isUserRejectionError(writeError)) ||
          (txError && !txError.includes("Waiting for"))) && (
          <div className="text-sm text-red-600 mt-2">
            {writeError && !isUserRejectionError(writeError)
              ? writeError.message
              : txError}
          </div>
        )}

        {/* Success message */}
        {isSuccess && (
          <div className="text-sm text-green-600 mt-2 flex items-center">
            <svg
              className="h-3 w-3 mr-2"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            Transaction confirmed!
          </div>
        )}

        {/* Price Chart - Only show when a valid pair is selected in swap mode */}
        {mode === "swap" && (
          <div className="mt-4 border-t border-yellow-100 pt-4">
            {/* Determine which token to use for the chart - prioritize non-ETH token */}
            {(() => {
              // Get the non-ETH token for the chart
              const chartToken =
                buyToken && buyToken.id !== null
                  ? buyToken
                  : sellToken && sellToken.id !== null
                    ? sellToken
                    : null;

              // Only show chart button if we have a non-ETH token with a valid ID
              if (!chartToken || chartToken.id === null) return null;

              return (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() => setShowPriceChart((prev) => !prev)}
                      className="text-xs text-gray-600 flex items-center gap-1 hover:text-gray-900"
                    >
                      {showPriceChart ? "Hide Price Chart" : "Show Price Chart"}
                      <svg
                        className={`w-3 h-3 transition-transform ${showPriceChart ? "rotate-180" : ""}`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>
                    {showPriceChart && (
                      <div className="text-xs text-gray-500">
                        {chartToken.symbol}/ETH price history
                      </div>
                    )}
                  </div>

                  {showPriceChart && (
                    <div
                      className={`transition-all duration-300 ${showPriceChart ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0 overflow-hidden"}`}
                    >
                      <PoolPriceChart
                        poolId={computePoolId(chartToken.id).toString()}
                        ticker={chartToken.symbol}
                      />
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Subtle explorer link */}
        {/* @TODO Decide if remove fully */}
        {/* <div className="text-xs text-gray-400 mt-4 text-center">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              // This assumes App.tsx has access to this function via props
              window.dispatchEvent(new CustomEvent("coinchan:setView", { detail: "menu" }));
            }}
            className="hover:text-gray-600 hover:underline"
          >
            View all coins in explorer
          </a>
        </div> */}
      </CardContent>
    </Card>
  );
};

export default SwapTile;
