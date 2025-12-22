import { useReadContract } from "wagmi";
import { PMRouterAddress, PMRouterAbi, type PMRouterOrder, getOrderPrice } from "@/constants/PMRouter";

const ORDERBOOK_DEPTH = 20;

export interface OrderbookEntry {
  orderHash: `0x${string}`;
  order: PMRouterOrder;
  price: number; // collateral per share
  size: bigint; // shares available
  total: bigint; // cumulative size
}

export interface Orderbook {
  bids: OrderbookEntry[]; // Buy orders (sorted by price descending - best bid first)
  asks: OrderbookEntry[]; // Sell orders (sorted by price ascending - best ask first)
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  midPrice: number | null;
}

/**
 * Fetch orderbook for a prediction market from PMRouter
 * Returns bids (buy orders) and asks (sell orders) sorted by price
 */
export function useMarketOrderbook({
  marketId,
  isYes = true,
  depth = ORDERBOOK_DEPTH,
  enabled = true,
}: {
  marketId?: bigint;
  isYes?: boolean;
  depth?: number;
  enabled?: boolean;
}) {
  const {
    data: orderbookData,
    isLoading,
    error,
    refetch,
  } = useReadContract({
    address: PMRouterAddress,
    abi: PMRouterAbi,
    functionName: "getOrderbook",
    args: marketId !== undefined ? [marketId, isYes, BigInt(depth)] : undefined,
    query: {
      enabled: enabled && marketId !== undefined,
      staleTime: 10_000, // 10 seconds - orderbook changes frequently
      refetchInterval: 15_000, // Auto-refresh every 15 seconds
    },
  });

  // Process raw orderbook data into structured format
  const orderbook: Orderbook | null = orderbookData ? processOrderbook(orderbookData) : null;

  return {
    orderbook,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Process raw orderbook data from PMRouter into structured format
 */
function processOrderbook(
  data: readonly [
    readonly `0x${string}`[],
    readonly {
      owner: `0x${string}`;
      deadline: bigint;
      isYes: boolean;
      isBuy: boolean;
      partialFill: boolean;
      shares: bigint;
      collateral: bigint;
      marketId: bigint;
    }[],
    readonly `0x${string}`[],
    readonly {
      owner: `0x${string}`;
      deadline: bigint;
      isYes: boolean;
      isBuy: boolean;
      partialFill: boolean;
      shares: bigint;
      collateral: bigint;
      marketId: bigint;
    }[],
  ],
): Orderbook {
  const [bidHashes, bidOrdersRaw, askHashes, askOrdersRaw] = data;

  // Convert to OrderbookEntry format
  const bids: OrderbookEntry[] = bidHashes.map((hash, i) => {
    const order = bidOrdersRaw[i];
    const pmOrder: PMRouterOrder = {
      owner: order.owner,
      deadline: order.deadline,
      isYes: order.isYes,
      isBuy: order.isBuy,
      partialFill: order.partialFill,
      shares: order.shares,
      collateral: order.collateral,
      marketId: order.marketId,
    };
    return {
      orderHash: hash,
      order: pmOrder,
      price: getOrderPrice(pmOrder),
      size: order.shares,
      total: 0n, // Will be calculated below
    };
  });

  const asks: OrderbookEntry[] = askHashes.map((hash, i) => {
    const order = askOrdersRaw[i];
    const pmOrder: PMRouterOrder = {
      owner: order.owner,
      deadline: order.deadline,
      isYes: order.isYes,
      isBuy: order.isBuy,
      partialFill: order.partialFill,
      shares: order.shares,
      collateral: order.collateral,
      marketId: order.marketId,
    };
    return {
      orderHash: hash,
      order: pmOrder,
      price: getOrderPrice(pmOrder),
      size: order.shares,
      total: 0n,
    };
  });

  // Sort bids by price descending (best bid = highest price first)
  bids.sort((a, b) => b.price - a.price);

  // Sort asks by price ascending (best ask = lowest price first)
  asks.sort((a, b) => a.price - b.price);

  // Calculate cumulative totals
  let bidTotal = 0n;
  for (const bid of bids) {
    bidTotal += bid.size;
    bid.total = bidTotal;
  }

  let askTotal = 0n;
  for (const ask of asks) {
    askTotal += ask.size;
    ask.total = askTotal;
  }

  // Calculate spread metrics
  const bestBid = bids.length > 0 ? bids[0].price : null;
  const bestAsk = asks.length > 0 ? asks[0].price : null;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
  const midPrice = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;

  return {
    bids,
    asks,
    bestBid,
    bestAsk,
    spread,
    midPrice,
  };
}

/**
 * Get the best available price for a given side
 */
export function getBestPrice(orderbook: Orderbook | null, isBuy: boolean): number | null {
  if (!orderbook) return null;
  // If buying shares, you hit the asks (sellers)
  // If selling shares, you hit the bids (buyers)
  return isBuy ? orderbook.bestAsk : orderbook.bestBid;
}

/**
 * Calculate how much you'd get/pay by consuming orderbook depth
 * @param orderbook The orderbook
 * @param isBuy Whether you're buying or selling shares
 * @param amount Amount of shares to trade
 * @returns { totalCost, avgPrice, entries } or null if insufficient liquidity
 */
export function calculateOrderbookExecution(
  orderbook: Orderbook | null,
  isBuy: boolean,
  amount: bigint,
): { totalCost: bigint; avgPrice: number; filledOrders: OrderbookEntry[] } | null {
  if (!orderbook || amount === 0n) return null;

  // If buying, consume asks; if selling, consume bids
  const entries = isBuy ? orderbook.asks : orderbook.bids;
  if (entries.length === 0) return null;

  let remaining = amount;
  let totalCost = 0n;
  const filledOrders: OrderbookEntry[] = [];

  for (const entry of entries) {
    if (remaining === 0n) break;

    const fillSize = remaining > entry.size ? entry.size : remaining;
    // Cost = (shares * collateral) / shares = collateral proportional to fill
    const fillCost = (fillSize * entry.order.collateral) / entry.order.shares;

    totalCost += fillCost;
    remaining -= fillSize;
    filledOrders.push(entry);
  }

  // If we couldn't fill the entire amount, return what we could fill
  const filledAmount = amount - remaining;
  if (filledAmount === 0n) return null;

  const avgPrice = Number(totalCost) / Number(filledAmount);

  return { totalCost, avgPrice, filledOrders };
}
