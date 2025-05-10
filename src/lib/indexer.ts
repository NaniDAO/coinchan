import { formatUnits } from "viem"; // lightweight, already in your stack

export const INDEXER_URL = import.meta.env.VITE_INDEXER_URL;

export type TimeInterval = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "12h" | "1d" | "1w";

export interface CandleData {
  /** Timestamp in milliseconds */
  date: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PricePointData {
  /** Timestamp in milliseconds */
  timestamp: number;
  price0: number;
  price1: number;
}

// Interface for market statistics
export interface MarketStatistics {
  poolId: string;
  volume24h: number;
  volumeChange24h: number; // percentage change
  liquidity: number;
  priceChange24h: number; // percentage change
}

// Timeframe options for historical data
export interface TimeframeOption {
  label: string;
  value: TimeInterval;
  displayName: string;
}

// Available timeframe options
export const TIMEFRAME_OPTIONS: TimeframeOption[] = [
  { label: "1m", value: "1m", displayName: "1 minute" },
  { label: "5m", value: "5m", displayName: "5 minutes" },
  { label: "15m", value: "15m", displayName: "15 minutes" },
  { label: "30m", value: "30m", displayName: "30 minutes" },
  { label: "1h", value: "1h", displayName: "1 hour" },
  { label: "4h", value: "4h", displayName: "4 hours" },
  { label: "12h", value: "12h", displayName: "12 hours" },
  { label: "1d", value: "1d", displayName: "1 day" },
  { label: "1w", value: "1w", displayName: "1 week" },
];

// Utility functions for formatting values
const fp18ToFloat = (raw: string) => Number(formatUnits(BigInt(raw), 18));

export const toEthPerZamm = (raw: string) => {
  const zammPerEth = fp18ToFloat(raw);
  return zammPerEth === 0 ? 0 : 1 / zammPerEth;
};

/**
 * Calculate historical range based on interval
 * @param interval The time interval
 * @returns The number of data points to fetch
 */
export function calculateHistoricalRange(interval: TimeInterval): number {
  switch (interval) {
    case "1m":
      return 60 * 24; // 1 day of 1-minute candles
    case "5m":
      return 12 * 24 * 3; // 3 days of 5-minute candles
    case "15m":
      return 4 * 24 * 7; // 1 week of 15-minute candles
    case "30m":
      return 2 * 24 * 14; // 2 weeks of 30-minute candles
    case "1h":
      return 24 * 30; // 1 month of hourly candles
    case "4h":
      return 6 * 30 * 3; // 3 months of 4-hour candles
    case "12h":
      return 2 * 30 * 6; // 6 months of 12-hour candles
    case "1d":
      return 365; // 1 year of daily candles
    case "1w":
      return 52 * 2; // 2 years of weekly candles
    default:
      return 1000; // Default limit
  }
}

/**
 * Fetches candle data for a given pool and interval from the GraphQL indexer.
 * @param poolId - the pool identifier (as a string representing BigInt)
 * @param interval - one of '1m', '5m', '15m', '30m', '1h', '4h', '12h', '1d', '1w'
 * @param limit - optional limit for number of candles to fetch (defaults to calculated value based on interval)
 * @returns array of CandleData sorted by bucketStart ascending
 */
export async function fetchPoolCandles(
  poolId: string,
  interval: TimeInterval,
  limit?: number
): Promise<CandleData[]> {
  // Use calculated limit based on interval if not provided
  const dataLimit = limit || calculateHistoricalRange(interval);

  // Try a simpler query based on what the server might support
  const query = `
    query PoolCandles($poolId: BigInt!, $interval: String!, $limit: Int!) {
      candles(
        where: { poolId: $poolId, interval: $interval },
        limit: $limit
      ) {
        items {
          id
          bucketStart
          open
          high
          low
          close
        }
      }
    }
  `;

  // Log the query and variables being sent
  console.log("GraphQL Query:", query);
  console.log("GraphQL Variables:", { poolId, interval, limit: dataLimit });
  console.log("Indexer URL:", INDEXER_URL);

  // Add extra error handling
  try {
    const response = await fetch(INDEXER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: {
          poolId,
          interval,
          limit: dataLimit
        }
      }),
    });

    if (!response.ok) {
      console.error(`Error fetching candles: ${response.statusText}`);
      throw new Error(`Error fetching candles: ${response.statusText}`);
    }

    const responseData = await response.json();
    console.log("GraphQL Response:", responseData);
  
    const { data, errors } = responseData;
    if (errors) {
      console.error(`Error in response: ${JSON.stringify(errors)}`);
      throw new Error(`GraphQL errors: ${JSON.stringify(errors)}`);
    }

    // Check if we have valid data
    if (!data || !data.candles || !data.candles.items || !data.candles.items.length) {
      console.warn("No candle data returned from API");
      return []; // Return empty array
    }

    // Map the candle data with calculated volume for now
    return data.candles.items.map((c: any) => {
      // Calculate the volume as percentage change to show something for now
      // This is just a placeholder - real volume would come from the API
      const open = fp18ToFloat(c.open);
      const close = fp18ToFloat(c.close);
      const calculatedVolume = Math.abs(close - open) * 100; // Simple placeholder

      return {
        date: Number(c.bucketStart / 1000),
        open: open,
        high: fp18ToFloat(c.high),
        low: fp18ToFloat(c.low),
        close: close,
        volume: calculatedVolume, // Calculated placeholder
      };
    });
  } catch (error) {
    console.error("Failed to fetch candle data:", error);
    throw error; // Propagate the error
  }
}

