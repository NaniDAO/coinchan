import { APRDisplay } from "@/components/farm/APRDisplay";
import { formatImageURL } from "@/hooks/metadata";
import type { IncentiveStream } from "@/hooks/use-incentive-streams";
import { useLpBalance } from "@/hooks/use-lp-balance";
import { useZChefPool, useZChefUserBalance, useZChefUtilities } from "@/hooks/use-zchef-contract";
import { ENS_POOL_ID, type TokenMeta } from "@/lib/coins";
import { cn, formatBalance } from "@/lib/utils";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits } from "viem";
import { useEnsName } from "wagmi";
import { FarmStakeDialog } from "./FarmStakeDialog";
import { Button } from "./ui/button";
import { ENSLogo } from "./icons/ENSLogo";

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

  // Get user's staked amount from zChef
  const { data: stakedAmount } = useZChefUserBalance(stream.chefId);

  const hasStakeableTokens = lpBalance > 0n;
  const hasStakedTokens = stakedAmount && stakedAmount > 0n;

  // Helper function to format LP amounts with consistent precision
  const formatLpAmount = (amount: bigint, includeUnit = true) => {
    const num = Number(formatUnits(amount, 18));
    // Format with 4 decimal places, then remove only trailing zeros after decimal point
    let formatted = num.toFixed(4);
    // Remove trailing zeros after decimal point, but keep at least 2 decimal places
    if (formatted.includes(".")) {
      formatted = formatted.replace(/(\.\d{2})\d*?0+$/, "$1").replace(/\.00$/, ".00");
    }
    return includeUnit ? `${formatted} LP` : formatted;
  };

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
    if (totalDuration <= 0n) return 100; // Invalid duration, consider complete
    if (elapsed >= totalDuration) return 100;

    const progress = Number((elapsed * 100n) / totalDuration);

    return progress;
  }, [stream.startTime, stream.endTime]);

  // totalValueLocked and dailyRewards are now handled by APYDisplay component

  // Check if this farm is incentivizing the ENS pool
  const isENSFarm = BigInt(stream.lpId) === ENS_POOL_ID;

  return (
    <div
      className={cn(
        "bg-card text-card-foreground w-full border",
        hasStakeableTokens || hasStakedTokens ? "border-green-600" : "border-border",
      )}
    >
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isENSFarm ? (
              <ENSLogo className="w-6 h-6" />
            ) : lpToken?.symbol === "CULT" ? (
              <img src="/cult.jpg" alt="CULT" className="w-6 h-6 border border-muted" />
            ) : lpToken?.imageUrl ? (
              <img
                src={formatImageURL(lpToken?.imageUrl)}
                alt={lpToken?.symbol}
                className="w-6 h-6 border border-muted"
              />
            ) : null}
            <h3 className="font-mono font-bold text-sm uppercase tracking-wider text-foreground break-all">
              [{isENSFarm ? "ENS" : lpToken?.symbol}]
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
              {!!(hasStakeableTokens || hasStakedTokens) && (
                <div className="text-xs text-green-600 font-mono mt-1">
                  {hasStakeableTokens && hasStakedTokens ? (
                    // Show both available LP and staked amounts
                    <>
                      {formatLpAmount(lpBalance)} / {formatLpAmount(stakedAmount || 0n, false)} {t("common.staked")}
                    </>
                  ) : hasStakeableTokens ? (
                    // Show only available LP tokens
                    <>{formatLpAmount(lpBalance)}</>
                  ) : (
                    // Show only staked amount
                    <>
                      {formatLpAmount(stakedAmount || 0n)} {t("common.staked")}
                    </>
                  )}
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
                  if (!rewardId) return t("common.unknown_token");
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
          <div className="border border-muted p-2 sm:p-3">
            <p className="text-muted-foreground font-mono text-xs">[{t("common.total_staked")}]</p>
            <p className="font-mono font-bold text-sm text-foreground mt-1">
              {formatBalance(formatEther(totalShares), "LP")}
            </p>
          </div>
          {lpToken && lpToken.liquidity !== undefined && (
            <div className="border border-muted p-2 sm:p-3">
              <p className="text-muted-foreground font-mono text-xs">[{t("pool.liquidity")}]</p>
              <p className="font-mono font-bold text-sm text-foreground mt-1">
                {formatBalance(formatEther(lpToken.reserve0 || lpToken.liquidity || 0n), "ETH")}
              </p>
            </div>
          )}
          <div className="border border-muted p-2 sm:p-3 sm:col-span-2 lg:col-span-1">
            <APRDisplay stream={stream} lpToken={lpToken} shortView={true} />
          </div>
        </div>

        {/* Stream Details */}
        <div className="border-t border-muted pt-3 mt-3">
          <div className="border border-muted p-2 sm:p-3">
            <h5 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2">
              [{t("common.details")}]
            </h5>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-0">
                <span className="text-muted-foreground">[{t("common.chef_id")}]:</span>
                <span className="border border-muted px-1 py-0.5 font-bold text-foreground break-all sm:max-w-[60%] text-left sm:text-right">
                  {(() => {
                    const chefId = stream.chefId.toString();
                    // Chef IDs are always full uint, truncate for UI
                    return chefId.length > 16 ? `${chefId.slice(0, 8)}...${chefId.slice(-8)}` : chefId;
                  })()}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-0">
                <span className="text-muted-foreground">[{t("common.created_by")}]:</span>
                <span className="border border-muted px-1 py-0.5 font-bold text-foreground sm:max-w-[60%] text-left sm:text-right">
                  {creatorEnsName ?? `${stream.creator.slice(0, 6)}...${stream.creator.slice(-4)}`}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-0">
                <span className="text-muted-foreground">[{t("common.started")}]:</span>
                <span className="border border-muted px-1 py-0.5 font-bold text-foreground text-left sm:text-right">
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
            <Button
              variant="outline"
              className="w-full border-muted font-mono text-sm sm:text-base uppercase tracking-wider py-2 sm:py-3"
            >
              [{t("common.stake")}]
            </Button>
          }
        />
      </div>
    </div>
  );
}
