import { useState } from "react";
import { formatUnits, formatEther } from "viem";
import { useEnsName } from "wagmi";
import { cn } from "@/lib/utils";
import { usePoolSwaps, useTokenHolders, formatSwapEvent, type SwapEvent, type TokenHolder } from "@/hooks/use-pool-activity";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ArrowUpRight, ArrowDownRight, ExternalLink, Users, Activity, Droplets } from "lucide-react";
import type { Pool } from "@/hooks/use-get-pool";
import type { PAMMMarketData } from "@/hooks/use-pamm-market";

interface PoolActivityPanelProps {
  pool: Pool;
  pammData?: PAMMMarketData | null;
  className?: string;
}

type ActivityTab = "trades" | "holders" | "lp";

export function PoolActivityPanel({ pool, pammData, className }: PoolActivityPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActivityTab>("trades");

  const isPredictionMarket = pammData?.isPAMMPool && pammData?.marketId !== null;

  // Fetch swaps - use the pool's source for the query
  const { data: swaps, isLoading: swapsLoading } = usePoolSwaps(
    pool.id,
    pool.source as "ZAMM" | "COOKBOOK",
    30
  );

  // For holders, always use pool.coin0Id and coin1Id since these are what the indexer tracks
  // For prediction markets, coin0 is one side (YES or NO depending on yesIsId0), coin1 is the other
  const token0Id = pool.coin0?.id || pool.coin0Id;
  const token1Id = pool.coin1?.id || pool.coin1Id;

  const { data: token0Holders, isLoading: token0HoldersLoading } = useTokenHolders(
    token0Id || undefined,
    20
  );
  const { data: token1Holders, isLoading: token1HoldersLoading } = useTokenHolders(
    isPredictionMarket ? (token1Id || undefined) : undefined,
    20
  );

  // For prediction markets, map to YES/NO based on which token is which
  const yesHolders = isPredictionMarket && pammData?.yesIsId0 ? token0Holders : token1Holders;
  const noHolders = isPredictionMarket && pammData?.yesIsId0 ? token1Holders : token0Holders;
  const holdersLoading = token0HoldersLoading || token1HoldersLoading;

  const token0Symbol = isPredictionMarket ? "YES" : (pool.coin0?.symbol || "Token0");
  const token1Symbol = isPredictionMarket ? "NO" : (pool.coin1?.symbol || "Token1");

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-3">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">Pool Activity</span>
            {swaps && swaps.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {swaps.length} recent trades
              </span>
            )}
          </div>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-2 border rounded-lg bg-card overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b bg-muted/30">
            <TabButton
              active={activeTab === "trades"}
              onClick={() => setActiveTab("trades")}
              icon={<Activity className="w-3.5 h-3.5" />}
              label="Trades"
              count={swaps?.length}
            />
            <TabButton
              active={activeTab === "holders"}
              onClick={() => setActiveTab("holders")}
              icon={<Users className="w-3.5 h-3.5" />}
              label={isPredictionMarket ? "Share Holders" : "Holders"}
              count={(yesHolders?.length || 0) + (noHolders?.length || 0)}
            />
            <TabButton
              active={activeTab === "lp"}
              onClick={() => setActiveTab("lp")}
              icon={<Droplets className="w-3.5 h-3.5" />}
              label="Liquidity"
            />
          </div>

          {/* Tab Content */}
          <div className="p-4 max-h-[400px] overflow-y-auto">
            {activeTab === "trades" && (
              <TradesTab
                swaps={swaps || []}
                isLoading={swapsLoading}
                token0Symbol={token0Symbol}
                token1Symbol={token1Symbol}
                yesIsId0={pammData?.yesIsId0}
                isPredictionMarket={isPredictionMarket}
              />
            )}
            {activeTab === "holders" && (
              <HoldersTab
                yesHolders={isPredictionMarket ? (yesHolders || []) : (token0Holders || [])}
                noHolders={isPredictionMarket ? (noHolders || []) : []}
                isLoading={holdersLoading}
                isPredictionMarket={isPredictionMarket}
              />
            )}
            {activeTab === "lp" && (
              <LiquidityTab pool={pool} isPredictionMarket={isPredictionMarket} />
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
      )}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{count}</span>
      )}
    </button>
  );
}

