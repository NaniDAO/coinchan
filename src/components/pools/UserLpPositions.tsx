"use client";

import React, { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { PoolTokenImage } from "../PoolTokenImage";
import { getProtocol, getProtocolIdBySource, ProtocolId } from "@/lib/protocol";
import { CoinSource } from "@/lib/coins";
import { ProtocolFeeBadges } from "./ProtocolFeeBadges";
import { Address, formatUnits } from "viem";
import { useReadContract } from "wagmi";

const nf = (v: string | number | null | undefined, maxFrac = 6) => {
  if (v == null) return "-";
  const num = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(num)) return String(v);
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: maxFrac,
  }).format(num);
};

const shorten = (s?: string, head = 6, tail = 6) =>
  s && s.length > head + tail
    ? `${s.slice(0, head)}…${s.slice(-tail)}`
    : (s ?? "—");

// ---------------- Types ----------------
type Coin = {
  symbol?: string;
  name?: string;
  imageUrl?: string;
};

type Pool = {
  id: string;
  hookType?: string | null;
  swapFee?: number | string | null;
  token0?: string | null;
  token1?: string | null;
  price0?: number | string | null;
  price1?: number | string | null;
  reserve0?: number | string | null;
  reserve1?: number | string | null;
  coin0?: Coin;
  coin1?: Coin;
  source: CoinSource;
};

export type LpUserPosition = {
  user: {
    address: Address;
  };
  liquidity: string | number;
  poolId: string;
  updatedAt: string | number;
  pool?: Pool | null;
};

type GetUserLpPositionVars = {
  user: string;
  after?: string | null;
  limit?: number;
};

async function fetchUserLpPositionsInfinite({
  pageParam,
  address,
  limit,
}: {
  pageParam?: string | null;
  address: string;
  limit: number;
}) {
  const query = /* GraphQL */ `
    query GetUserLpPosition($user: String!, $after: String, $limit: Int) {
      lpUserPositions(where: { user: $user }, after: $after, limit: $limit) {
        totalCount
        items {
          user {
            address
          }
          liquidity
          poolId
          updatedAt
          pool {
            id
            hookType
            swapFee
            token0
            token1
            price0
            price1
            reserve0
            reserve1
            source
            coin0 {
              symbol
              name
              imageUrl
            }
            coin1 {
              symbol
              name
              imageUrl
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const variables: GetUserLpPositionVars = {
    user: address.toLowerCase(),
    after: pageParam ?? null,
    limit,
  };

  const res = await fetch(`${import.meta.env.VITE_INDEXER_URL}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error("Network error");
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message as string);
  return json.data.lpUserPositions;
}

export function UserLpPositions({
  address,
  limit = 12,
}: {
  address: string;
  limit?: number;
}) {
  const {
    data: items,
    isError,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["user-lp-positions", address, limit],
    queryFn: ({ pageParam }) =>
      fetchUserLpPositionsInfinite({ pageParam, address, limit }),

    initialPageParam: null,

    getNextPageParam: (lastPage) => {
      console.log("lastPage", lastPage);
      return lastPage.pageInfo?.hasNextPage
        ? (lastPage.pageInfo.endCursor ?? undefined)
        : undefined;
    },
    enabled: !!address,
    select: (d) => {
      console.log("d", {
        d,
        dataFlattened: d.pages.map((p) => p.items),
      });
      return d.pages.flatMap((p) => p.items);
    },
  });

  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!sentinelRef.current) return;
    const node = sentinelRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" }, // start loading before hitting bottom
    );

    observer.observe(node);
    return () => observer.unobserve(node);
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allPositions = useMemo(() => {
    if (!items) return [];

    // sort by latest
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [items]);

  if (!address) {
    return (
      <p className="text-muted-foreground">
        Provide an address to view LP positions.
      </p>
    );
  }

  if (isError) return <p className="text-red-600">Error loading positions.</p>;

  return (
    <div className="space-y-4 mt-6 mr-6">
      <div className="flex flex-col gap-2">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="rounded-2xl">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-16 w-full rounded-xl" />
                </CardContent>
              </Card>
            ))
          : allPositions.map((p) => <UserLpPositionCard p={p} />)}
      </div>

      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="flex justify-center py-6">
        {isFetchingNextPage && <ChevronRight className="animate-pulse" />}
      </div>
    </div>
  );
}

export const UserLpPositionCard = ({ p }: { p: LpUserPosition }) => {
  const [protocolId, protocol] = useMemo(() => {
    const protocolId = getProtocolIdBySource(p?.pool?.source);
    if (!protocolId) return [null, null];
    const protocol = getProtocol(protocolId);
    return [protocolId, protocol];
  }, [p?.pool?.source]);
  const { data: lp } = useReadContract({
    address: protocol ? protocol.address : undefined,
    abi: protocol ? protocol.abi : undefined,
    functionName: "balanceOf",
    args:
      p.pool?.id && p.user.address ? [p.user.address, p.pool?.id] : undefined,
    query: {
      select: (data) =>
        Number(formatUnits(BigInt(data as bigint), 18)).toFixed(2),
    },
  });

  return (
    <Card
      key={`${p.poolId}-${p.updatedAt}`}
      className="rounded-2xl transition hover:shadow-md"
    >
      <CardHeader className="flex flex-row items-center justify-start">
        <PoolTokenImage
          imageUrl0={p.pool?.coin0?.imageUrl ?? null}
          imageUrl1={p.pool?.coin1?.imageUrl ?? null}
          className="h-12 w-12 border-muted"
        />
        <div>
          <p>
            {p.pool?.coin0?.symbol ?? p.pool?.coin0?.name} /{" "}
            {p.pool?.coin1?.symbol ?? p.pool?.coin1?.name}
          </p>
          <ProtocolFeeBadges
            protocolId={protocolId as ProtocolId}
            fee={p.pool?.swapFee ? Number(p.pool?.swapFee) : null}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        Position
        {lp}
      </CardContent>
    </Card>
  );
};
