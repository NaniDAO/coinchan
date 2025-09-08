import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PoolTokenImage } from "../PoolTokenImage";
import { Badge } from "../ui/badge";
import { usePoolApy } from "@/hooks/use-pool-apy";
import { Link } from "@tanstack/react-router";
import { encodeTokenQ } from "@/lib/token-query";
import { Address } from "viem";
import { bpsToPct } from "@/lib/pools";

/**
 * TopPoolsByTVL
 * - Fetches pools from `${VITE_INDEXER_URL}/api/pools-table`
 * - Uses liquidityEth to compute TVL in ETH (TVL = 2 × liquidityEth for ETH-quoted pools)
 * - Displays the top pools by TVL with basic metadata
 *
 * Requirements:
 * - Wrap your app with <QueryClientProvider client={queryClient}> from @tanstack/react-query
 * - Define VITE_INDEXER_URL in your Vite env
 */

// ----------------------------- Types -----------------------------

type HookType = "NONE" | "PRE" | "POST";

type CoinMeta = {
  id: string | null;
  address: string | null;
  name: string | null;
  symbol: string | null;
  decimals: number;
  imageUrl: string | null;
};

type PoolTableItem = {
  poolId: string;
  token0: string;
  token1: string;
  coin0: CoinMeta;
  coin1: CoinMeta;
  priceInEth: number | null;
  liquidityEth: number; // ETH side only, in ETH
  swapFee: string; // integer per-10k as string
  incentives: number;
  feeOrHook: string;
  hookType: HookType;
  hook: string | null;
  source: "ZAMM" | "COOKBOOK" | "ERC20";
  updatedAt: number | null; // epoch seconds
};

type PoolsApiResponse = {
  data: PoolTableItem[];
  nextCursor: string | null;
};

// ----------------------------- Utils -----------------------------

const INDEXER_URL = (import.meta as any).env?.VITE_INDEXER_URL as string | undefined;

function assertIndexerUrl(): string {
  if (!INDEXER_URL) {
    throw new Error("VITE_INDEXER_URL is not set. Please define it in your environment (.env).");
  }
  return INDEXER_URL;
}

function shortenHex(addr?: string | null) {
  if (!addr) return "";
  const s = String(addr);
  return s.length > 10 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

// ----------------------------- Data Hook -----------------------------

export function useTopPoolsByTVL(limit = 10) {
  const base = assertIndexerUrl();

  return useQuery({
    queryKey: ["top-pools-by-tvl", base, limit],
    queryFn: async (): Promise<PoolTableItem[]> => {
      const url = new URL("/api/pools-table", base);
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("sortBy", "liquidity"); // TVL ~ 2×liquidity
      url.searchParams.set("sortDir", "desc");
      url.searchParams.set("hasLiquidity", "true");
      url.searchParams.set("quote", "ETH");

      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const json = (await res.json()) as PoolsApiResponse | PoolTableItem[];
      const data = Array.isArray(json) ? json : json.data;

      // Attach TVL (ETH) = 2 × liquidityEth. Sort just in case.
      const withTvl = data
        .map((p) => ({ ...p, tvlEth: (p.liquidityEth ?? 0) * 2 }))
        .sort((a, b) => (b.tvlEth ?? 0) - (a.tvlEth ?? 0));

      return withTvl as unknown as PoolTableItem[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ----------------------------- UI Component -----------------------------

export default function TopPoolsByTVLSection({
  limit = 5,
}: {
  limit?: number;
}) {
  const { data, isLoading, isError, error } = useTopPoolsByTVL(limit);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Top pools by TVL</h3>
      </div>

      {isLoading && (
        <div className="grid gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl border bg-gray-50" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-2xl border p-4 text-sm text-red-600">
          Failed to load pools: {(error as Error)?.message}
        </div>
      )}

      {!!data && (
        <ul className="flex flex-col space-y-2">
          {data.slice(0, limit).map((p) => (
            <li key={p.poolId}>
              <PoolCard pool={p} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const PoolCard = ({ pool }: { pool: PoolTableItem }) => {
  const { data: poolApyData } = usePoolApy(pool.poolId);

  // Guard while loading/absent
  const tokenAParam = pool?.token0
    ? encodeTokenQ({
        address: pool.token0 as Address,
        id: typeof pool.coin0.id === "bigint" ? pool.coin0.id : BigInt(pool.coin0.id ?? "0"),
      })
    : undefined;

  const tokenBParam = pool?.token1
    ? encodeTokenQ({
        address: pool.token1 as Address,
        id: typeof pool.coin1.id === "bigint" ? pool.coin1.id : BigInt(pool.coin1.id ?? "0"),
      })
    : undefined;

  const feeParam = pool?.swapFee ? String(pool.swapFee) : undefined;
  const protocolParam = pool?.source === "ZAMM" ? "ZAMMV0" : "ZAMMV1";

  const poolApy = useMemo(() => {
    if (!poolApyData) return null;
    return Number(poolApyData.slice(0, -1));
  }, [poolApyData]);

  return (
    <Link
      to="/positions/create"
      search={{
        tokenA: tokenAParam,
        tokenB: tokenBParam,
        ...(feeParam ? { fee: feeParam } : {}),
        ...(protocolParam ? { protocol: protocolParam } : {}),
      }}
      className="hover:scale-105 focus:bg-muted bg-background p-3 rounded-xl border border-muted flex items-start justify-between gap-3"
    >
      <div className="flex items-center gap-3">
        <PoolTokenImage
          imageUrl0={pool.coin0?.imageUrl}
          imageUrl1={pool.coin1?.imageUrl}
          className="h-11 w-11 border-muted"
        />
        <div className="min-w-0">
          <div className="truncate font-medium">
            {pool.coin0?.symbol || "UNK"} / {pool.coin1?.symbol || shortenHex(pool.token1)}
          </div>
          <div className="mt-1 text-xs flex flex-row gap-1">
            <Badge variant="secondary" className="text-xs text-muted-foreground">
              {pool.source === "ZAMM" ? "v0" : "v1"}
            </Badge>
            <Badge variant="secondary" className="text-xs text-muted-foreground">
              {bpsToPct(pool.swapFee)}
            </Badge>
          </div>
        </div>
      </div>

      {/* Right: TVL */}
      <div className="text-muted-foreground">{poolApy !== null ? `${poolApy}%` : "N/A"}</div>
    </Link>
  );
};