function TradesTab({
  swaps,
  isLoading,
  token0Symbol,
  token1Symbol,
  yesIsId0,
  isPredictionMarket,
}: {
  swaps: SwapEvent[];
  isLoading: boolean;
  token0Symbol: string;
  token1Symbol: string;
  yesIsId0?: boolean;
  isPredictionMarket?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (swaps.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No recent trades</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {swaps.map((swap) => {
        const formatted = formatSwapEvent(swap, token0Symbol, token1Symbol, yesIsId0);
        const isBuy = formatted.type === "buy";

        return (
          <a
            key={swap.id}
            href={`https://etherscan.io/tx/${swap.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-2 rounded hover:bg-muted/50 transition-colors group"
          >
            <div className="flex items-center gap-2">
              {isBuy ? (
                <ArrowUpRight className="w-4 h-4 text-emerald-500" />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-rose-500" />
              )}
              <div>
                <div className="flex items-center gap-1.5">
                  <span className={cn("text-sm font-medium", isBuy ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                    {isPredictionMarket && formatted.side ? `Buy ${formatted.side}` : isBuy ? "Buy" : "Sell"}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {Number(formatted.amountOut).toFixed(4)} {formatted.tokenOut}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  for {Number(formatted.amountIn).toFixed(4)} {formatted.tokenIn}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatTimeAgo(formatted.timestamp)}</span>
              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </a>
        );
      })}
    </div>
  );
}

function HoldersTab({
  yesHolders,
  noHolders,
  isLoading,
  isPredictionMarket,
}: {
  yesHolders: TokenHolder[];
  noHolders: TokenHolder[];
  isLoading: boolean;
  isPredictionMarket?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  const hasHolders = yesHolders.length > 0 || noHolders.length > 0;

  if (!hasHolders) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No holder data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isPredictionMarket ? (
        <>
          {/* YES Holders */}
          <div>
            <h4 className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-2 flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              YES Holders ({yesHolders.length})
            </h4>
            <HoldersList holders={yesHolders} />
          </div>
          {/* NO Holders */}
          {noHolders.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-rose-600 dark:text-rose-400 mb-2 flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-rose-500" />
                NO Holders ({noHolders.length})
              </h4>
              <HoldersList holders={noHolders} />
            </div>
          )}
        </>
      ) : (
        <HoldersList holders={yesHolders} />
      )}
    </div>
  );
}

function HoldersList({ holders }: { holders: TokenHolder[] }) {
  // Filter out zero balances and sort by balance descending
  const sortedHolders = holders
    .filter((h) => BigInt(h.balance) > 0n)
    .sort((a, b) => (BigInt(b.balance) > BigInt(a.balance) ? 1 : -1))
    .slice(0, 10);

  const totalBalance = sortedHolders.reduce((acc, h) => acc + BigInt(h.balance), 0n);

  return (
    <div className="space-y-1">
      {sortedHolders.map((holder, i) => (
        <HolderRow
          key={holder.address}
          address={holder.address}
          balance={holder.balance}
          rank={i + 1}
          totalBalance={totalBalance}
        />
      ))}
    </div>
  );
}

function HolderRow({
  address,
  balance,
  rank,
  totalBalance,
}: {
  address: string;
  balance: string;
  rank: number;
  totalBalance: bigint;
}) {
  const { data: ensName } = useEnsName({ address: address as `0x${string}` });
  const balanceBigInt = BigInt(balance);
  const percentage = totalBalance > 0n ? (Number(balanceBigInt) / Number(totalBalance)) * 100 : 0;

  return (
    <a
      href={`https://etherscan.io/address/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between p-2 rounded hover:bg-muted/50 transition-colors group"
    >
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-4">{rank}</span>
        <span className="text-sm font-mono">
          {ensName || `${address.slice(0, 6)}...${address.slice(-4)}`}
        </span>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="tabular-nums">{Number(formatUnits(balanceBigInt, 18)).toFixed(2)}</span>
        <span className="text-xs text-muted-foreground w-12 text-right tabular-nums">{percentage.toFixed(1)}%</span>
        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
      </div>
    </a>
  );
}

function LiquidityTab({ pool, isPredictionMarket }: { pool: Pool; isPredictionMarket?: boolean }) {
  const reserve0 = pool.reserve0 ? Number(formatEther(BigInt(pool.reserve0))) : 0;
  const reserve1 = pool.reserve1 ? Number(formatEther(BigInt(pool.reserve1))) : 0;
  const totalLiquidity = reserve0 + reserve1;

  const token0Symbol = isPredictionMarket ? "YES" : (pool.coin0?.symbol || "Token0");
  const token1Symbol = isPredictionMarket ? "NO" : (pool.coin1?.symbol || "Token1");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 rounded-lg bg-muted/30 border">
          <div className="text-xs text-muted-foreground mb-1">{token0Symbol} Reserve</div>
          <div className="text-lg font-medium tabular-nums">{reserve0.toFixed(4)}</div>
        </div>
        <div className="p-3 rounded-lg bg-muted/30 border">
          <div className="text-xs text-muted-foreground mb-1">{token1Symbol} Reserve</div>
          <div className="text-lg font-medium tabular-nums">{reserve1.toFixed(4)}</div>
        </div>
      </div>

      {/* Reserve ratio bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{token0Symbol}</span>
          <span>{token1Symbol}</span>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden bg-muted/30">
          {totalLiquidity > 0 && (
            <>
              <div
                className={cn(
                  "transition-all",
                  isPredictionMarket
                    ? "bg-emerald-500"
                    : "bg-blue-500"
                )}
                style={{ width: `${(reserve0 / totalLiquidity) * 100}%` }}
              />
              <div
                className={cn(
                  "transition-all",
                  isPredictionMarket
                    ? "bg-rose-500"
                    : "bg-purple-500"
                )}
                style={{ width: `${(reserve1 / totalLiquidity) * 100}%` }}
              />
            </>
          )}
        </div>
        <div className="flex justify-between text-xs tabular-nums">
          <span>{totalLiquidity > 0 ? ((reserve0 / totalLiquidity) * 100).toFixed(1) : 50}%</span>
          <span>{totalLiquidity > 0 ? ((reserve1 / totalLiquidity) * 100).toFixed(1) : 50}%</span>
        </div>
      </div>

      {/* Pool stats */}
      <div className="pt-3 border-t space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total Liquidity</span>
          <span className="font-medium tabular-nums">{totalLiquidity.toFixed(4)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Swap Fee</span>
          <span className="font-medium">{pool.swapFee ? `${Number(pool.swapFee)} bps` : "—"}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Pool Type</span>
          <span className="font-medium">{pool.source === "ZAMM" ? "V0" : "V1"}</span>
        </div>
      </div>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}
