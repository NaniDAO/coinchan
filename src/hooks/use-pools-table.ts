import { useInfiniteQuery } from "@tanstack/react-query";

export type PoolSortBy = "liquidity" | "recency" | "fee" | "price" | "incentives";
export type SortDir = "asc" | "desc";

export type PoolTableItem = {
  poolId: string;
  token0: string;
  token1: string;
  coin0: {
    id: string | null;
    address: string | null;
    name: string | null;
    symbol: string | null;
    decimals: number;
    imageUrl: string | null;
  };
  coin1: {
    id: string | null;
    address: string | null;
    name: string | null;
    symbol: string | null;
    decimals: number;
    imageUrl: string | null;
  };
  priceInEth: number | null;
  liquidityEth: number;
  swapFee: string;
  incentives: number;
  feeOrHook: string;
  hookType: "NONE" | "PRE" | "POST";
  hook: string | null;
  source: "ZAMM" | "COOKBOOK" | "ERC20";
  updatedAt: number | null;
};

type Params = {
  q?: string;
  limit?: number;
  sortBy?: PoolSortBy;
  sortDir?: SortDir;
  hasLiquidity?: boolean;
  quote?: "ETH";
};

type ApiResponse = { data: PoolTableItem[]; nextCursor: string | null };

async function fetchPools(params: Params, cursor?: string): Promise<ApiResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDir) qs.set("sortDir", params.sortDir);
  if (params.hasLiquidity != null) qs.set("hasLiquidity", String(params.hasLiquidity));
  if (params.quote) qs.set("quote", params.quote);
  if (cursor) qs.set("cursor", cursor);

  const res = await fetch(`${import.meta.env.VITE_INDEXER_URL}/api/pools-table?${qs.toString()}`, {
    headers: { "content-type": "application/json" },
  });
  if (!res.ok) throw new Error(`Pools fetch failed: ${res.status}`);
  return (await res.json()) as ApiResponse;
}

export function usePoolsTable(params: Params) {
  return useInfiniteQuery({
    queryKey: ["pools-table", params],
    queryFn: ({ pageParam }) => fetchPools(params, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  });
}
