import * as React from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronsUpDown,
  ChevronRight,
  Plus,
  Filter,
  ExternalLink,
  Wallet,
  RefreshCcw,
  Coins,
} from "lucide-react";

/************************************
 * Router registration
 ************************************/
export const Route = createFileRoute("/positions/")({
  component: RouteComponent,
});

/************************************
 * Types for API responses
 ************************************/
// /api/portfolio
interface PortfolioResponse {
  user: string;
  balances: Array<{
    coin_id: string; // bigint
    balance: string; // bigint
    coin_symbol: string | null;
    coin_name: string | null;
    coin_decimals: number;
  }>;
  positions: Array<{
    chef_id: string; // bigint
    shares: string; // bigint
    lp_id: string; // bigint
    reward_id: string; // bigint
    reward_symbol: string | null;
  }>;
}

// /api/incentive-streams
interface IncentiveStream {
  chef_id: string;
  creator: string;
  lp_token: string;
  lp_id: string; // bigint
  reward_token: string;
  reward_id: string; // bigint
  reward_amount: string;
  reward_rate: string;
  duration: string;
  start_time: string;
  end_time: string;
  last_update: string;
  total_shares: string;
  acc_reward_per_share: string;
  status: "ACTIVE" | "ENDED" | "SWEPT";
  reward_token_name?: string | null;
  reward_token_symbol?: string | null;
  reward_token_image_url?: string | null;
  reward_token_decimals?: number | null;
}

// /api/pools-table items
interface PoolTableItem {
  poolId: string;
  token0: string; // address
  token1: string; // address
  coin0: {
    id: string | null;
    symbol: string | null;
    name: string | null;
    imageUrl: string | null;
    decimals: number;
  };
  coin1: {
    id: string | null;
    symbol: string | null;
    name: string | null;
    imageUrl: string | null;
    decimals: number;
  };
  priceInEth: number | null;
  liquidityEth: number;
  swapFee: string; // bps as string
  incentives: number;
  feeOrHook: string;
  hookType: "NONE" | "PRE" | "POST";
  hook: string | null;
  source: "ZAMM" | "COOKBOOK" | "ERC20";
  updatedAt: number | null;
}

/************************************
 * Helpers
 ************************************/
const API_BASE = import.meta.env.VITE_INDEXER_URL;
const GQL_ENDPOINT = `${API_BASE}/graphql`;

const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });
const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function shorten(addr?: string | null, size = 4) {
  if (!addr) return "";
  return `${addr.slice(0, 2 + size)}…${addr.slice(-size)}`;
}

/************************************
 * GraphQL (best-effort) + REST fallback
 ************************************/
async function gql<T>(
  query: string,
  variables?: Record<string, any>,
): Promise<T> {
  const res = await fetch(GQL_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error("GraphQL error");
  return json.data as T;
}

/************************************
 * Data hooks
 ************************************/
function useAddressFromQueryOrWallet() {
  const search = useSearch({ from: "/positions/" });
  const paramAddr = (search as any)?.address as string | undefined;
  // Optional: integrate wagmi if present
  let walletAddr: string | undefined;
  try {
    // dynamic import so it doesn't explode if wagmi isn't installed
    // @ts-ignore
    const useAccount = require("wagmi").useAccount as () => {
      address?: string;
    };
    walletAddr = useAccount()?.address;
  } catch {}
  return paramAddr ?? walletAddr ?? "";
}

function usePortfolio(address: string) {
  const [data, setData] = React.useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        // Try GraphQL first to get pendingRewards if possible
        const query = `
          query UserPositions($user: String!) {
            incentiveUserPositions(
              where: { user: { eq: $user }, shares: { gt: "0" } }
              orderBy: [{ updatedAt: DESC }]
            ) {
              nodes {
                chefId
                user
                shares
                pendingRewards
                totalDeposited
                totalHarvested
                updatedAt
                incentiveStream {
                  chefId
                  lpId
                  rewardId
                  status
                  rewardCoin: reward {
                    id
                    symbol
                    name
                    imageUrl
                    decimals
                  }
                  lpPool: lpPool {
                    id
                    swapFee
                    price1
                    coin0 { id symbol name imageUrl decimals }
                    coin1 { id symbol name imageUrl decimals }
                  }
                }
              }
            }
          }
        `;
        type GqlOut = {
          incentiveUserPositions: {
            nodes: Array<any>;
          };
        };
        let positions: any[] | null = null;
        try {
          const out = await gql<GqlOut>(query, { user: address.toLowerCase() });
          positions = out?.incentiveUserPositions?.nodes ?? null;
        } catch {
          positions = null;
        }

        if (positions) {
          const resp: PortfolioResponse = {
            user: address.toLowerCase(),
            balances: [],
            positions: positions.map((p) => ({
              chef_id: String(p.chefId),
              shares: String(p.shares ?? "0"),
              lp_id: String(p?.incentiveStream?.lpId ?? "0"),
              reward_id: String(p?.incentiveStream?.rewardId ?? "0"),
              reward_symbol: p?.incentiveStream?.rewardCoin?.symbol ?? null,
            })),
          };
          if (!cancelled) setData(resp);
        } else {
          // Fallback to REST
          const res = await fetch(`/api/portfolio?address=${address}`);
          if (!res.ok) throw new Error("portfolio fetch failed");
          const json = (await res.json()) as PortfolioResponse;
          if (!cancelled) setData(json);
        }
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message ?? e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [address]);

  return { data, loading, error };
}

