import { useTranslation } from "react-i18next";
import { formatUnits, formatEther } from "viem";
import { IncentiveStream } from "@/hooks/use-incentive-streams";
import { useZChefUtilities } from "@/hooks/use-zchef-contract";
import { APYDisplay } from "@/components/APYDisplay";
import { cn } from "@/lib/utils";

interface IncentiveStreamCardProps {
  stream: IncentiveStream;
}

export function IncentiveStreamCard({ stream }: IncentiveStreamCardProps) {
  const { t } = useTranslation();
  const { calculateTimeRemaining, formatRewardRate } = useZChefUtilities();

  const timeRemaining = calculateTimeRemaining(stream.endTime);
  const isActive = stream.status === "ACTIVE" && timeRemaining.days > 0;

  const rewardTokenDecimals = stream.rewardCoin?.decimals || 18;
  const rewardRates = formatRewardRate(stream.rewardRate, rewardTokenDecimals);

  const progress = (() => {
    const now = BigInt(Math.floor(Date.now() / 1000));

    // Handle missing or invalid startTime (offline mode fallback)
    if (
      !stream.startTime ||
      stream.startTime === 0n ||
      stream.startTime >= stream.endTime
    ) {
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
    <div className="w-full border-2 border-primary/60 bg-gradient-to-br from-card/90 to-card/60 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-300 hover:border-primary group">
      <div className="p-4 border-b border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {stream.lpPool?.coin.imageUrl && (
              <div className="relative">
                <img
                  src={stream.lpPool.coin.imageUrl}
                  alt={stream.lpPool.coin.symbol}
                  className="w-8 h-8 rounded-full border-2 border-primary/40 shadow-md"
                />
                <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-primary/30 to-transparent opacity-50 blur-sm group-hover:opacity-70 transition-opacity"></div>
              </div>
            )}
            <h3 className="font-mono font-bold text-base sm:text-lg uppercase tracking-wider bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              [{stream.lpPool?.coin.symbol || `Pool ${stream.lpId}`}]
            </h3>
          </div>
          <div
            className={cn(
              "px-3 py-1.5 border-2 font-mono text-xs uppercase tracking-wider font-bold rounded backdrop-blur-sm transition-all duration-200",
              isActive
                ? "border-green-500/60 text-green-600 dark:text-green-400 bg-gradient-to-r from-green-500/20 to-green-500/10 shadow-green-500/20 shadow-lg"
                : "border-red-500/60 text-red-600 dark:text-red-400 bg-gradient-to-r from-red-500/20 to-red-500/10 shadow-red-500/20 shadow-lg",
            )}
          >
            {isActive ? t("common.active") : t("common.ended")}
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-3">
          <span className="font-mono text-primary">&gt;</span>
          <span className="font-mono font-medium">
            {t("common.reward_token")}:
          </span>
          <div className="flex items-center gap-2 bg-background/40 border border-primary/20 rounded-full px-3 py-1">
            {stream.rewardCoin?.imageUrl && (
              <img
                src={stream.rewardCoin.imageUrl}
                alt={stream.rewardCoin.symbol}
                className="w-5 h-5 rounded-full border border-primary/40"
              />
            )}
            <span className="font-mono font-bold text-primary">
              {stream.rewardCoin?.symbol || `Token ${stream.rewardId}`}
            </span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Time Remaining */}
        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm sm:text-base">
            <span className="font-mono font-bold text-primary">
              [{t("common.time_remaining")}]
            </span>
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

        {/* Reward Information */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-lg p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm sm:text-base">
            <div className="space-y-1">
              <p className="text-muted-foreground font-mono font-medium">
                [{t("common.daily_rewards")}]
              </p>
              <p className="font-mono font-bold text-lg text-primary">
                {parseFloat(rewardRates.perDay || "0").toFixed(6)}
              </p>
              <p className="text-xs text-muted-foreground font-mono">
                {stream.rewardCoin?.symbol}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground font-mono font-medium">
                [{t("common.total_rewards")}]
              </p>
              <p className="font-mono font-bold text-lg text-primary">
                {parseFloat(
                  formatUnits(
                    stream.rewardAmount || BigInt(0),
                    rewardTokenDecimals,
                  ),
                ).toFixed(6)}
              </p>
              <p className="text-xs text-muted-foreground font-mono">
                {stream.rewardCoin?.symbol}
              </p>
            </div>
          </div>
        </div>

        {/* Pool Information */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-background/30 border border-primary/20 rounded-lg p-3">
            <p className="text-muted-foreground font-mono font-medium text-sm">
              [{t("common.total_staked")}]
            </p>
            <p className="font-mono font-bold text-lg text-primary mt-1">
              {parseFloat(formatEther(stream.totalShares)).toFixed(6)}
            </p>
            <p className="text-xs text-muted-foreground font-mono">LP Tokens</p>
          </div>
          <div className="bg-background/30 border border-primary/20 rounded-lg p-3">
            <APYDisplay
              stream={stream}
              lpTokenPrice={stream.lpPool?.price}
              rewardTokenPrice={stream.lpPool?.price}
              className="text-sm"
            />
          </div>
        </div>

        {/* Pool Reserves & Liquidity */}
        {stream.lpPool && stream.lpPool.liquidity !== undefined && (
          <div className="border-t border-primary/30 pt-4 mt-4">
            <h4 className="font-mono font-bold text-sm uppercase tracking-wider mb-3 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              [{t("common.pool_info")}]
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="bg-background/20 border border-primary/20 rounded p-3">
                <p className="text-muted-foreground font-mono font-medium text-xs">
                  [{t("common.total_liquidity")}]
                </p>
                <p className="font-mono font-bold text-primary text-base mt-1">
                  {parseFloat(formatEther(stream.lpPool.liquidity)).toFixed(4)}{" "}
                  ETH
                </p>
              </div>
              {stream.lpPool.volume24h !== undefined &&
                stream.lpPool.volume24h > 0n && (
                  <div className="bg-background/20 border border-primary/20 rounded p-3">
                    <p className="text-muted-foreground font-mono font-medium text-xs">
                      [{t("common.24h_volume")}]
                    </p>
                    <p className="font-mono font-bold text-primary text-base mt-1">
                      {parseFloat(formatEther(stream.lpPool.volume24h)).toFixed(
                        4,
                      )}{" "}
                      ETH
                    </p>
                  </div>
                )}
            </div>
          </div>
        )}

        {/* Stream Details */}
        <div className="border-t border-primary/30 pt-4 mt-4">
          <div className="bg-background/20 border border-primary/20 rounded-lg p-3">
            <h5 className="font-mono font-bold text-xs uppercase tracking-wider text-primary mb-3">
              [STREAM_METADATA]
            </h5>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  [{t("common.chef_id")}]:
                </span>
                <span className="bg-primary/20 border border-primary/30 px-2 py-1 rounded font-bold text-primary">
                  {stream.chefId.toString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  [{t("common.created_by")}]:
                </span>
                <span className="bg-primary/20 border border-primary/30 px-2 py-1 rounded font-bold text-primary">
                  {stream.creator.slice(0, 6)}...{stream.creator.slice(-4)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  [{t("common.started")}]:
                </span>
                <span className="bg-primary/20 border border-primary/30 px-2 py-1 rounded font-bold text-primary">
                  {(() => {
                    try {
                      return new Date(
                        Number(stream.startTime) * 1000,
                      ).toLocaleDateString();
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
