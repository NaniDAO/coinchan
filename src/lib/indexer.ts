export const INDEXER_URL = import.meta.env.VITE_INDEXER_URL;

export interface CandleData {
  /** Timestamp in milliseconds */
  date: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

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
        orderDirection: "asc"
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

  console.log("pool candle chart data:", data);

  return data.candles.items.map((c: any) => ({
    date: parseInt(c.bucketStart),
    open: parseFloat(c.open),
    high: parseFloat(c.high),
    low: parseFloat(c.low),
    close: parseFloat(c.close),
  }));
}