function useIncentiveStreams() {
  const [data, setData] = React.useState<IncentiveStream[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/incentive-streams`);
        if (!res.ok) throw new Error("streams fetch failed");
        const json = (await res.json()) as IncentiveStream[];
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message ?? e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}

function useTopPools(limit = 3) {
  const [data, setData] = React.useState<PoolTableItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/pools-table?limit=${limit}&sortBy=liquidity&sortDir=desc&hasLiquidity=true`,
        );
        const json = await res.json();
        if (!cancelled) setData(json.data as PoolTableItem[]);
      } catch {
        if (!cancelled) setData(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);
  return data;
}

/************************************
 * UI Components
 ************************************/
function EmptyState({
  title,
  subtitle,
  cta,
}: {
  title: string;
  subtitle?: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 border rounded-xl border-dashed border-border bg-muted/30">
      <Coins className="size-8 mb-3 text-muted-foreground" />
      <div className="text-lg font-medium text-foreground">{title}</div>
      {subtitle && (
        <div className="text-sm text-muted-foreground mt-1 max-w-md">
          {subtitle}
        </div>
      )}
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}

function KPI({
  label,
  value,
  help,
}: {
  label: string;
  value: React.ReactNode;
  help?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="text-sm font-medium text-foreground cursor-help">
              {value}
            </div>
          </TooltipTrigger>
          {help && <TooltipContent>{help}</TooltipContent>}
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function RewardsBanner({
  totalRewards,
  onCollect,
}: {
  totalRewards: number;
  onCollect?: () => void;
}) {
  return (
    <Card className="bg-muted/30 border-border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Rewards earned
        </CardTitle>
        <Button
          variant="secondary"
          size="sm"
          className="gap-2"
          onClick={onCollect}
        >
          <RefreshCcw className="size-4" /> Collect rewards
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-3xl font-semibold tracking-tight">
          {fmt.format(totalRewards)}{" "}
          <span className="text-base align-middle text-muted-foreground">
            tokens
          </span>
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          Find pools with rewards so you can earn more
        </div>
      </CardContent>
    </Card>
  );
}

function PositionRow({
  chefId,
  shares,
  rewardSymbol,
  lp,
}: {
  chefId: string;
  shares: string;
  rewardSymbol?: string | null;
  lp?: PoolTableItem | null;
}) {
  const base = lp?.coin1;
  const quote = lp?.coin0; // ETH side
  return (
    <div className="group rounded-xl border bg-card text-card-foreground border-border p-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar className="size-9 ring-2 ring-border">
            <AvatarImage src={base?.imageUrl ?? undefined} />
            <AvatarFallback>{(base?.symbol ?? "?").slice(0, 2)}</AvatarFallback>
          </Avatar>
          <Avatar className="size-6 absolute -bottom-2 -right-2 ring-2 ring-background bg-background">
            <AvatarImage src={quote?.imageUrl ?? undefined} />
            <AvatarFallback>
              {(quote?.symbol ?? "?").slice(0, 2)}
            </AvatarFallback>
          </Avatar>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <div className="font-medium">
              {base?.symbol ?? shorten(lp?.token1)}{" "}
              <span className="text-muted-foreground">/</span>{" "}
              {quote?.symbol ?? "ETH"}
            </div>
            {lp?.incentives ? (
              <Badge variant="secondary" className="gap-1">
                🎁 {lp.incentives} rewards
              </Badge>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {lp ? (
              <>
                {fmt.format(lp.liquidityEth)} ETH TVL · Fee{" "}
                {(Number(lp.swapFee) / 100).toFixed(2)}%
              </>
            ) : (
              <>Pool #{chefId}</>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-8">
        <KPI
          label="Your shares"
          value={<span>{nf0.format(Number(shares))}</span>}
        />
        <KPI
          label="Rewards"
          value={<span>— {rewardSymbol ?? ""}</span>}
          help="Pending rewards fetched from indexer when available"
        />
        <Button variant="outline" size="sm" className="gap-1">
          Manage <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function SideList({
  title,
  items,
  render,
}: {
  title: string;
  items?: any[] | null;
  render: (x: any, i: number) => React.ReactNode;
}) {
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!items && (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
        {items?.slice(0, 3).map(render)}
      </CardContent>
    </Card>
  );
}

/************************************
 * Main Route Component
 ************************************/
function RouteComponent() {
  // const navigate = useNavigate();
  const address = useAddressFromQueryOrWallet();
  const [addrInput, setAddrInput] = useState(address);

  const { data: portfolio, loading: loadingPortfolio } = usePortfolio(address);
  const { data: streams } = useIncentiveStreams();
  const topPools = useTopPools(3);

  const positions = portfolio?.positions ?? [];

  // Build LP lookup for positions from /api/pools-table (top pools only by default)
  // In a full app, you might fetch each lp by id. Here we will build a partial map from the top pools list.
  const lpById: Record<string, PoolTableItem> = useMemo(() => {
    const map: Record<string, PoolTableItem> = {};
    (topPools ?? []).forEach((p) => (map[p.poolId] = p));
    return map;
  }, [topPools]);

  const activeCount = positions.length;

  function onSearch() {
    // @TODO
    // navigate({ to: "/positions/", search: { address: addrInput } });
  }

  return (
    <div className="min-h-[calc(100vh-56px)] bg-background text-foreground">
      <div className="container mx-auto py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT: main column */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-2xl font-semibold tracking-tight">Pool</div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="0x… address"
                value={addrInput}
                onChange={(e) => setAddrInput(e.target.value)}
                className="w-[260px] bg-muted/30 border-border"
              />
              <Button variant="default" onClick={onSearch} className="gap-2">
                <Wallet className="size-4" /> View
              </Button>
            </div>
          </div>

          <RewardsBanner
            totalRewards={0}
            onCollect={() => {
              /* wire to claim later */
            }}
          />

          {/* Filters */}
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" className="gap-2">
                  <Plus className="size-4" /> New
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Create</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Provide liquidity</DropdownMenuItem>
                <DropdownMenuItem>Stake LP for rewards</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Filter className="size-4" /> Status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem>Active</DropdownMenuItem>
                <DropdownMenuItem>Closed</DropdownMenuItem>
                <DropdownMenuItem>All</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  Protocol <ChevronsUpDown className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem>ZAMM</DropdownMenuItem>
                <DropdownMenuItem>Cookbook</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Your positions */}
          <div>
            <div className="text-lg font-semibold mb-3">Your positions</div>
            {!address && (
              <EmptyState
                title="Connect a wallet or paste an address"
                subtitle="Enter an address above to view its ZAMM incentive positions."
                cta={
                  <div className="flex gap-2">
                    <Button variant="default" className="gap-2">
                      <Wallet className="size-4" /> Connect
                    </Button>
                  </div>
                }
              />
            )}
            {address && loadingPortfolio && (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            )}
            {address && !loadingPortfolio && activeCount === 0 && (
              <EmptyState
                title="No active positions"
                subtitle="When you deposit LP tokens into an incentive stream, your positions will show up here."
                cta={
                  <Button variant="secondary" className="gap-2">
                    Explore pools <ExternalLink className="size-4" />
                  </Button>
                }
              />
            )}
            {address && !loadingPortfolio && activeCount > 0 && (
              <div className="space-y-3">
                {positions.map((p) => (
                  <PositionRow
                    key={`${p.chef_id}-${p.lp_id}`}
                    chefId={p.chef_id}
                    shares={p.shares}
                    rewardSymbol={p.reward_symbol}
                    lp={lpById[p.lp_id]}
                  />
                ))}
              </div>
            )}

            {/* Hidden positions footnote */}
            <div className="mt-6 text-sm text-muted-foreground">
              Some v2 positions aren’t displayed automatically.
            </div>
          </div>
        </div>

        {/* RIGHT: side rail */}
        <div className="lg:col-span-4 space-y-6">
          <SideList
            title="Pools with rewards"
            items={streams?.filter((s) => s.status === "ACTIVE").slice(0, 3)}
            render={(s: IncentiveStream) => (
              <div
                key={s.chef_id}
                className="flex items-center justify-between border rounded-xl p-3 bg-muted/20 border-border"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="size-8">
                    <AvatarImage src={s.reward_token_image_url ?? undefined} />
                    <AvatarFallback>
                      {(s.reward_token_symbol ?? "?").slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-sm font-medium">LP #{s.lp_id}</div>
                    <div className="text-xs text-muted-foreground">
                      Reward: {s.reward_token_symbol ?? shorten(s.reward_token)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">APR</div>
                  <div className="text-sm font-medium">—</div>
                </div>
              </div>
            )}
          />

          <SideList
            title="Top pools by TVL"
            items={topPools}
            render={(p: PoolTableItem) => (
              <div
                key={p.poolId}
                className="flex items-center justify-between border rounded-xl p-3 bg-muted/20 border-border"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="size-8">
                    <AvatarImage src={p.coin1.imageUrl ?? undefined} />
                    <AvatarFallback>
                      {(p.coin1.symbol ?? "?").slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-sm font-medium">
                      {p.coin1.symbol ?? shorten(p.token1)} /{" "}
                      {p.coin0.symbol ?? "ETH"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fmt.format(p.liquidityEth)} ETH TVL
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">APR</div>
                  <div className="text-sm font-medium">+—%</div>
                </div>
              </div>
            )}
          />
        </div>
      </div>
    </div>
  );
}

export default RouteComponent;
