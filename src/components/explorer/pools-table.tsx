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
import type { PoolTableItem, PoolSortBy } from "@/hooks/use-pools-table";
import { usePoolsTable } from "@/hooks/use-pools-table";
import { Search as SearchIcon } from "lucide-react";
import { useEthUsdPrice } from "@/hooks/use-eth-usd-price";
import { PoolTokenImage } from "../PoolTokenImage";
import { buttonVariants } from "../ui/button";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Input } from "../ui/input";

/* ---------------------- formatting helpers ---------------------- */
const fmt0 = (n?: number | null) =>
  n == null ? "—" : Intl.NumberFormat().format(n);

const fmt2 = (n?: number | null) =>
  n == null
    ? "—"
    : Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);

const fmt6 = (n?: number | null) =>
  n == null
    ? "—"
    : Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(n);

const fmtUSD = (n?: number | null, maxFrac: number = 2) =>
  n == null
    ? "—"
    : Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: maxFrac,
      }).format(n);

const fromEpoch = (s?: number | null) =>
  !s ? "—" : new Date(s * 1000).toLocaleString();

const shortAddr = (a?: string | null, n = 6) =>
  !a ? "—" : `${a.slice(0, n)}…${a.slice(-4)}`;

const ipfs = (u?: string | null) =>
  !u
    ? null
    : u.startsWith("ipfs://")
      ? u.replace("ipfs://", "https://ipfs.io/ipfs/")
      : u;

