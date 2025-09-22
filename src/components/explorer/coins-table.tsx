import { useMemo, useRef, useEffect, useState } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { CoinsTableItem, SortBy } from "@/types/coins";
import { useCoinsTable } from "@/hooks/use-coins-table";
import { Search as SearchIcon } from "lucide-react";
import { useEthUsdPrice } from "@/hooks/use-eth-usd-price";
import { useActiveIncentiveStreams } from "@/hooks/use-incentive-streams";
import { Input } from "../ui/input";
import { TokenImage } from "../TokenImage";
import { Link } from "@tanstack/react-router";

// ---------- formatting helpers ----------
const fmt0 = (n?: number | null) =>
  n == null ? "—" : Intl.NumberFormat().format(n);
const fmt2 = (n?: number | null) => {
  if (n == null) return "—";
  if (n === 0) return "0";

  // For small liquidity values, show more decimals
  if (n < 1) {
    const decimals = Math.max(2, -Math.floor(Math.log10(n)) + 1);
    return Intl.NumberFormat(undefined, {
      maximumFractionDigits: Math.min(decimals, 6),
      minimumFractionDigits: 0,
    }).format(n);
  }

  return Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(n);
};
const fmt6 = (n?: number | null) => {
  if (n == null) return "—";
  if (n === 0) return "0";

  // For very small numbers, show with appropriate precision
  if (n < 0.000001) {
    // Convert to string with enough precision
    const str = n.toFixed(12).replace(/\.?0+$/, "");

    // If still very small, show at least the significant digits
    if (n < 0.000000001) {
      // For extremely small numbers (< 1 nano), show in a readable format
      const exp = Math.floor(Math.log10(n));
      const mantissa = (n / Math.pow(10, exp)).toFixed(2);
      return `${mantissa}e${exp}`;
    }

    return str;
  }

  return Intl.NumberFormat(undefined, {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0,
  }).format(n);
};

const fmtUSD = (n?: number | null, maxFrac: number = 2) => {
  if (n == null) return "—";
  if (n === 0) return "$0";

  // For very small USD values
  if (n < 0.01) {
    // For extremely small values, show with sufficient precision
    if (n < 0.00000001) {
      const str = n.toFixed(12).replace(/\.?0+$/, "");
      return "$" + str;
    }

    // For small values, use appropriate decimals
    const decimals = Math.max(2, -Math.floor(Math.log10(n)) + 2);
    return Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: Math.min(decimals, 10),
      minimumFractionDigits: 0,
    }).format(n);
  }

  return Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: maxFrac,
    minimumFractionDigits: 0,
  }).format(n);
};

const fromEpoch = (s?: number | null) =>
  !s ? "—" : new Date(s * 1000).toLocaleString();

// ---------- sorting map (table column -> api sortBy) ----------
function mapSortingToApi(s: SortingState): SortBy {
  const id = s[0]?.id;
  switch (id) {
    case "liquidityEth":
      return "liquidity";
    case "createdAt":
      return "recency";
    case "votes":
      return "votes";
    case "priceInEth":
      return "price";
    case "fdvEth":
      return "fdv";
    case "holders":
      return "holders";
    case "incentives":
      return "incentives";
    default:
      return "liquidity";
  }
}

type Props = {
  defaultPageSize?: number; // affects fetch limit per page
  rowHeight?: number;
};