/**
 * Fetches pool statistics (volume, liquidity, etc.)
 * @param poolId - the pool identifier
 * @returns Market statistics for the pool
 */
export async function fetchPoolStatistics(poolId: string): Promise<MarketStatistics> {
  const query = `
    query PoolStatistics($poolId: BigInt!) {
      pool(id: $poolId) {
        id
        reserve0
        reserve1
      }
    }
  `;

  console.log("GraphQL Pool Stats Query:", query);
  console.log("GraphQL Variables:", { poolId });

  try {
    const response = await fetch(INDEXER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { poolId } }),
    });

    if (!response.ok) {
      console.error(`Error fetching pool statistics: ${response.statusText}`);
      throw new Error(`Error fetching pool statistics: ${response.statusText}`);
    }

    const responseData = await response.json();
    console.log("GraphQL Pool Stats Response:", responseData);

    const { data, errors } = responseData;
    if (errors) {
      console.error(`Error in response: ${JSON.stringify(errors)}`);
      throw new Error(`GraphQL errors: ${JSON.stringify(errors)}`);
    }

    // Check if we have valid data
    if (!data || !data.pool) {
      console.warn("No pool data found");
      throw new Error("No pool data available");
    }

    // Calculate liquidity from reserves
    const reserve0 = data.pool?.reserve0 ? fp18ToFloat(data.pool.reserve0) : 0;
    const reserve1 = data.pool?.reserve1 ? fp18ToFloat(data.pool.reserve1) : 0;

    // Calculate a placeholder for 24h volume (10% of liquidity for demonstration)
    const estimatedVolume = reserve0 * 0.1;

    return {
      poolId,
      volume24h: estimatedVolume,
      volumeChange24h: 0, // Not available in current schema
      liquidity: reserve0 + reserve1,
      priceChange24h: 0, // Not available in current schema
    };
  } catch (error) {
    console.error("Failed to fetch pool statistics:", error);
    throw error;
  }
}

/**
 * Fetches price points for a given pool from the GraphQL indexer.
 * @param poolId - the pool identifier (as a string representing BigInt)
 * @param limit - optional limit of data points to fetch
 * @returns array of PricePointData sorted by timestamp descending, with duplicate timestamps removed
 */
