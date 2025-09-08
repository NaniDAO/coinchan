import { useInfiniteQuery } from "@tanstack/react-query";
import type { CoinsTableItem, SortBy, SortDir } from "@/types/coins";

type Params = {
  q?: string;
  limit?: number; // default 100 good for virtualization
  sortBy?: SortBy; // defaults to liquidity on server
  sortDir?: SortDir; // defaults to desc on server
};

type ApiResponse = { data: CoinsTableItem[]; nextCursor: string | null };

async function fetchCoins(params: Params, cursor?: string): Promise<ApiResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDir) qs.set("sortDir", params.sortDir);
  if (cursor) qs.set("cursor", cursor);

  const res = await fetch(`${import.meta.env.VITE_INDEXER_URL}/api/coins-table?${qs.toString()}`, {
    headers: { "content-type": "application/json" },
  });
  if (!res.ok) throw new Error(`Coins fetch failed: ${res.status}`);
  return (await res.json()) as ApiResponse;
}

export function useCoinsTable(params: Params) {
  return useInfiniteQuery({
    queryKey: ["coins-table", params],
    queryFn: ({ pageParam }) => fetchCoins(params, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  });
}
