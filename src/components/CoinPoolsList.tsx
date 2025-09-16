import React from "react";
import { Address, formatUnits } from "viem";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PoolTokenImage } from "@/components/PoolTokenImage";
import { toast } from "sonner";
import { formatPrice } from "@/lib/math";
import { formatTimeAgo } from "@/lib/date";
import { bpsToPct } from "@/lib/pools";

// ----------------------
// Types
// ----------------------

export type Pool = {
  id: string;
  coin0Id: string;
  coin1Id: string;
  token0: string;
  token1: string;
  feeOrHook?: string | null;
  hook?: string | null;
  hookType?: string | null;
  price0?: string | null;
  price1?: string | null;
  reserve0?: string | null;
  reserve1?: string | null;
  source?: string | null;
  swapFee?: string | null;
  updatedAt?: string | null;
  coin0?: {
    name?: string | null;
    symbol?: string | null;
    imageUrl?: string | null;
    decimals?: number | null;
  } | null;
  coin1?: {
    name?: string | null;
    symbol?: string | null;
    imageUrl?: string | null;
    decimals?: number | null;
  } | null;
};

export type PoolsQueryResponse = {
  data: {
    pools: {
      items: Pool[];
      totalCount: number;
    };
  };
  errors?: Array<{ message: string }>;
};

// ----------------------
// GraphQL
// ----------------------

const INDEXER_URL = `${import.meta.env.VITE_INDEXER_URL}/graphql`;

const POOLS_QUERY = `#graphql
  query PoolsByEitherSide($coinId: BigInt!, $token: String!) {
    pools(
      where: {
        OR: [
          { AND: [{ coin0Id: $coinId }, { token0: $token }] },
          { AND: [{ coin1Id: $coinId }, { token1: $token }] }
        ]
      }
    ) {
      items {
        id
        coin0Id
        coin1Id
        token0
        token1
        feeOrHook
        hook
        hookType
        price0
        price1
        reserve0
        reserve1
        source
        swapFee
        updatedAt
        coin0 {
          name
          symbol
          imageUrl
          decimals
        }
        coin1 {
          name
          symbol
          imageUrl
          decimals
        }
      }
      totalCount
    }
  }
`;

// ----------------------
// Fetcher + hook
// ----------------------

async function fetchPools(coinId: string, token: Address): Promise<Pool[]> {
  const res = await fetch(INDEXER_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query: POOLS_QUERY,
      variables: { coinId, token },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Indexer error ${res.status}: ${text}`);
  }
  const json = (await res.json()) as PoolsQueryResponse;
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data.pools.items;
}

function usePools(coinId: string | undefined, token: Address | undefined) {
  return useQuery({
    queryKey: ["pools", coinId, token],
    queryFn: () => {
      if (!coinId || !token) throw new Error("Missing coinId or token");
      return fetchPools(coinId, token);
    },
    enabled: Boolean(coinId && token),
    staleTime: 30_000,
  });
}

function formatNumber(n?: string | null, decimals = 18) {
  if (n == null || n === "") return 0;
  return Number(formatUnits(BigInt(n), decimals));
}

export const CoinPoolsList: React.FC<{
  coinId: string;
  token: Address;
  ticker: string; // e.g. "USDC"
  className?: string;
}> = ({ coinId, token, ticker, className }) => {
  const { data: pools, isLoading, isError, error, refetch, isFetching } = usePools(coinId, token);

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-xl">Pools for {ticker}</CardTitle>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className={cn(
              "px-3 py-2 rounded-2xl text-sm shadow border",
              isFetching ? "opacity-60 cursor-wait" : "hover:bg-muted",
            )}
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="text-sm text-red-600">{(error as Error)?.message}</div>
        ) : !pools || pools.length === 0 ? (
          <div className="text-sm text-muted-foreground">No pools found.</div>
        ) : (
          <Table>
            <TableCaption>
              Showing {pools.length} pool{pools.length === 1 ? "" : "s"}
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[64px]">Pair</TableHead>
                <TableHead>Tickers</TableHead>
                <TableHead>Pool ID</TableHead>
                <TableHead className="text-right">Reserve0</TableHead>
                <TableHead className="text-right">Reserve1</TableHead>
                <TableHead className="text-right">Price0</TableHead>
                <TableHead className="text-right">Price1</TableHead>
                <TableHead>Fee/Hook</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pools.map((p) => (
                <TableRow key={p.id} className="hover:bg-muted/40">
                  <TableCell>
                    <PoolTokenImage imageUrl0={p.coin0?.imageUrl ?? null} imageUrl1={p.coin1?.imageUrl ?? null} />
                  </TableCell>
                  <TableCell className="font-medium">
                    {p.coin0?.symbol || "?"}/{p.coin1?.symbol || "?"}
                  </TableCell>
                  <TableCell
                    onClick={() => {
                      navigator.clipboard.writeText(p.id.toString());
                      toast("Pool ID copied to clipboard");
                    }}
                    className="truncate max-w-[260px]"
                  >
                    <code className="text-xs">{p.id}</code>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(p.reserve0).toFixed(2)} {p.coin0?.symbol}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(p.reserve1).toFixed(2)} {p.coin1?.symbol}
                  </TableCell>
                  <TableCell className="text-right">{formatPrice(formatNumber(p.price0, 18))}</TableCell>
                  <TableCell className="text-right">{formatPrice(formatNumber(p.price1, 18))}</TableCell>
                  <TableCell>{bpsToPct(p.swapFee) ?? p.feeOrHook ?? p.hookType ?? "–"}</TableCell>
                  <TableCell>{formatTimeAgo(Number(p?.updatedAt ?? 0))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
