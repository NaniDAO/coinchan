import { useMemo, useState } from "react";
import {
  useMarketLeaderboard,
  type MarketBet,
} from "@/hooks/use-market-leaderboard";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { cn } from "@/lib/utils";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MarketLeaderboardProps {
  marketId: bigint;
}

type SortField = "netProfit" | "totalDeposited" | "betCount";
type SortOrder = "desc" | "asc";

interface TraderStats {
  trader: string;
  netProfit: number;
  isProfitable: boolean;
  totalDeposited: number;
  totalWithdrawn: number;
  betCount: number;
  claimCount: number;
  sides: Set<"YES" | "NO">;
  bets: MarketBet[];
}

export function MarketLeaderboard({ marketId }: MarketLeaderboardProps) {
  const [sortBy, setSortBy] = useState<SortField>("netProfit");
  const [order, setOrder] = useState<SortOrder>("desc");

  const { data, isLoading, error } = useMarketLeaderboard({ marketId });

  // Aggregate bets by trader
  const traderStats = useMemo(() => {
    if (!data?.bets) return [];

    const statsMap = new Map<string, TraderStats>();

    for (const bet of data.bets) {
      const existing = statsMap.get(bet.trader);

      if (existing) {
        existing.bets.push(bet);
        existing.sides.add(bet.side);
        existing.betCount++;
        existing.claimCount += bet.claims.length;
        // Use the latest bet's user-level stats (they should be consistent across all bets for a trader)
        // Convert from wei to wstETH (divide by 10^18)
        existing.netProfit = Number.parseFloat(bet.userNetProfit) / 1e18;
        existing.isProfitable = bet.userIsProfitable;
        existing.totalDeposited = Number.parseFloat(bet.userTotalDeposited) / 1e18;
        existing.totalWithdrawn = Number.parseFloat(bet.userTotalWithdrawn) / 1e18;
      } else {
        statsMap.set(bet.trader, {
          trader: bet.trader,
          // Convert from wei to wstETH (divide by 10^18)
          netProfit: Number.parseFloat(bet.userNetProfit) / 1e18,
          isProfitable: bet.userIsProfitable,
          totalDeposited: Number.parseFloat(bet.userTotalDeposited) / 1e18,
          totalWithdrawn: Number.parseFloat(bet.userTotalWithdrawn) / 1e18,
          betCount: 1,
          claimCount: bet.claims.length,
          sides: new Set([bet.side]),
          bets: [bet],
        });
      }
    }

    return Array.from(statsMap.values());
  }, [data?.bets]);

  // Sort traders
  const sortedTraders = useMemo(() => {
    const sorted = [...traderStats].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "netProfit":
          comparison = a.netProfit - b.netProfit;
          break;
        case "totalDeposited":
          comparison = a.totalDeposited - b.totalDeposited;
          break;
        case "betCount":
          comparison = a.betCount - b.betCount;
          break;
      }

      return order === "desc" ? -comparison : comparison;
    });

    return sorted;
  }, [traderStats, sortBy, order]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setOrder(order === "desc" ? "asc" : "desc");
    } else {
      setSortBy(field);
      setOrder("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) {
      return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    }
    return order === "desc" ? (
      <ArrowDown className="h-3 w-3" />
    ) : (
      <ArrowUp className="h-3 w-3" />
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingLogo />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Failed to load leaderboard data
        </p>
      </div>
    );
  }

  if (!data || data.bets.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No bets yet. Be the first to trade!
        </p>
      </div>
    );
  }

  const uniqueTraders = traderStats.length;
  const profitableTraders = traderStats.filter((t) => t.isProfitable).length;

  return (
    <div className="w-full space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 px-4">
        <div className="space-y-1">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Total Traders
          </p>
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {uniqueTraders}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Profitable</p>
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {profitableTraders}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Total Bets</p>
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {data.totalBets}
          </p>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">
                Rank
              </th>
              <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">
                Address
              </th>
              <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">
                Side
              </th>
              <th className="px-4 py-3 text-right font-medium text-zinc-600 dark:text-zinc-400">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("netProfit")}
                  className="h-auto p-0 hover:bg-transparent flex items-center gap-1 ml-auto"
                >
                  PnL (wstETH)
                  <SortIcon field="netProfit" />
                </Button>
              </th>
              <th className="px-4 py-3 text-right font-medium text-zinc-600 dark:text-zinc-400">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("totalDeposited")}
                  className="h-auto p-0 hover:bg-transparent flex items-center gap-1 ml-auto"
                >
                  Deposited (wstETH)
                  <SortIcon field="totalDeposited" />
                </Button>
              </th>
              <th className="px-4 py-3 text-right font-medium text-zinc-600 dark:text-zinc-400">
                Withdrawn (wstETH)
              </th>
              <th className="px-4 py-3 text-right font-medium text-zinc-600 dark:text-zinc-400">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("betCount")}
                  className="h-auto p-0 hover:bg-transparent flex items-center gap-1 ml-auto"
                >
                  Bets
                  <SortIcon field="betCount" />
                </Button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedTraders.map((trader, index) => {
              const getSideDisplay = () => {
                if (trader.sides.size === 2) return "BOTH";
                return Array.from(trader.sides)[0];
              };

              const side = getSideDisplay();

              return (
                <tr
                  key={trader.trader}
                  className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-colors"
                >
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    #{index + 1}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    {trader.trader.slice(0, 6)}...{trader.trader.slice(-4)}
                  </td>
                  <td className="px-4 py-3">
                    {side === "YES" && (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-950/50 px-2.5 py-1 font-medium text-emerald-700 dark:text-emerald-400 text-xs">
                        YES
                      </span>
                    )}
                    {side === "NO" && (
                      <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-950/50 px-2.5 py-1 font-medium text-red-700 dark:text-red-400 text-xs">
                        NO
                      </span>
                    )}
                    {side === "BOTH" && (
                      <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-950/50 px-2.5 py-1 font-medium text-blue-700 dark:text-blue-400 text-xs">
                        BOTH
                      </span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right font-medium tabular-nums",
                      trader.isProfitable
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400",
                    )}
                  >
                    {trader.isProfitable ? "+" : ""}
                    {trader.netProfit.toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300 tabular-nums">
                    {trader.totalDeposited.toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300 tabular-nums">
                    {trader.totalWithdrawn.toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400 text-xs">
                    {trader.betCount}
                    {trader.claimCount > 0 && ` (${trader.claimCount}C)`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Total Info */}
      <div className="px-4 text-xs text-zinc-500 dark:text-zinc-400 text-center">
        Showing {sortedTraders.length} traders with {data.totalBets} total bets
      </div>
    </div>
  );
}
