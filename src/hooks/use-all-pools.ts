import { useQuery } from "@tanstack/react-query";

export interface PoolPlainRow {
  // pool
  poolId: string;
  token0: `0x${string}`;
  token1: `0x${string}`;
  swapFee: string; // bigint as string
  feeOrHook: string; // bigint as string
  hookType: string; // e.g. "NONE"
  hook?: `0x${string}` | null;

  reserve0: string; // bigint as string (ETH-side on this indexer)
  reserve1: string; // bigint as string
  price0?: string | null; // reserve1 / reserve0
  price1?: string | null; // inverse
  source: "ZAMM" | "COOKBOOK" | string;
  updatedAt?: string | null;

  // coins
  coin0: {
    id?: string | null;
    address?: `0x${string}` | null;
    name?: string | null;
    symbol?: string | null;
    decimals?: number | null;
    imageUrl?: string | null;
  };
  coin1: {
    id?: string | null;
    address?: `0x${string}` | null;
    name?: string | null;
    symbol?: string | null;
    decimals?: number | null;
    imageUrl?: string | null;
  };
}

export type PoolsParams = {
  quote?: string; // kept for API parity, currently unused by /pools-plain
  hasLiquidity?: boolean; // default true
};

const buildUrl = (params?: PoolsParams) => {
  const base = import.meta.env.VITE_INDEXER_URL + `/api/pools-plain`;
  const usp = new URLSearchParams();
  if (params?.hasLiquidity !== undefined) usp.set("hasLiquidity", String(params.hasLiquidity));
  const qs = usp.toString();
  return qs ? `${base}?${qs}` : base;
};

const fetchPools = async (params?: PoolsParams): Promise<PoolPlainRow[]> => {
  const url = buildUrl(params);
  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Failed to fetch pools (${res.status})`);
  }

  return res.json();
};

/**
 * Fetch raw pools + a derived `poolTokens` array ready for TokenSelector.
 * - Uses the non-ETH side coin for display (typically coin1).
 * - Sorted by highest ETH-side reserves (reserve0) first.
 * - Each option is uniquely identified by `poolId`.
 */
export function useAllPools(params?: PoolsParams) {
  const queryKey = ["pools-plain", params?.quote ?? "ETH", params?.hasLiquidity ?? true];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const pools = await fetchPools(params);

      // filter out pools with missing coin ids or addresses
      return pools.filter(
        (p) => p.coin0.id != null && p.coin0.address != null && p.coin1.id != null && p.coin1.address != null,
      );
    },
    staleTime: 30_000, // 30s fresh window
    gcTime: 5 * 60_000, // 5m cache
    refetchOnWindowFocus: false,
  });

  return {
    ...query,
    pools: (query.data ?? []) as PoolPlainRow[],
  };
}
