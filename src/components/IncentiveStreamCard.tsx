import { APYDisplay } from "@/components/APYDisplay";
import { formatImageURL } from "@/hooks/metadata";
import type { IncentiveStream } from "@/hooks/use-incentive-streams";
import { useZChefUtilities, useZChefPool } from "@/hooks/use-zchef-contract";
import type { TokenMeta } from "@/lib/coins";
import { cn, formatBalance } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits } from "viem";

interface IncentiveStreamCardProps {
  stream: IncentiveStream;
  lpToken: TokenMeta;
}

export function IncentiveStreamCard({ stream, lpToken }: IncentiveStreamCardProps) {
  const { t } = useTranslation();
  const { calculateTimeRemaining } = useZChefUtilities();

  // Get real-time total shares from zChef contract
  const { data: poolData } = useZChefPool(stream.chefId);
  const totalShares = poolData?.[7] ?? stream.totalShares ?? 0n;

  const timeRemaining = calculateTimeRemaining(stream.endTime);
  const isActive = stream.status === "ACTIVE" && timeRemaining.seconds > 0;

  const rewardTokenDecimals = stream.rewardCoin?.decimals || 18;

  const progress = (() => {
    const now = BigInt(Math.floor(Date.now() / 1000));

    // Handle missing or invalid startTime (offline mode fallback)
    if (!stream.startTime || stream.startTime === 0n || stream.startTime >= stream.endTime) {
      // Fallback: estimate based on current position
      if (now >= BigInt(stream.endTime)) return 100;
      return 50; // Assume halfway through if we can't calculate
    }

    const totalDuration = BigInt(stream.endTime) - BigInt(stream.startTime);
    const elapsed = now - BigInt(stream.startTime);

    if (elapsed <= 0n) return 0;
    if (elapsed >= totalDuration) return 100;

    return Number((elapsed * 100n) / totalDuration);
  })();

  // totalValueLocked and dailyRewards are now handled by APYDisplay component

  return (
    <div className="bg-card text-card-foreground w-full border-2 border-border shadow-[4px_4px_0_var(--border)] transition-all hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_var(--border)] group">
      <div className="p-6 border-b-2 border-border bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {lpToken?.imageUrl && (
              <div className="relative">
                <img
                  src={formatImageURL(lpToken?.imageUrl)}
                  alt={lpToken?.symbol}
                  className="w-8 h-8 rounded-full border-2 border-primary/40 shadow-md"
                />
                <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-primary/20 to-transparent opacity-30 group-hover:opacity-50 transition-opacity"></div>
              </div>
            )}
            <h3 className="font-mono font-bold text-base sm:text-lg uppercase tracking-wider bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent break-all">
              [{lpToken?.symbol}]
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "px-3 py-1.5 border-2 font-mono text-xs uppercase tracking-wider font-bold rounded transition-all duration-200",
                isActive
                  ? "border-green-500/60 text-green-600 dark:text-green-400 bg-gradient-to-r from-green-500/20 to-green-500/10"
                  : "border-red-500/60 text-red-600 dark:text-red-400 bg-gradient-to-r from-red-500/20 to-red-500/10",
              )}
            >
              {isActive ? t("orders.active") : t("common.ended")}
            </div>
            {totalShares > 0n && (
              <div className="px-2 py-1 bg-primary/20 border border-primary/40 rounded text-xs font-mono font-bold text-primary animate-pulse">
                🔥 HOT
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-3">
          <span className="font-mono text-primary">&gt;</span>
          <span className="font-mono font-medium">{t("common.reward_token")}:</span>
          <div className="flex items-center gap-2 bg-background/40 border border-primary/20 rounded-full px-3 py-1">
            {stream.rewardCoin?.imageUrl && (
              <img
                src={formatImageURL(stream.rewardCoin.imageUrl)}
                alt={stream.rewardCoin.symbol}
                className="w-5 h-5 rounded-full border border-primary/40"
              />
            )}
            <span className="font-mono font-bold text-primary break-all">
              {stream.rewardCoin?.symbol ||
                (() => {
                  const rewardId = stream.rewardId?.toString();
                  // Reward IDs may be variable, handle gracefully
                  if (!rewardId) return "Unknown Token";
                  return rewardId.length > 16
                    ? `Token ${rewardId.slice(0, 8)}...${rewardId.slice(-8)}`
                    : `Token ${rewardId}`;
                })()}
            </span>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Time Remaining */}
        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm sm:text-base">
            <span className="font-mono font-bold text-primary">[{t("common.time_remaining")}]</span>
            <div className="bg-background/50 border border-primary/30 rounded px-3 py-1">
              <span className="font-mono font-bold text-primary">
                {isActive
                  ? `${timeRemaining.days}d ${timeRemaining.hours}h ${timeRemaining.minutes}m`
                  : t("common.ended")}
              </span>
            </div>
          </div>
          <div className="relative">
            <div className="w-full h-3 border-2 border-primary/40 bg-gradient-to-r from-muted/30 to-muted/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary/60 transition-all duration-500 shadow-lg"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent rounded-full"></div>
          </div>
        </div>

        {/* Total Rewards */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground font-mono font-medium text-sm">[{t("common.total_rewards")}]</span>
            <span className="font-mono font-bold text-lg text-primary">
              {formatBalance(
                formatUnits(stream.rewardAmount || BigInt(0), rewardTokenDecimals),
                stream.rewardCoin?.symbol,
                6,
              )}
            </span>
          </div>
        </div>

        {/* Pool Information */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="bg-background/30 border border-primary/20 rounded-lg p-3 relative overflow-hidden group/stat">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/10 opacity-0 group-hover/stat:opacity-100 transition-opacity duration-300"></div>
            <div className="relative z-10">
              <p className="text-muted-foreground font-mono font-medium text-xs">[{t("common.total_staked")}]</p>
              <p className="font-mono font-bold text-lg text-primary mt-1">
                {formatBalance(formatEther(totalShares), "LP", 15)}
              </p>
            </div>
          </div>
          {lpToken && lpToken.liquidity !== undefined && (
            <div className="bg-background/30 border border-primary/20 rounded-lg p-3 relative overflow-hidden group/liquidity">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/10 opacity-0 group-hover/liquidity:opacity-100 transition-opacity duration-300"></div>
              <div className="relative z-10">
                <p className="text-muted-foreground font-mono font-medium text-xs">[{t("pool.liquidity")}]</p>
                <p className="font-mono font-bold text-lg text-primary mt-1">
                  {formatBalance(formatEther(lpToken.reserve0 || lpToken.liquidity || 0n), "ETH", 15)}
                </p>
              </div>
            </div>
          )}
          <div className="bg-background/30 border border-primary/20 rounded-lg p-3 relative overflow-hidden group/apy sm:col-span-2 lg:col-span-1">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/10 opacity-0 group-hover/apy:opacity-100 transition-opacity duration-300"></div>
            <div className="relative z-10">
              <APYDisplay
                stream={{ ...stream, totalShares }}
                lpTokenPrice={undefined}
                rewardTokenPrice={undefined}
                className="text-sm"
              />
            </div>
          </div>
        </div>

        {/* Stream Details */}
        <div className="border-t border-primary/30 pt-4 mt-4">
          <div className="bg-background/20 border border-primary/20 rounded-lg p-3">
            <h5 className="font-mono font-bold text-xs uppercase tracking-wider text-primary mb-2">
              [{t("common.details")}]
            </h5>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">[{t("common.chef_id")}]:</span>
                <span className="bg-primary/20 border border-primary/30 px-2 py-1 rounded font-bold text-primary break-all max-w-[60%] text-right">
                  {(() => {
                    const chefId = stream.chefId.toString();
                    // Chef IDs are always full uint, truncate for UI
                    return chefId.length > 16 ? `${chefId.slice(0, 8)}...${chefId.slice(-8)}` : chefId;
                  })()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">[{t("common.created_by")}]:</span>
                <span className="bg-primary/20 border border-primary/30 px-2 py-1 rounded font-bold text-primary max-w-[60%] text-right">
                  {stream.creator.slice(0, 6)}...{stream.creator.slice(-4)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">[{t("common.started")}]:</span>
                <span className="bg-primary/20 border border-primary/30 px-2 py-1 rounded font-bold text-primary">
                  {(() => {
                    try {
                      return new Date(Number(stream.startTime) * 1000).toLocaleDateString();
                    } catch {
                      return "N/A";
                    }
                  })()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