const bpsToPct = (bps?: string | number | null) => {
  const n = Number(bps ?? 0);
  if (!Number.isFinite(n)) return "—";
  // bps → percent (e.g. 30 → 0.30%, 3000 → 30.00%)
  return (
    (n / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + "%"
  );
};

/* ----------- map table sorting -> API sortBy key (single sort) ----------- */
function mapSortingToApi(s: SortingState): PoolSortBy {
  const id = s[0]?.id;
  switch (id) {
    case "liquidityEth":
      return "liquidity";
    case "updatedAt":
      return "recency";
    case "swapFee":
      return "fee";
    case "priceInEth":
      return "price";
    case "incentives":
      return "incentives";
    default:
      return "liquidity";
  }
}

type Props = {
  defaultPageSize?: number;
  rowHeight?: number;
  defaultHasLiquidity?: boolean;
};

export default function PoolsTable({
  defaultPageSize = 100,
  rowHeight = 56,
  defaultHasLiquidity = true,
}: Props) {
  const { data: ethUsdPrice } = useEthUsdPrice();

  /* ---------------------------- unit toggle ---------------------------- */
  const [unit, setUnit] = useState<"ETH" | "USD">("ETH");
  const ethUsdRate = useMemo(() => {
    if (!ethUsdPrice) return null;
    const n = parseFloat(ethUsdPrice.toString());
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [ethUsdPrice]);

  const toUSD = (eth?: number | null): number | null =>
    eth == null || ethUsdRate == null ? null : eth * ethUsdRate;

  /* ------------------------------ filters ------------------------------ */
  const [hasLiquidity, setHasLiquidity] =
    useState<boolean>(defaultHasLiquidity);

  // search (debounced)
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // single-column sorting to align with keyset pagination
  const [sorting, setSorting] = useState<SortingState>([
    { id: "liquidityEth", desc: true },
  ]);

  const params = useMemo(() => {
    const sortBy = mapSortingToApi(sorting);
    const sortDir: "asc" | "desc" = sorting[0]?.desc ? "desc" : "asc";
    return {
      q: debounced || undefined,
      limit: defaultPageSize,
      sortBy,
      sortDir,
      hasLiquidity,
      quote: "ETH" as const,
    };
  }, [debounced, sorting, defaultPageSize, hasLiquidity]);

  const {
    data,
    hasNextPage,
    fetchNextPage,
    isFetching,
    isFetchingNextPage,
    refetch,
    status,
  } = usePoolsTable(params);

  // flatten pages
  const rowsData: PoolTableItem[] = useMemo(
    () => (data?.pages ?? []).flatMap((p) => p.data),
    [data],
  );

  /* --------------------------- virtualization -------------------------- */
  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: rowsData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  useEffect(() => {
    const items = rowVirtualizer.getVirtualItems();
    if (!items.length || !hasNextPage || isFetchingNextPage) return;
    const last = items[items.length - 1];
    if (last.index >= rowsData.length - 20) {
      fetchNextPage();
    }
  }, [
    rowVirtualizer,
    rowsData.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ]);

  /* ------------------------------- columns ----------------------------- */
  const columns = useMemo<ColumnDef<PoolTableItem>[]>(
    () => [
      {
        id: "pair",
        header: "Pair",
        cell: ({ row }) => {
          const r = row.original;
          const img1 = ipfs(r.coin1.imageUrl);
          const img0 = ipfs(r.coin0.imageUrl);
          const sym1 = r.coin1.symbol ?? shortAddr(r.coin1.address);
          const sym0 = r.coin0.symbol ?? shortAddr(r.coin0.address);
          return (
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative w-9 h-7">
                <PoolTokenImage imageUrl0={img0} imageUrl1={img1} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {sym1}/{sym0}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  #{r.poolId} · {shortAddr(r.token1)} / {shortAddr(r.token0)}
                </div>
              </div>
            </div>
          );
        },
        size: 320,
        enableSorting: false,
      },
      {
        id: "swapFee",
        header: "Fee",
        accessorKey: "swapFee",
        cell: ({ getValue }) => {
          const bps = String(getValue<string | number | null>() ?? "0");
          return (
            <span className="tabular-nums text-xs px-2 py-1 rounded bg-muted">
              {Number(bps).toLocaleString()} bps · {bpsToPct(bps)}
            </span>
          );
        },
        size: 150,
      },
      {
        id: "priceInEth",
        header:
          unit === "ETH" ? "Price (Ξ, base→quote)" : "Price ($, base→quote)",
        accessorKey: "priceInEth",
        cell: ({ getValue, row }) => {
          // price of token1 in ETH; USD converts with ETHUSD
          const eth = getValue<number | null>();
          const base = row.original.coin1.symbol ?? "BASE";
          if (unit === "ETH") {
            return (
              <span className="tabular-nums">
                1 {base} = Ξ{fmt6(eth)}
              </span>
            );
          }
          const usd = toUSD(eth);
          return (
            <span className="tabular-nums">
              1 {base} = {fmtUSD(usd, 6)}
            </span>
          );
        },
        size: 220,
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
        id: "incentives",
        header: "Incentives",
        accessorKey: "incentives",
        cell: ({ getValue }) => (
          <span className="text-xs px-2 py-1 bg-muted rounded tabular-nums">
            {fmt0(getValue<number>())}
          </span>
        ),
        size: 120,
      },
      {
        id: "source",
        header: "Source",
        accessorKey: "source",
        cell: ({ getValue }) => {
          const s = String(getValue() ?? "ZAMM");
          const tone =
            s === "ZAMM"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : s === "COOKBOOK"
                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                : "bg-slate-50 text-slate-700 border-slate-200";
          return (
            <span
              className={`text-xs px-2 py-1 rounded border ${tone}`}
              title="Contract source"
            >
              {s}
            </span>
          );
        },
        enableSorting: false,
        size: 110,
      },
      {
        id: "hookType",
        header: "Hook",
        accessorKey: "hookType",
        cell: ({ row }) => {
          const ht = row.original.hookType;
          const label = ht === "PRE" ? "Pre" : ht === "POST" ? "Post" : "—";
          const tone =
            ht === "PRE"
              ? "bg-amber-50 text-amber-700 border-amber-200"
              : ht === "POST"
                ? "bg-purple-50 text-purple-700 border-purple-200"
                : "bg-muted text-muted-foreground border-transparent";
          return (
            <span className={`text-xs px-2 py-1 rounded border ${tone}`}>
              {label}
            </span>
          );
        },
        enableSorting: false,
        size: 90,
      },
      {
        id: "updatedAt",
        header: "Updated",
        accessorKey: "updatedAt",
        cell: ({ getValue }) => (
          <span className="tabular-nums">{fromEpoch(getValue<number>())}</span>
        ),
        size: 180,
      },
    ],
    [unit, ethUsdRate],
  );

  /* ------------------------------- table ------------------------------- */
  const table = useReactTable({
    data: rowsData,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      // enforce single-sort (aligns with API keyset pagination)
      setSorting(next.length ? [next[0]] : []);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: true,
  });

  /* -------------------------------- UI -------------------------------- */
  return (
    <div className="flex flex-col gap-3">
      {/* Top bar: toggles + search */}
      <div className="flex items-center gap-3 w-full">
        {/* unit toggle */}
        <div className="inline-flex rounded-md border overflow-hidden">
          <button
            className={`px-3 py-1 text-sm ${
              unit === "ETH" ? "bg-muted/60 font-medium" : "bg-background"
            }`}
            onClick={() => setUnit("ETH")}
            aria-pressed={unit === "ETH"}
          >
            ETH
          </button>
          <button
            className={`px-3 py-1 text-sm ${
              unit === "USD" ? "bg-muted/60 font-medium" : "bg-background"
            }`}
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

        {/* hasLiquidity filter */}
        <label className="flex items-center gap-2 text-sm select-none">
          <input
            type="checkbox"
            checked={hasLiquidity}
            onChange={(e) => setHasLiquidity(e.target.checked)}
          />
          Only pools with liquidity
        </label>

        {/* search */}
        <div className="relative w-full max-w-xl">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pool id / token / name / symbol"
            className="w-full pl-9 pr-3"
          />
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>

        <Link
          to="/positions/create"
          className={cn(
            buttonVariants({
              variant: "outline",
              size: "sm",
            }),
            "ml-auto",
          )}
        >
          Add Liquidity
        </Link>
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
                  className="grid items-center border-b"
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
