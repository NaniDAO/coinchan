import React, { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { PoolTokenImage } from "../PoolTokenImage";
import { getProtocol, getProtocolIdBySource, ProtocolId } from "@/lib/protocol";
import { CoinSource } from "@/lib/coins";
import { ProtocolFeeBadges } from "./ProtocolFeeBadges";
import { Address, formatUnits, PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import { Badge } from "../ui/badge";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { encodeTokenQ } from "@/lib/token-query";
import { RemoveLpDialog } from "./RemoveLpDialog";
import { SWAP_FEE } from "@/lib/swap";
import { TokenMetadata } from "@/lib/pools";

// ---------------- Types ----------------
type Coin = {
  symbol?: string;
  name?: string;
  imageUrl?: string;
  decimals?: number;
  source?: CoinSource;
};

type Pool = {
  id: string;
  hookType?: string | null;
  swapFee?: number | string | null;
  feeOrHook?: string;
  token0?: string | null;
  coin0Id?: string | null;
  token1?: string | null;
  coin1Id?: string | null;
  price0?: number | string | null;
  price1?: number | string | null;
  reserve0?: number | string | null;
  reserve1?: number | string | null;
  coin0?: Coin;
  coin1?: Coin;
  source: CoinSource;
};

export type LpUserPosition = {
  user: { address: Address };
  liquidity: string | number;
  poolId: string;
  updatedAt: string | number;
  pool?: Pool | null;

  // Enriched fields:
  amount?: string; // human-formatted balance
  status: "active" | "closed";
  protocolId?: ProtocolId;
};

type PageInfo = {
  hasNextPage: boolean;
  endCursor?: string | null;
};

type GetUserLpPositionVars = {
  user: string;
  after?: string | null;
  limit?: number;
};

type LpPositionsConnection = {
  totalCount: number;
  items: LpUserPosition[];
  pageInfo: PageInfo;
};

// ---------------- Enrichment ----------------
const enhanceUserLp = async (
  publicClient: PublicClient,
  lpUserPositions: LpUserPosition[],
): Promise<LpUserPosition[]> => {
  const enhanced = await Promise.all(
    lpUserPositions.map(async (lpUserPosition) => {
      try {
        const user = lpUserPosition.user.address;
        const protocolId = getProtocolIdBySource(lpUserPosition.pool?.source);
        if (!protocolId) {
          return { ...lpUserPosition, amount: undefined, status: "active" };
        }
        const protocol = getProtocol(protocolId);
        if (!protocol || !lpUserPosition.pool?.id) {
          return {
            ...lpUserPosition,
            amount: undefined,
            status: "active",
            protocolId,
          };
        }

        const balance = (await publicClient.readContract({
          abi: protocol.abi,
          address: protocol.address,
          functionName: "balanceOf",
          args: [user, BigInt(lpUserPosition.pool.id)],
        })) as bigint;

        const amtNum = Number(formatUnits(balance, 18));
        const amount = amtNum.toFixed(2);
        const status: "active" | "closed" = balance > 0n ? "active" : "closed";

        return { ...lpUserPosition, protocolId, amount, status };
      } catch {
        const protocolId = getProtocolIdBySource(lpUserPosition.pool?.source);
        return {
          ...lpUserPosition,
          protocolId,
          amount: undefined,
          status: "active",
        };
      }
    }),
  );

  // @ts-ignore
  return enhanced;
};

// ---------------- Fetcher ----------------
async function fetchUserLpPositionsInfinite(
  publicClient: PublicClient,
  {
    pageParam,
    address,
    limit,
  }: {
    // @ts-ignore
    pageParam?: string | null;
    address: string;
    limit: number;
  },
): Promise<LpPositionsConnection> {
  const query = /* GraphQL */ `
    query GetUserLpPosition($user: String!, $after: String, $limit: Int) {
      lpUserPositions(where: { userId: $user }, after: $after, limit: $limit) {
        totalCount
        items {
          user {
            address
          }
          userId
          liquidity
          source
          poolId
          updatedAt
          pool {
            id
            hookType
            swapFee
            feeOrHook
            token0
            coin0Id
            token1
            coin1Id
            price0
            price1
            reserve0
            reserve1
            source
            coin0 {
              symbol
              name
              imageUrl
              decimals
              source
            }
            coin1 {
              symbol
              name
              imageUrl
              decimals
              source
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

  const conn = json.data.lpUserPositions as LpPositionsConnection;
  const enhancedItems = await enhanceUserLp(publicClient, conn.items);

  return {
    totalCount: conn.totalCount,
    items: enhancedItems,
    pageInfo: conn.pageInfo,
  };
}

// ---------------- Components ----------------
export function UserLpPositions({
  address,
  limit = 12,
  statuses = { active: true, closed: false },
  protocols = { ZAMMV0: true, ZAMMV1: true },
  revealHidden,
}: {
  address: string;
  limit?: number;
  statuses?: { active: boolean; closed: boolean };
  protocols?: Record<ProtocolId, boolean>;
  revealHidden?: () => void;
}) {
  const publicClient = usePublicClient();

  const { data, isError, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery<
    LpPositionsConnection,
    Error,
    LpUserPosition[]
  >({
    queryKey: ["user-lp-positions", address, limit],
    queryFn: ({ pageParam }) => {
      if (!publicClient) throw new Error("No public client");
      return fetchUserLpPositionsInfinite(publicClient, {
        // @ts-ignore
        pageParam,
        address,
        limit,
      });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.pageInfo?.hasNextPage ? lastPage.pageInfo.endCursor ?? undefined : undefined,
    enabled: !!address && !!publicClient,
    select: (d) => d.pages.flatMap((p) => p.items),
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
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.unobserve(node);
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allPositions = useMemo(() => {
    if (!data) return [];

    const selectedStatuses = new Set<LpUserPosition["status"]>([
      ...(statuses.active ? (["active"] as const) : []),
      ...(statuses.closed ? (["closed"] as const) : []),
    ]);

    const activeProtocols = Object.entries(protocols)
      .filter(([, v]) => v)
      .map(([k]) => k as ProtocolId);

    const protocolFiltering = activeProtocols.length > 0;

    const filtered = (data as LpUserPosition[])
      .filter((p) => selectedStatuses.has(p.status))
      .filter((p) =>
        protocolFiltering
          ? p.protocolId
            ? activeProtocols.includes(p.protocolId)
            : false // if protocol unknown, hide when filtering is active
          : true,
      );

    return filtered.sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt));
  }, [data, statuses, protocols]);

  if (!address) {
    return <p className="text-muted-foreground">Provide an address to view LP positions.</p>;
  }

  if (isError) return <p className="text-red-600">Error loading positions.</p>;
  if (isLoading) {
    return (
      <div className="space-y-4 mt-6 mr-6">
        {Array.from({ length: 8 }).map((_, i) => (
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
        ))}
      </div>
    );
  }

  if (allPositions.length === 0) {
    return <p className="p-2 mt-2 text-muted-foreground">No LP positions match your filters.</p>;
  }

  return (
    <div className="space-y-4 mt-6 mr-6">
      <div className="flex flex-col gap-2">
        {allPositions.map((p) => (
          <UserLpPositionCard key={`${p.poolId}-${p.updatedAt}`} p={p} />
        ))}
      </div>

      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="flex justify-center py-6">
        {isFetchingNextPage && <ChevronRight className="animate-pulse" />}
      </div>

      <div className="mt-6 py-6">
        <button className="w-fit bg-secondary text-muted-foreground rounded-2xl py-1 px-2" onClick={revealHidden}>
          Hidden
        </button>
      </div>
    </div>
  );
}

export const UserLpPositionCard = ({ p }: { p: LpUserPosition }) => {
  const [open, setOpen] = useState(false);

  const [protocolId] = useMemo(() => {
    const protocolId = p.protocolId ?? getProtocolIdBySource(p?.pool?.source);
    return [protocolId] as const;
  }, [p.protocolId, p?.pool?.source]);

  const status = p.status;
  const amount = p.amount ?? "—";

  const coin0IdStr = String(p?.pool?.coin0Id ?? "0");
  const coin1IdStr = String(p?.pool?.coin1Id ?? "0");

  const tokenAParam = p?.pool?.token0
    ? encodeTokenQ({
        address: p.pool.token0 as Address,
        id: BigInt(coin0IdStr),
      })
    : undefined;

  const tokenBParam = p?.pool?.token1
    ? encodeTokenQ({
        address: p.pool.token1 as Address,
        id: BigInt(coin1IdStr),
      })
    : undefined;

  const tokenA: TokenMetadata = {
    address: p?.pool?.token0 as Address,
    id: BigInt(coin0IdStr),
    name: p?.pool?.coin0?.name ?? "UNKNOWN",
    symbol: p?.pool?.coin0?.symbol ?? "UNKNOWN",
    decimals: p?.pool?.coin0?.decimals ?? 18,
    imageUrl: p?.pool?.coin0?.imageUrl ?? "",
    standard: p?.pool?.coin0?.source === "ERC20" ? "ERC20" : "ERC6909",
  };

  const tokenB: TokenMetadata = {
    address: p?.pool?.token1 as Address,
    id: BigInt(coin1IdStr),
    name: p?.pool?.coin1?.name ?? "UNKNOWN",
    symbol: p?.pool?.coin1?.symbol ?? "UNKNOWN",
    decimals: p?.pool?.coin1?.decimals ?? 18,
    imageUrl: p?.pool?.coin1?.imageUrl ?? "",
    standard: p?.pool?.coin1?.source === "ERC20" ? "ERC20" : "ERC6909",
  };

  // v0 pools use swapFee (uint96), v1 pools use feeOrHook (uint256)
  const feeParam =
    p?.pool?.source === "ZAMM"
      ? String(p.pool?.swapFee ?? SWAP_FEE)
      : String(p.pool?.feeOrHook || p.pool?.swapFee || SWAP_FEE);
  const feeOrHook = p?.pool?.feeOrHook ? String(p.pool.feeOrHook) : String(p?.pool?.swapFee ?? SWAP_FEE);
  const protocolParam = p?.pool?.source === "ZAMM" ? "ZAMMV0" : "ZAMMV1";

  return (
    <div className="rounded-2xl transition border-muted border">
      <div className="p-3 mb-1 flex flex-row items-center justify-start gap-3">
        <PoolTokenImage
          imageUrl0={p.pool?.coin0?.imageUrl ?? null}
          imageUrl1={p.pool?.coin1?.imageUrl ?? null}
          className="h-12 w-12 border-muted"
        />
        <div className="flex flex-row space-x-2">
          <div className="flex flex-col space-y-1">
            <p className="font-medium">
              {p.pool?.coin0?.symbol ?? p.pool?.coin0?.name} / {p.pool?.coin1?.symbol ?? p.pool?.coin1?.name}
            </p>
            <Badge
              className={cn("w-fit", status === "active" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600")}
            >
              {status ?? "—"}
            </Badge>
          </div>
          <ProtocolFeeBadges
            protocolId={protocolId as ProtocolId}
            fee={p.pool?.swapFee ? Number(p.pool?.swapFee) : null}
          />
        </div>
      </div>

      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Position</span>
          <span className="font-medium">{amount}</span>
        </div>
      </div>

      <div className="w-full border-t border-muted">
        <div className="grid grid-cols-2 divide-x divide-border">
          <Link
            to="/positions/create"
            search={{
              tokenA: tokenAParam,
              tokenB: tokenBParam,
              ...(feeParam ? { fee: feeParam } : {}),
              ...(protocolParam ? { protocol: protocolParam } : {}),
            }}
            className="w-full text-center py-3 rounded-bl-2xl font-medium transition hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
          >
            Add LP
          </Link>

          <button
            type="button"
            className={cn(
              `w-full py-3 rounded-br-2xl font-medium transition
               hover:bg-destructive/10 focus-visible:ring-2
               focus-visible:ring-offset-2 focus-visible:ring-destructive`,
              status !== "active" && "opacity-50 cursor-not-allowed hover:bg-transparent",
            )}
            onClick={() => status === "active" && setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={`remove-lp-${p.poolId}`}
          >
            Remove LP
          </button>
        </div>

        <RemoveLpDialog
          open={open}
          onOpenChange={setOpen}
          tokenA={tokenA}
          tokenB={tokenB}
          feeOrHook={feeOrHook}
          protocolId={protocolId as ProtocolId}
        />
      </div>
    </div>
  );
};
