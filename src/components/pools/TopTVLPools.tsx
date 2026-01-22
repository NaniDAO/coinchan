import { useMemo } from "react";
import { PoolTokenImage } from "../PoolTokenImage";
import { Badge } from "../ui/badge";
import { usePoolApy } from "@/hooks/use-pool-apy";
import { Link } from "@tanstack/react-router";
import { encodeTokenQ } from "@/lib/token-query";
import { Address } from "viem";
import { bpsToPct } from "@/lib/pools";
import { usePoolsTable, PoolTableItem } from "@/hooks/use-pools-table";

function shortenHex(addr?: string | null) {
  if (!addr) return "";
  const s = String(addr);
  return s.length > 10 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

export default function TopPoolsByTVLSection({
  limit = 5,
}: {
  limit?: number;
}) {
  const { data, isLoading, isError, error } = usePoolsTable({
    limit: 100,
    sortBy: "liquidity",
    sortDir: "desc",
    hasLiquidity: true,
    quote: "ETH",
  });

  const pools = useMemo(() => {
    const rows = (data?.pages ?? []).flatMap((p) => p.data);

    // Filter pools with valid metadata (both coins must have address and id)
    const validRows = rows.filter((row) => {
      const hasCoin0 = row.coin0?.address && row.coin0?.id != null;
      const hasCoin1 = row.coin1?.address && row.coin1?.id != null;
      return hasCoin0 && hasCoin1;
    });

    return validRows.slice(0, limit);
  }, [data, limit]);

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

      {!!pools.length && (
        <ul className="flex flex-col space-y-2">
          {pools.map((p) => (
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
  const { data: poolApyData } = usePoolApy(pool.poolId, pool.source);

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

  const feeParam = pool?.source === "ZAMM" ? String(pool.swapFee) : String(pool.feeOrHook || pool.swapFee);
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
              {BigInt(pool.feeOrHook) > 1000n ? `${pool.hookType} Hook` : bpsToPct(pool.swapFee)}
            </Badge>
          </div>
        </div>
      </div>

      <div className="text-muted-foreground">{poolApy === null || poolApy === 0 ? "N/A" : `${poolApy}%`}</div>
    </Link>
  );
};