export default function CoinsTable({
  defaultPageSize = 100,
  rowHeight = 56,
}: Props) {
  const { data: ethUsdPrice } = useEthUsdPrice();
  const { data: activeIncentiveStreams } = useActiveIncentiveStreams();

  // ---------- unit toggle ----------
  // "ETH" | "USD"
  const [unit, setUnit] = useState<"ETH" | "USD">("ETH");
  const ethUsdRate = useMemo(() => {
    if (!ethUsdPrice) return null;
    const n = parseFloat(ethUsdPrice.toString());
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [ethUsdPrice]);

  const toUSD = (eth?: number | null): number | null =>
    eth == null || ethUsdRate == null ? null : eth * ethUsdRate;

  // Create a map of poolId to active incentive count
  // Note: lpId in incentives is the LP token ID, which equals the poolId for Cookbook pools
  const activeIncentivesMap = useMemo(() => {
    const map = new Map<string, number>();
    if (activeIncentiveStreams) {
      const now = BigInt(Math.floor(Date.now() / 1000)); // Current timestamp in seconds

      activeIncentiveStreams.forEach((stream) => {
        // Double-check that the incentive is truly active:
        // 1. Status should be ACTIVE
        // 2. Current time should be between startTime and endTime
        const isActive =
          stream.status === "ACTIVE" &&
          stream.startTime <= now &&
          stream.endTime > now;

        if (isActive) {
          // For Cookbook pools, lpId (LP token ID) equals poolId
          const poolId = stream.lpId.toString();
          map.set(poolId, (map.get(poolId) || 0) + 1);
        }
      });

      // Debug logging
      console.log("Active incentives map by poolId:", map);
      console.log("Total fetched streams:", activeIncentiveStreams.length);
      console.log(
        "Truly active streams (not expired):",
        Array.from(map.values()).reduce((a, b) => a + b, 0),
      );

      // Log some sample streams for debugging
      if (activeIncentiveStreams.length > 0) {
        const sample = activeIncentiveStreams[0];
        console.log("Sample stream:", {
          lpId: sample.lpId.toString(),
          status: sample.status,
          endTime: sample.endTime.toString(),
          now: now.toString(),
          isExpired: sample.endTime <= now,
        });
      }
    }
    return map;
  }, [activeIncentiveStreams]);

  // search (debounced)
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // sorting (1 column at a time, to align with API cursor)
  const [sorting, setSorting] = useState<SortingState>([
    { id: "liquidityEth", desc: true },
  ]);

  const params = useMemo(() => {
    const sortBy = mapSortingToApi(sorting);
    const sortDir: "asc" | "desc" = sorting[0]?.desc ? "desc" : "asc"; // <— ensure union literal
    return {
      q: debounced || undefined,
      limit: defaultPageSize,
      sortBy,
      sortDir,
    };
  }, [debounced, sorting, defaultPageSize]);

  const {
    data,
    hasNextPage,
    fetchNextPage,
    isFetching,
    isFetchingNextPage,
    refetch,
    status,
  } = useCoinsTable(params);

  // Flatten pages
  const rowsData: CoinsTableItem[] = useMemo(
    () => (data?.pages ?? []).flatMap((p) => p.data),
    [data],
  );

  // Virtualizer
  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: rowsData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  // Infinite trigger when we near the end
  useEffect(() => {
    const items = rowVirtualizer.getVirtualItems();
    if (!items.length || !hasNextPage || isFetchingNextPage) return;
    const last = items[items.length - 1];
    if (last.index >= rowsData.length - 20) {
      fetchNextPage();
    }
  }, [
    rowVirtualizer, // calling methods inside effect; depend on instance
    rowsData.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ]);

  // Columns (headers + cells switch based on unit)
  const columns = useMemo<ColumnDef<CoinsTableItem>[]>(
    () => [
      {
        id: "token",
        header: "Token",
        cell: ({ row }) => {
          const r = row.original;
          return (
            <Link
              to="/explore/token"
              search={{ address: r.token, id: r.coinId }}
              className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity"
            >
              {r.imageUrl ? (
                <TokenImage
                  imageUrl={r.imageUrl}
                  symbol={r.symbol ?? "Unknown"}
                  className="w-7 h-7"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-muted border" />
              )}
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {r.name ?? r.symbol ?? r.coinId}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {r.symbol ?? "—"} · #{r.coinId.slice(0, 6)}… ·{" "}
                  {r.token.slice(0, 6)}…{r.token.slice(-4)}
                </div>
              </div>
            </Link>
          );
        },
        size: 320,
      },
      {
        id: "priceInEth",
        header: unit === "ETH" ? "Price (Ξ)" : "Price ($)",
        accessorKey: "priceInEth",
        cell: ({ getValue }) => {
          const eth = getValue<number | null>();
          if (unit === "ETH") {
            return <span className="tabular-nums">Ξ{fmt6(eth)}</span>;
          }
          const usd = toUSD(eth);
          // price often needs more precision; keep up to 6
          return <span className="tabular-nums">{fmtUSD(usd, 6)}</span>;
        },
        size: 160,
      },
      {
        id: "liquidityEth",
        header: unit === "ETH" ? "Liquidity (Ξ)" : "Liquidity ($)",
        accessorKey: "liquidityEth",
        cell: ({ getValue }) => {
          const eth = getValue<number | null>();
          return unit === "ETH" ? (
            <span className="tabular-nums">{fmt2(eth)}</span>
          ) : (
            <span className="tabular-nums">{fmtUSD(toUSD(eth), 2)}</span>
          );
        },
        size: 170,
      },
      {
        id: "fdvEth",
        header: unit === "ETH" ? "FDV (Ξ)" : "FDV ($)",
        accessorKey: "fdvEth",
        cell: ({ row }) => {
          const eth = row.original.fdvEth;
          return unit === "ETH" ? (
            <span className="tabular-nums">{fmt2(eth)}</span>
          ) : (
            <span className="tabular-nums">{fmtUSD(toUSD(eth), 2)}</span>
          );
        },
        size: 180,
      },
      {
        id: "holders",
        header: "Holders",
        accessorKey: "holders",
        cell: ({ getValue }) => (
          <span className="tabular-nums">{fmt0(getValue<number>())}</span>
        ),
        size: 110,
      },
      {
        id: "incentives",
        header: "Active Incentives",
        accessorKey: "incentives",
        cell: ({ row }) => {
          const poolId = row.original.poolId;
          const backendCount = row.original.incentives; // Original count from backend

          // Use the active incentives count from our map, fallback to 0
          const activeCount = poolId ? activeIncentivesMap.get(poolId) || 0 : 0;

          // Log discrepancies for debugging
          if (backendCount > 0 && activeCount !== backendCount) {
            console.log(
              `Pool ${poolId}: Backend shows ${backendCount}, Active shows ${activeCount}`,
            );
          }

          if (activeCount === 0) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          return (
            <Link
              to="/farm"
              className="text-xs px-2 py-1 bg-green-500/10 text-green-600 dark:text-green-400 rounded font-medium hover:bg-green-500/20 transition-colors inline-block"
            >
              {activeCount}
            </Link>
          );
        },
        size: 130,
      },
      {
        id: "createdAt",
        header: "Created",
        accessorKey: "createdAt",
        cell: ({ getValue }) => (
          <span className="tabular-nums">{fromEpoch(getValue<number>())}</span>
        ),
        size: 180,
      },
    ],
    [unit, ethUsdRate, activeIncentivesMap], // re-render headers/cells when unit, rate, or active incentives change
  );

  const table = useReactTable({
    data: rowsData,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      // enforce single-sort (aligns with keyset pagination)
      setSorting(next.length ? [next[0]] : []);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: true, // we sort server-side
  });

  return (
    <div className="flex flex-col gap-3">
      {/* Top bar: toggle + search */}
      <div className="flex items-center gap-3 w-full">
        <div className="inline-flex rounded-md border overflow-hidden">
          <button
            className={`px-3 py-1 text-sm ${unit === "ETH" ? "bg-muted/60 font-medium" : "bg-background"}`}
            onClick={() => setUnit("ETH")}
            aria-pressed={unit === "ETH"}
          >
            ETH
          </button>
          <button
            className={`px-3 py-1 text-sm ${unit === "USD" ? "bg-muted/60 font-medium" : "bg-background"}`}
            onClick={() => setUnit("USD")}
            aria-pressed={unit === "USD"}
            title={
              ethUsdRate == null
                ? "ETH→USD rate not loaded yet"
                : `Using ${fmtUSD(ethUsdRate, 2)} per ETH`
            }
          >
            USD
          </button>
        </div>

        <div className="relative w-full max-w-xl">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name / symbol / token / id"
            className="w-full pl-9 pr-3"
          />
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-md overflow-hidden">
        {/* header */}
        <div className="bg-muted/40 border-b">
          <div
            className="grid"
            style={{
              gridTemplateColumns: table
                .getFlatHeaders()
                .map((h) => `${h.getSize()}px`)
                .join(" "),
            }}
          >
            {table.getFlatHeaders().map((header) => (
              <div
                key={header.id}
                className="px-3 py-2 text-xs font-semibold uppercase tracking-wide cursor-pointer select-none"
                onClick={header.column.getToggleSortingHandler()}
              >
                <div className="flex items-center gap-1">
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                  {/* safe indicator: don't index with `false` */}
                  {(() => {
                    const dir = header.column.getIsSorted();
                    return dir ? ({ asc: "↑", desc: "↓" } as const)[dir] : null;
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* body (virtualized) */}
        <div ref={parentRef} className="max-h-[70vh] overflow-auto">
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((vi) => {
              const row = table.getRowModel().rows[vi.index];
              return (
                <div
                  key={row.id}
                  className={`grid items-center border-b`}
                  style={{
                    position: "absolute",
                    transform: `translateY(${vi.start}px)`,
                    width: "100%",
                    height: `${vi.size}px`,
                    gridTemplateColumns: table
                      .getFlatHeaders()
                      .map((h) => `${h.getSize()}px`)
                      .join(" "),
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <div key={cell.id} className="px-3 py-2 text-sm">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* footer */}
        <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
          <div>
            {status === "pending" ? "Loading…" : `${rowsData.length} rows`}
            {isFetching ? " • refreshing…" : ""}
          </div>
          <div>
            {hasNextPage
              ? isFetchingNextPage
                ? "Loading more…"
                : "Scroll to load more"
              : "End of list"}
          </div>
          <button
            className="px-2 py-1 border rounded"
            onClick={() => refetch()}
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
