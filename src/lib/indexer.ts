import { formatUnits } from "viem"; // lightweight, already in your stack

export const INDEXER_URL = import.meta.env.VITE_INDEXER_URL;

export interface CandleData {
  /** Timestamp in milliseconds */
  date: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface PricePointData {
  /** Timestamp in milliseconds */
  timestamp: number;
  price0: number;
  price1: number;
}

const fp18ToFloat = (raw: string) => Number(formatUnits(BigInt(raw), 18));
export const toEthPerZamm = (raw: string) => {
  const zammPerEth = fp18ToFloat(raw);
  return zammPerEth === 0 ? 0 : 1 / zammPerEth;
};
/**
 * Fetches candle data for a given pool and interval from the GraphQL indexer.
 * @param poolId - the pool identifier (as a string representing BigInt)
 * @param interval - one of '1m', '1h', or '1d'
 * @returns array of CandleData sorted by bucketStart ascending
 */
export async function fetchPoolCandles(
  poolId: string,
  interval: "1m" | "1h" | "1d",
): Promise<CandleData[]> {
  const query = `
    query PoolCandles($poolId: BigInt!, $interval: String!) {
      candles(
        where: { poolId: $poolId, interval: $interval },
        orderBy: "bucketStart",
        orderDirection: "asc",
        first: 1000
      ) {
      items {
        id
        poolId
        interval
        bucketStart
        open
        high
        low
        close
      }
    }
  }
  `;

  const response = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { poolId, interval } }),
  });

  if (!response.ok) {
    console.error(`Error fetching candles: ${response.statusText}`);
    throw new Error(`Error fetching candles: ${response.statusText}`);
  }

  const { data, errors } = await response.json();
  if (errors) {
    console.error(`Error in response: ${JSON.stringify(errors)}`);
    throw new Error(`GraphQL errors: ${JSON.stringify(errors)}`);
  }

  return data.candles.items.map((c: any) => ({
    date: Number(c.bucketStart / 1000),
    open: fp18ToFloat(c.open),
    high: fp18ToFloat(c.high),
    low: fp18ToFloat(c.low),
    close: fp18ToFloat(c.close),
  }));
}

/**
 * Fetches price points for a given pool from the GraphQL indexer.
 * @param poolId - the pool identifier (as a string representing BigInt)
 * @returns array of PricePointData sorted by timestamp descending, with duplicate timestamps removed
 */
export async function fetchPoolPricePoints(
  poolId: string,
): Promise<PricePointData[]> {
  const query = `
    query PoolPricePoints($poolId: BigInt!) {
      pricePoints(
        where: { poolId: $poolId },
        orderBy: "timestamp",
        orderDirection: "desc",
        limit: 1000
      ) {
        items {
          price1
          timestamp
        }
      }
    }
  `;

  const response = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { poolId } }),
  });

  if (!response.ok) {
    console.error(`Error fetching price points: ${response.statusText}`);
    throw new Error(`Error fetching price points: ${response.statusText}`);
  }

  const { data, errors } = await response.json();
  if (errors) {
    console.error(`Error in response: ${JSON.stringify(errors)}`);
    throw new Error(`GraphQL errors: ${JSON.stringify(errors)}`);
  }

  // Map and convert the data
  const allPricePoints = data.pricePoints.items.map((p: any) => ({
    timestamp: Number(p.timestamp / 1000),
    price1: fp18ToFloat(p.price1),
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
}
