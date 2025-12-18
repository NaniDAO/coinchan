import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";

export interface SwapEvent {
  id: string;
  poolId: string;
  sender: string;
  recipient: string;
  amount0In: string;
  amount1In: string;
  amount0Out: string;
  amount1Out: string;
  timestamp: string;
  txHash: string;
  blockNumber: string;
}

export interface PoolActivityData {
  swaps: SwapEvent[];
  totalSwaps: number;
}

/**
 * Fetches recent swap events for a pool
 * Uses string interpolation to match the existing GraphQL query pattern
 */
export async function fetchPoolSwaps(
  poolId: string,
  source: "ZAMM" | "COOKBOOK" = "COOKBOOK",
  limit = 50
): Promise<SwapEvent[]> {
  const response = await fetch(`${import.meta.env.VITE_INDEXER_URL}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `
        query GetPoolSwaps {
          swaps(
            where: { poolId: "${poolId}", source: ${source} }
            orderBy: "timestamp"
            orderDirection: "desc"
            limit: ${limit}
          ) {
            items {
              id
              poolId
              sender
              recipient
              amount0In
              amount1In
              amount0Out
              amount1Out
              timestamp
              txHash
              blockNumber
            }
          }
        }
      `,
    }),
  });

  const data = await response.json();

  if (data.errors) {
    console.error("GraphQL errors in fetchPoolSwaps:", data.errors);
    return [];
  }

  return data.data?.swaps?.items || [];
}

/**
 * Hook to fetch pool swap activity
 */
export function usePoolSwaps(poolId?: string, source: "ZAMM" | "COOKBOOK" = "COOKBOOK", limit = 50) {
  return useQuery({
    queryKey: ["pool-swaps", poolId, source, limit],
    queryFn: () => fetchPoolSwaps(poolId!, source, limit),
    enabled: !!poolId,
    staleTime: 30_000, // 30 seconds
    refetchOnWindowFocus: false,
  });
}

/**
 * Fetches holders for a specific coin (ERC6909 token)
 */
export interface TokenHolder {
  address: string;
  balance: string;
}

export async function fetchCoinHolders(coinId: string, limit = 100): Promise<TokenHolder[]> {
  const response = await fetch(
    `${import.meta.env.VITE_INDEXER_URL}/api/holders?coinId=${coinId}&limit=${limit}`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch holders: ${response.status}`);
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Hook to fetch token holders
 */
export function useTokenHolders(coinId?: string, limit = 100) {
  return useQuery({
    queryKey: ["token-holders", coinId, limit],
    queryFn: () => fetchCoinHolders(coinId!, limit),
    enabled: !!coinId,
    staleTime: 60_000, // 1 minute
    refetchOnWindowFocus: false,
  });
}

/**
 * Format swap for display
 */
export function formatSwapEvent(
  swap: SwapEvent,
  token0Symbol: string,
  token1Symbol: string,
  yesIsId0?: boolean
): {
  type: "buy" | "sell";
  side?: "YES" | "NO";
  amountIn: string;
  amountOut: string;
  tokenIn: string;
  tokenOut: string;
  timestamp: Date;
  txHash: string;
} {
  const amount0In = BigInt(swap.amount0In || "0");
  const amount1In = BigInt(swap.amount1In || "0");
  const amount0Out = BigInt(swap.amount0Out || "0");
  const amount1Out = BigInt(swap.amount1Out || "0");

  const isBuyingToken1 = amount0In > 0n && amount1Out > 0n;

  // For prediction markets, determine if buying YES or NO
  let side: "YES" | "NO" | undefined;
  if (yesIsId0 !== undefined) {
    if (isBuyingToken1) {
      // Buying token1, selling token0
      side = yesIsId0 ? "NO" : "YES"; // If YES is id0, buying id1 means buying NO
    } else {
      // Buying token0, selling token1
      side = yesIsId0 ? "YES" : "NO";
    }
  }

  return {
    type: isBuyingToken1 ? "buy" : "sell",
    side,
    amountIn: formatUnits(isBuyingToken1 ? amount0In : amount1In, 18),
    amountOut: formatUnits(isBuyingToken1 ? amount1Out : amount0Out, 18),
    tokenIn: isBuyingToken1 ? token0Symbol : token1Symbol,
    tokenOut: isBuyingToken1 ? token1Symbol : token0Symbol,
    timestamp: new Date(Number(swap.timestamp) * 1000),
    txHash: swap.txHash,
  };
}
