import { formatUnits } from "viem";

export const INDEXER_URL = import.meta.env.VITE_INDEXER_URL + "/graphql";

export interface CandleData {
  /** Timestamp in milliseconds */
  date: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface PricePointData {
  bucket: number;
  price1: string;
  timestamp: string;
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
 * @param from - optional start timestamp in seconds
 * @param to - optional end timestamp in seconds
 * @returns array of CandleData sorted by bucketStart ascending
 */
export async function fetchPoolCandles(
  poolId: string,
  interval: "1m" | "1h" | "1d",
  from?: number,
  to?: number,
): Promise<CandleData[]> {
  const query = `
    query PoolCandles($poolId: BigInt!, $interval: String!, $from: BigInt, $to: BigInt) {
      candles(
        where: {
          poolId: $poolId,
          interval: $interval,
          bucketStart_gte: $from,
          bucketStart_lte: $to
        },
        orderBy: "bucketStart",
        orderDirection: "desc",
        limit: 1000
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

  console.log("GraphQL query:", {
    query,
    variables: { poolId, interval, from, to },
  });
  const response = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { poolId, interval, from, to } }),
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

  console.log("GraphQL response:", { data, errors });

  return data.candles.items
    .map((c: any) => ({
      date: Number(c.bucketStart),
      open: fp18ToFloat(c.open),
      high: fp18ToFloat(c.high),
      low: fp18ToFloat(c.low),
      close: fp18ToFloat(c.close),
    }))
    .sort((a: any, b: any) => a.date - b.date);
}

/**
 * Fetches price points for a given pool from the API.
 * @param poolId - the pool identifier (as a string representing BigInt)
 * @param startTs - optional start timestamp in milliseconds
 * @param endTs - optional end timestamp in milliseconds
 * @param desiredPoints - optional number of data points to return
 * @returns array of PricePointData sorted by timestamp
 */
export async function fetchPoolPricePoints(
  poolId: string,
  startTs?: number,
  endTs?: number,
  desiredPoints?: number,
): Promise<PricePointData[]> {
  const baseUrl = import.meta.env.VITE_INDEXER_URL + "/api/price-chart";

  // Build query parameters
  const params = new URLSearchParams();
  params.append("poolId", poolId);

  if (startTs !== undefined) {
    params.append("startTs", startTs.toString());
  }

  if (endTs !== undefined) {
    params.append("endTs", endTs.toString());
  }

  if (desiredPoints !== undefined) {
    params.append("desiredPoints", desiredPoints.toString());
  }

  const url = `${baseUrl}?${params.toString()}`;

  const response = await fetch(url);

  if (!response.ok) {
    console.error(`Error fetching price points: ${response.statusText}`);
    throw new Error(`Error fetching price points: ${response.statusText}`);
  }

  const data = await response.json();

  // Map and convert the data
  return data.data.map((p: any) => ({
    timestamp: Number(p.timestamp),
    price0: Number(p.price0),
    price1: Number(p.price1),
  }));
}
