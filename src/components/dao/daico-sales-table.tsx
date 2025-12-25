import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useDAICOSales } from "@/hooks/use-daico-sales";
import type { DAICOSaleItem } from "@/types/daico";
import { formatEther } from "viem";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// Format helpers
const fmt2 = (n: number | null) => {
  if (n == null) return "—";
  return Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
};

const fmtETH = (wei: string) => {
  const eth = parseFloat(formatEther(BigInt(wei)));
  return `Ξ${fmt2(eth)}`;
};

const fromEpoch = (s: number | null) =>
  !s ? "—" : new Date(s * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

const timeRemaining = (deadline: number | null) => {
  if (!deadline) return "No deadline";
  const now = Date.now() / 1000;
  if (deadline < now) return "Expired";
  const diff = deadline - now;
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  const minutes = Math.floor((diff % 3600) / 60);
  return `${minutes}m`;
};

export function DAICOSalesTable() {
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [query, setQuery] = useState("");

  const { data: sales, isLoading, error } = useDAICOSales();

  // Filter sales by search query
  const filteredSales = useMemo(() => {
    if (!sales) return [];
    if (!query.trim()) return sales;
    const q = query.toLowerCase();
    return sales.filter(
      (sale) =>
        sale.daoName?.toLowerCase().includes(q) ||
        sale.daoSymbol?.toLowerCase().includes(q) ||
        sale.daoAddress.toLowerCase().includes(q),
    );
  }, [sales, query]);

  const columns = useMemo<ColumnDef<DAICOSaleItem>[]>(
    () => [
      {
        id: "dao",
        header: "DAO",
        cell: ({ row }) => {
          const r = row.original;
          return (
            <Link
              to="/orgs/$daoAddress"
              params={{ daoAddress: r.daoAddress }}
              className="flex flex-col min-w-0 hover:opacity-80 transition-opacity"
            >
              <div className="text-sm font-medium truncate">{r.daoName || "Unnamed DAO"}</div>
              <div className="text-xs text-muted-foreground truncate">
                {r.daoSymbol || r.daoAddress.slice(0, 10) + "..."}
              </div>
            </Link>
          );
        },
        size: 200,
      },
      {
        id: "sale",
        header: "Offering",
        cell: ({ row }) => {
          const r = row.original;
          const forAmtEth = parseFloat(formatEther(BigInt(r.forAmt)));
          const tribAmtEth = parseFloat(formatEther(BigInt(r.tribAmt)));
          const price = tribAmtEth / forAmtEth;
          return (
            <div className="flex flex-col text-sm">
              <div className="font-medium">
                {fmt2(forAmtEth)} tokens @ Ξ{price.toFixed(6)}
              </div>
              <div className="text-xs text-muted-foreground">Price per token</div>
            </div>
          );
        },
        size: 180,
      },
      {
        id: "raised",
        header: "Raised",
        accessorKey: "totalRaised",
        cell: ({ getValue, row }) => {
          const totalRaised = getValue<string>();
          const totalSold = row.original.totalSold;
          const forAmt = row.original.forAmt;
          const progress = BigInt(forAmt) > 0n ? (BigInt(totalSold) * 100n) / BigInt(forAmt) : 0n;
          return (
            <div className="flex flex-col text-sm">
              <div className="font-medium tabular-nums">{fmtETH(totalRaised)}</div>
              <div className="text-xs text-muted-foreground">{progress.toString()}% sold</div>
            </div>
          );
        },
        size: 150,
      },
      {
        id: "buyers",
        header: "Buyers",
        accessorKey: "uniqueBuyers",
        cell: ({ getValue, row }) => {
          const uniqueBuyers = getValue<number>();
          const totalPurchases = row.original.totalPurchases;
          return (
            <div className="flex flex-col text-sm">
              <div className="font-medium">{uniqueBuyers}</div>
              <div className="text-xs text-muted-foreground">{totalPurchases} purchases</div>
            </div>
          );
        },
        size: 120,
      },
      {
        id: "deadline",
        header: "Deadline",
        accessorKey: "deadline",
        cell: ({ getValue }) => {
          const deadline = getValue<number | null>();
          return (
            <div className="flex flex-col text-sm">
              <div className="font-medium">{timeRemaining(deadline)}</div>
              <div className="text-xs text-muted-foreground">{fromEpoch(deadline)}</div>
            </div>
          );
        },
        size: 140,
      },
      {
        id: "features",
        header: "Features",
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex gap-1.5 flex-wrap">
              {r.hasLP && (
                <Badge variant="secondary" className="text-xs">
                  LP
                </Badge>
              )}
              {r.hasTap && (
                <Badge variant="secondary" className="text-xs">
                  Tap
                </Badge>
              )}
              {r.lpBps && (
                <Badge variant="outline" className="text-xs">
                  {r.lpBps / 100}% LP
                </Badge>
              )}
            </div>
          );
        },
        size: 140,
      },
      {
        id: "status",
        header: "Status",
        accessorKey: "status",
        cell: ({ getValue }) => {
          const status = getValue<string>();
          const variant =
            status === "ACTIVE"
              ? "default"
              : status === "SOLD_OUT"
                ? "secondary"
                : status === "EXPIRED"
                  ? "outline"
                  : "destructive";
          return <Badge variant={variant}>{status}</Badge>;
        },
        size: 120,
      },
      {
        id: "createdAt",
        header: "Created",
        accessorKey: "createdAt",
        cell: ({ getValue }) => {
          const ts = getValue<number>();
          return <span className="text-sm text-muted-foreground">{fromEpoch(ts)}</span>;
        },
        size: 140,
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filteredSales,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (error) {
    return (
      <div className="p-8 text-center text-destructive">
        <p className="font-medium">Error loading DAICO sales</p>
        <p className="text-sm mt-1">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative w-full max-w-xl">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search DAO name, symbol, or address..."
          className="w-full pl-9 pr-3"
        />
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredSales.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {query ? "No sales found matching your search" : "No DAICO sales yet"}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          {/* Header */}
          <div
            className="grid bg-muted/50 border-b font-medium text-sm"
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
                className="px-3 py-2 cursor-pointer hover:bg-muted/70 transition-colors"
                onClick={header.column.getToggleSortingHandler()}
              >
                <div className="flex items-center gap-1">
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {{
                    asc: " ↑",
                    desc: " ↓",
                  }[header.column.getIsSorted() as string] ?? null}
                </div>
              </div>
            ))}
          </div>

          {/* Rows */}
          <div className="max-h-[70vh] overflow-auto">
            {table.getRowModel().rows.map((row) => (
              <div
                key={row.id}
                className="grid items-center border-b hover:bg-muted/30 transition-colors"
                style={{
                  gridTemplateColumns: table
                    .getFlatHeaders()
                    .map((h) => `${h.getSize()}px`)
                    .join(" "),
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <div key={cell.id} className="px-3 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
