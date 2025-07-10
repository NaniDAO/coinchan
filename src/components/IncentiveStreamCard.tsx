import { APYDisplay } from "@/components/farm/APYDisplay";
import { formatImageURL } from "@/hooks/metadata";
import type { IncentiveStream } from "@/hooks/use-incentive-streams";
import { useLpBalance } from "@/hooks/use-lp-balance";
import { useZChefPool, useZChefUtilities } from "@/hooks/use-zchef-contract";
import type { TokenMeta } from "@/lib/coins";
import { cn, formatBalance } from "@/lib/utils";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits } from "viem";
import { useEnsName } from "wagmi";
import { FarmStakeDialog } from "./FarmStakeDialog";
import { Button } from "./ui/button";

interface IncentiveStreamCardProps {
  stream: IncentiveStream;
  lpToken: TokenMeta;
}

export function IncentiveStreamCard({ stream, lpToken }: IncentiveStreamCardProps) {
  const { t } = useTranslation();
  const { calculateTimeRemaining } = useZChefUtilities();
  const { data: creatorEnsName } = useEnsName({ address: stream.creator });

  // Get real-time total shares from zChef contract
  const { data: poolData } = useZChefPool(stream.chefId);
  const totalShares = poolData?.[7] ?? stream.totalShares ?? 0n;

  // Check if user has LP tokens for this farm
  const { balance: lpBalance } = useLpBalance({
    lpToken,
    poolId: stream.lpId,
  });
  const hasStakeableTokens = lpBalance > 0n;

  const timeRemaining = calculateTimeRemaining(stream.endTime);
  const isActive = stream.status === "ACTIVE" && timeRemaining.seconds > 0;

  const rewardTokenDecimals = stream.rewardCoin?.decimals || 18;

  const progress = useMemo(() => {
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

    const progress = Number((elapsed * 100n) / totalDuration);

    return progress;
  }, [stream.startTime, stream.endTime]);

  // totalValueLocked and dailyRewards are now handled by APYDisplay component

  return (
    <div
      className={cn(
        "bg-card text-card-foreground w-full border",
        hasStakeableTokens ? "border-green-600" : "border-border",
      )}
    >
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {lpToken?.imageUrl && (
              <img
                src={formatImageURL(lpToken?.imageUrl)}
                alt={lpToken?.symbol}
                className="w-6 h-6 border border-muted"
              />
            )}
            <h3 className="font-mono font-bold text-sm uppercase tracking-wider text-foreground break-all">
              [{lpToken?.symbol}]
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "px-2 py-1 border font-mono text-xs uppercase tracking-wider font-bold",
                isActive ? "border-green-700 text-green-600" : "border-muted text-muted-foreground",
              )}
            >
              [{isActive ? t("orders.active") : t("common.ended")}]
              {hasStakeableTokens && (
                <div className="text-xs text-green-600 font-mono mt-1">
                  {formatBalance(formatUnits(lpBalance, 18), "LP")} {t("common.stake")}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-3">
          <span className="font-mono text-foreground">&gt;</span>
          <span className="font-mono">{t("common.reward_token")}:</span>
          <div className="flex items-center gap-2 border border-muted px-2 py-1">
            {stream.rewardCoin?.imageUrl && (
              <img
                src={formatImageURL(stream.rewardCoin.imageUrl)}
                alt={stream.rewardCoin.symbol}
                className="w-4 h-4 border border-muted"
              />
            )}
            <span className="font-mono font-bold text-foreground break-all">
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

      <div className="p-4 space-y-4">
        {/* Time Remaining */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="font-mono text-muted-foreground">[{t("common.time_remaining")}]</span>
            <div className="border border-muted px-2 py-1">
              <span className="font-mono text-foreground">
                {isActive
                  ? `${timeRemaining.days}d ${timeRemaining.hours}h ${timeRemaining.minutes}m`
                  : t("common.ended")}
              </span>
            </div>
          </div>
          <div className="w-full h-2 border border-muted bg-background">
            <div className="h-full bg-foreground" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Total Rewards */}
        <div className="border border-muted p-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground font-mono text-sm">[{t("common.total_rewards")}]</span>
            <span className="font-mono font-bold text-sm text-foreground">
              {formatBalance(
                formatUnits(stream.rewardAmount || BigInt(0), rewardTokenDecimals),
                stream.rewardCoin?.symbol,
              )}
            </span>
          </div>
        </div>

        {/* Pool Information */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <div className="border border-muted p-2">
            <p className="text-muted-foreground font-mono text-xs">[{t("common.total_staked")}]</p>
            <p className="font-mono font-bold text-sm text-foreground mt-1">
              {formatBalance(formatEther(totalShares), "LP")}
            </p>
          </div>
          {lpToken && lpToken.liquidity !== undefined && (
            <div className="border border-muted p-2">
              <p className="text-muted-foreground font-mono text-xs">[{t("pool.liquidity")}]</p>
              <p className="font-mono font-bold text-sm text-foreground mt-1">
                {formatBalance(formatEther(lpToken.reserve0 || lpToken.liquidity || 0n), "ETH")}
              </p>
            </div>
          )}
          <div className="border border-muted p-2 sm:col-span-2 lg:col-span-1">
            <APYDisplay stream={stream} lpToken={lpToken} shortView={true} />
          </div>
        </div>

        {/* Stream Details */}
        <div className="border-t border-muted pt-3 mt-3">
          <div className="border border-muted p-2">
            <h5 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2">
              [{t("common.details")}]
            </h5>
            <div className="space-y-1 text-xs font-mono">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">[{t("common.chef_id")}]:</span>
                <span className="border border-muted px-1 py-0.5 font-bold text-foreground break-all max-w-[60%] text-right">
                  {(() => {
                    const chefId = stream.chefId.toString();
                    // Chef IDs are always full uint, truncate for UI
                    return chefId.length > 16 ? `${chefId.slice(0, 8)}...${chefId.slice(-8)}` : chefId;
                  })()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">[{t("common.created_by")}]:</span>
                <span className="border border-muted px-1 py-0.5 font-bold text-foreground max-w-[60%] text-right">
                  {creatorEnsName ?? `${stream.creator.slice(0, 6)}...${stream.creator.slice(-4)}`}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">[{t("common.started")}]:</span>
                <span className="border border-muted px-1 py-0.5 font-bold text-foreground">
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
        <FarmStakeDialog
          stream={stream}
          lpToken={lpToken}
          trigger={
            <Button variant="outline" className="w-full border-muted font-mono text-sm uppercase tracking-wider">
              [STAKE]
            </Button>
          }
        />
      </div>
    </div>
  );
}