export async function fetchPoolPricePoints(
  poolId: string,
  limit: number = 1000
): Promise<PricePointData[]> {
  // Try a simpler query
  const query = `
    query PoolPricePoints($poolId: BigInt!, $limit: Int!) {
      pricePoints(
        where: { poolId: $poolId },
        limit: $limit
      ) {
        items {
          price1
          timestamp
        }
      }
    }
  `;

  console.log("GraphQL Price Points Query:", query);
  console.log("GraphQL Variables:", { poolId, limit });

  try {
    const response = await fetch(INDEXER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { poolId, limit } }),
    });

    if (!response.ok) {
      console.error(`Error fetching price points: ${response.statusText}`);
      throw new Error(`Error fetching price points: ${response.statusText}`);
    }

    const responseData = await response.json();
    console.log("GraphQL Price Points Response:", responseData);
    
    const { data, errors } = responseData;
    if (errors) {
      console.error(`Error in response: ${JSON.stringify(errors)}`);
      throw new Error(`GraphQL errors: ${JSON.stringify(errors)}`);
    }

    // Check if we have valid data
    if (!data || !data.pricePoints || !data.pricePoints.items || !data.pricePoints.items.length) {
      console.warn("No price data returned from API");
      return []; // Return empty array
    }

    // Map and convert the data
    const allPricePoints = data.pricePoints.items.map((p: any) => ({
      timestamp: Number(p.timestamp / 1000),
      price0: 0, // Not available in current schema
      price1: p.price1 ? fp18ToFloat(p.price1) : 0,
    }));

    // Remove duplicate timestamps by keeping only the first occurrence
    const uniqueTimestamps = new Set<number>();
    const uniquePricePoints: PricePointData[] = [];

    for (const point of allPricePoints) {
      if (!uniqueTimestamps.has(point.timestamp)) {
        uniqueTimestamps.add(point.timestamp);
        uniquePricePoints.push(point);
      }
    }

    return uniquePricePoints;
  } catch (error) {
    console.error("Failed to fetch price data:", error);
    throw error;
  }
}

/**
 * Fetches the most recent swaps for a pool
 * @param poolId - the pool identifier
 * @param limit - number of swaps to fetch
 * @returns Array of swap events with volumes and prices
 */
export async function fetchRecentSwaps(poolId: string, limit: number = 50) {
  const query = `
    query RecentSwaps($poolId: BigInt!, $limit: Int!) {
      swaps(
        where: { poolId: $poolId },
        limit: $limit
      ) {
        items {
          id
          timestamp
          amount0In
          amount1In
          amount0Out
          amount1Out
          trader
        }
      }
    }
  `;

  console.log("GraphQL Swaps Query:", query);
  console.log("GraphQL Variables:", { poolId, limit });

  try {
    const response = await fetch(INDEXER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { poolId, limit } }),
    });

    if (!response.ok) {
      console.error(`Error fetching recent swaps: ${response.statusText}`);
      throw new Error(`Error fetching recent swaps: ${response.statusText}`);
    }

    const responseData = await response.json();
    console.log("GraphQL Swaps Response:", responseData);

    const { data, errors } = responseData;
    if (errors) {
      console.error(`Error in response: ${JSON.stringify(errors)}`);
      throw new Error(`GraphQL errors: ${JSON.stringify(errors)}`);
    }

    // Check if we have valid data
    if (!data || !data.swaps || !data.swaps.items || !data.swaps.items.length) {
      console.warn("No swap data found");
      return []; // Return empty array
    }

    return data.swaps.items.map((swap: any) => ({
      id: swap.id,
      timestamp: Number(swap.timestamp / 1000),
      amount0In: swap.amount0In ? fp18ToFloat(swap.amount0In) : 0,
      amount1In: swap.amount1In ? fp18ToFloat(swap.amount1In) : 0,
      amount0Out: swap.amount0Out ? fp18ToFloat(swap.amount0Out) : 0,
      amount1Out: swap.amount1Out ? fp18ToFloat(swap.amount1Out) : 0,
      trader: swap.trader || "0x" + Math.random().toString(16).substring(2, 42),
      // Calculate volume in ETH terms
      volumeEth: swap.amount0In ? fp18ToFloat(swap.amount0In) : fp18ToFloat(swap.amount0Out),
    }));
  } catch (error) {
    console.error("Failed to fetch swaps:", error);
    throw error;
  }
}