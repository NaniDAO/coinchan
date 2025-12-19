import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";

export interface PoolEvent {
  type: "BUY" | "SELL" | "LIQADD" | "LIQREM";
  timestamp: number;
  txhash: string;
  maker: string;
  to?: string; // LP recipient address (for LIQADD events, the actual LP token recipient)
  amount0_in: string;
  amount0_out: string;
  amount1_in: string;
  amount1_out: string;
}

export interface SwapEvent {
  id: string;
  poolId: string;
  type: "BUY" | "SELL";
  sender: string;
  amount0In: string;
  amount1In: string;
  amount0Out: string;
  amount1Out: string;
  timestamp: string;
  txHash: string;
}

/**
 * Fetches recent events for a pool using the REST API
 */
export async function fetchPoolEvents(poolId: string, limit = 50): Promise<PoolEvent[]> {
  const url = `${import.meta.env.VITE_INDEXER_URL}/api/events?poolId=${poolId}&limit=${limit}`;
  const response = await fetch(url);

  if (!response.ok) {
    console.error("Failed to fetch pool events:", response.status);
    return [];
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Hook to fetch pool swap activity using REST API
 */
export function usePoolSwaps(poolId?: string, _source?: "ZAMM" | "COOKBOOK", limit = 50) {
  return useQuery({
    queryKey: ["pool-events", poolId, limit],
    queryFn: async () => {
      const events = await fetchPoolEvents(poolId!, limit);
      // Filter to only swap events (BUY/SELL) and convert to SwapEvent format
      return events
        .filter((e) => e.type === "BUY" || e.type === "SELL")
        .map((e): SwapEvent => ({
          id: `${e.txhash}-${e.timestamp}`,
          poolId: poolId!,
          type: e.type as "BUY" | "SELL",
          sender: e.maker,
          amount0In: e.amount0_in || "0",
          amount1In: e.amount1_in || "0",
          amount0Out: e.amount0_out || "0",
          amount1Out: e.amount1_out || "0",
          timestamp: String(e.timestamp),
          txHash: e.txhash,
        }));
    },
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
  const response = await fetch(`${import.meta.env.VITE_INDEXER_URL}/api/holders?coinId=${coinId}&limit=${limit}`);

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
 * LP Provider for a pool
 */
export interface LpProvider {
  user: string;
  liquidity: string;
  lastActivity: number;
}

/**
 * Fetches LP providers for a pool by analyzing liquidity add/remove events
 * For PAMM pools, the indexer should emit the `to` field with the actual LP recipient
 * (the user who received the LP tokens), not the PAMM contract that called ZAMM.
 * Falls back to `maker` if `to` is not available.
 */
export async function fetchPoolLpProviders(poolId: string, limit = 100): Promise<LpProvider[]> {
  // Fetch more events to get a comprehensive picture of LP activity
  const events = await fetchPoolEvents(poolId, 500);

  // Filter to only liquidity events
  const liquidityEvents = events.filter((e) => e.type === "LIQADD" || e.type === "LIQREM");

  // Aggregate by LP recipient address to calculate net liquidity
  // Use `to` field if available (actual LP recipient), fall back to `maker`
  const lpMap = new Map<string, { netLiquidity: bigint; lastActivity: number }>();

  for (const event of liquidityEvents) {
    // For LIQADD, prefer `to` (the actual LP recipient) over `maker` (could be PAMM contract)
    // For LIQREM, the `maker` is the one removing liquidity
    const lpAddress = (event.type === "LIQADD" ? event.to || event.maker : event.maker).toLowerCase();
    const current = lpMap.get(lpAddress) || { netLiquidity: 0n, lastActivity: 0 };

    // Calculate net contribution (add - remove) based on token0 amounts
    const amount0 = event.type === "LIQADD" ? BigInt(event.amount0_in || "0") : -BigInt(event.amount0_out || "0");

    lpMap.set(lpAddress, {
      netLiquidity: current.netLiquidity + amount0,
      lastActivity: Math.max(current.lastActivity, event.timestamp),
    });
  }

  // Convert to array and filter out those with non-positive liquidity
  const providers: LpProvider[] = [];
  for (const [user, data] of lpMap) {
    if (data.netLiquidity > 0n) {
      providers.push({
        user,
        liquidity: data.netLiquidity.toString(),
        lastActivity: data.lastActivity,
      });
    }
  }

  // Sort by liquidity descending
  providers.sort((a, b) => (BigInt(b.liquidity) > BigInt(a.liquidity) ? 1 : -1));

  return providers.slice(0, limit);
}

/**
 * Hook to fetch LP providers for a pool
 */
export function usePoolLpProviders(poolId?: string, limit = 50) {
  return useQuery({
    queryKey: ["pool-lp-providers", poolId, limit],
    queryFn: () => fetchPoolLpProviders(poolId!, limit),
    enabled: !!poolId,
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
  yesIsId0?: boolean,
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

  // Use the type from the event if available, otherwise derive from amounts
  const isBuy = swap.type === "BUY" || (amount0In > 0n && amount1Out > 0n);

  // For prediction markets, determine if buying YES or NO
  let side: "YES" | "NO" | undefined;
  if (yesIsId0 !== undefined) {
    if (isBuy) {
      // Buying token1, selling token0
      side = yesIsId0 ? "NO" : "YES"; // If YES is id0, buying id1 means buying NO
    } else {
      // Selling token1, getting token0
      side = yesIsId0 ? "YES" : "NO";
    }
  }

  return {
    type: isBuy ? "buy" : "sell",
    side,
    amountIn: formatUnits(isBuy ? amount0In : amount1In, 18),
    amountOut: formatUnits(isBuy ? amount1Out : amount0Out, 18),
    tokenIn: isBuy ? token0Symbol : token1Symbol,
    tokenOut: isBuy ? token1Symbol : token0Symbol,
    timestamp: new Date(Number(swap.timestamp) * 1000),
    txHash: swap.txHash,
  };
}
