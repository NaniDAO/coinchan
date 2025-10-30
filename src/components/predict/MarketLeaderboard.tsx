import { useState } from "react";
import { useMarketLeaderboard } from "@/hooks/use-market-leaderboard";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { formatEther } from "viem";
import { cn } from "@/lib/utils";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MarketLeaderboardProps {
  marketId: bigint;
}

type SortField = "netPnL" | "totalVolume" | "lastActivityAt" | "buyCount";
type SortOrder = "desc" | "asc";

export function MarketLeaderboard({ marketId }: MarketLeaderboardProps) {
  const [sortBy, setSortBy] = useState<SortField>("netPnL");
  const [order, setOrder] = useState<SortOrder>("desc");

  const { data, isLoading, error } = useMarketLeaderboard({
    marketId,
    sortBy,
    order,
    limit: 100,
  });

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      // Toggle order if clicking the same field
      setOrder(order === "desc" ? "asc" : "desc");
    } else {
      // Set new field with default desc order
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

  if (!data || data.participants.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No participants yet. Be the first to trade!
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 px-4">
        <div className="space-y-1">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Total Participants
          </p>
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {data.summary.totalParticipants}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Active Positions
          </p>
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {data.summary.activePositions}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Total Pot</p>
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {data.market.potEth} wstETH
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
              <th className="px-4 py-3 text-right font-medium text-zinc-600 dark:text-zinc-400">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("netPnL")}
                  className="h-auto p-0 hover:bg-transparent flex items-center gap-1 ml-auto"
                >
                  PnL (wstETH)
                  <SortIcon field="netPnL" />
                </Button>
              </th>
              <th className="px-4 py-3 text-right font-medium text-zinc-600 dark:text-zinc-400">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("totalVolume")}
                  className="h-auto p-0 hover:bg-transparent flex items-center gap-1 ml-auto"
                >
                  Volume (wstETH)
                  <SortIcon field="totalVolume" />
                </Button>
              </th>
              <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-400">
                Position
              </th>
              <th className="px-4 py-3 text-right font-medium text-zinc-600 dark:text-zinc-400">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort("buyCount")}
                  className="h-auto p-0 hover:bg-transparent flex items-center gap-1 ml-auto"
                >
                  Trades
                  <SortIcon field="buyCount" />
                </Button>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.participants.map((participant, index) => {
              const pnl = Number.parseFloat(participant.netPnLEth);
              const isProfit = pnl > 0;
              const yesShares = BigInt(participant.currentYesShares);
              const noShares = BigInt(participant.currentNoShares);

              return (
                <tr
                  key={participant.user}
                  className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-colors"
                >
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    #{index + 1}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    {participant.user.slice(0, 6)}...{participant.user.slice(-4)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right font-medium tabular-nums",
                      isProfit
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400",
                    )}
                  >
                    {isProfit ? "+" : ""}
                    {Number.parseFloat(participant.netPnLEth).toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300 tabular-nums">
                    {Number.parseFloat(participant.totalVolumeEth).toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {participant.hasOpenPosition ? (
                      <div className="flex flex-col gap-0.5 text-xs">
                        {yesShares > 0n && (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            YES: {formatEther(yesShares).slice(0, 8)}
                          </span>
                        )}
                        {noShares > 0n && (
                          <span className="text-zinc-600 dark:text-zinc-400">
                            NO: {formatEther(noShares).slice(0, 8)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400">Closed</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400 text-xs">
                    {participant.buyCount}B / {participant.sellCount}S
                    {participant.claimCount > 0 && ` / ${participant.claimCount}C`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Info */}
      {data.pagination.total > data.pagination.limit && (
        <div className="px-4 text-xs text-zinc-500 dark:text-zinc-400 text-center">
          Showing {data.participants.length} of {data.pagination.total} participants
        </div>
      )}
    </div>
  );
}
