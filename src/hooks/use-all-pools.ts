import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CoinSource, TokenMeta } from "@/lib/coins";

export interface PoolApiRow {
  coinId: string;
  tokenURI?: string;
  name?: string;
  symbol: string;
  description?: string;
  imageUrl?: string;
  decimals: number;
  saleStatus?: string | null;
  votes?: string;

  poolId: string | null;
  reserve0: string; // bigints as strings from API
  reserve1: string;
  price0?: string | null;
  price1?: string | null;
  swapFee: string;
  token0: `0x${string}`;
  token1: `0x${string}`;
  source: "ZAMM" | "COOKBOOK" | string;
}

export type PoolsParams = {
  quote?: string; // e.g. "ETH" (default)
  hasLiquidity?: boolean; // default true
};

const fetchPools = async (): Promise<PoolApiRow[]> => {
  const url = import.meta.env.VITE_INDEXER_URL + `/api/pools`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });
  console.log("fetch pools res", res);

  if (!res.ok) {
    // surfacing server error helps during integration
    const text = await res.text().catch(() => "");
    throw new Error(text || `Failed to fetch pools (${res.status})`);
  }

  const data = await res.json();

  console.log("pools data func", data);

  return data;
};

const toBigIntSafe = (v?: string | null) => {
  try {
    return v ? BigInt(v) : 0n;
  } catch {
    return 0n;
  }
};

/**
 * Fetch raw pools + a derived `poolTokens` array ready for TokenSelector.
 * You can ignore `poolTokens` and just use `data` if you prefer.
 */
export function useAllPools(params?: PoolsParams) {
  const queryKey = [
    "pools",
    params?.quote ?? "ETH",
    params?.hasLiquidity ?? true,
  ];

  const query = useQuery({
    queryKey,
    queryFn: () => fetchPools(),
    staleTime: 30_000, // 30s fresh window
    gcTime: 5 * 60_000, // 5m cache
    refetchOnWindowFocus: false,
  });

  console.log("pools outside data", {
    data: query.data,
  });

  const poolTokens: TokenMeta[] = useMemo(() => {
    console.log("pools data", {
      data: query.data,
    });
    if (!query.data) return [];
    const pools = query.data
      .filter((p) => p.poolId && toBigIntSafe(p.reserve0) > 0n)
      .map((p) => ({
        id: toBigIntSafe(p.coinId),
        name: `${p?.name}`,
        symbol: p.symbol,
        decimals: p.decimals ?? 18,
        poolId: toBigIntSafe(p.poolId),
        reserve0: toBigIntSafe(p.reserve0),
        reserve1: toBigIntSafe(p.reserve1),
        token1: p.token1,
        source: p.source as CoinSource,
        imageUrl: p.imageUrl,
      }));

    return pools;
  }, [query.data]);

  return {
    ...query,
    pools: query.data ?? [],
    poolTokens,
  };
}
