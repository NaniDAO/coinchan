import { Badge } from "@/components/ui/badge";
import type { IncentiveStream } from "@/hooks/use-incentive-streams";
import { useZChefUtilities } from "@/hooks/use-zchef-contract";
import { cn, formatBalance } from "@/lib/utils";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatUnits } from "viem";

interface APYDisplayProps {
  stream: IncentiveStream;
  lpTokenPrice?: bigint; // Price of LP token in ETH/wei
  rewardTokenPrice?: bigint; // Price of reward token in ETH/wei
  className?: string;
}

export function APYDisplay({ stream, lpTokenPrice = 0n, rewardTokenPrice = 0n, className }: APYDisplayProps) {
  const { t } = useTranslation();
  const { calculateAPY } = useZChefUtilities();

  const rewardTokenDecimals = stream.rewardCoin?.decimals || 18;

  // Memoize expensive calculations
  const { apy, tvlInEth, dailyRewards } = useMemo(() => {
    // Calculate APY if we have LP price data (reward price often unavailable for community tokens)
    // If no reward price, we'll just show daily rewards and TVL
    const apy =
      lpTokenPrice && lpTokenPrice > 0n && rewardTokenPrice && rewardTokenPrice > 0n
        ? calculateAPY(stream.rewardRate, rewardTokenDecimals, rewardTokenPrice, stream.totalShares, lpTokenPrice)
        : null;

    // Calculate TVL in ETH terms
    const tvlInEth = lpTokenPrice && lpTokenPrice > 0n ? formatUnits(stream.totalShares * lpTokenPrice, 18) : null;

    // Calculate daily rewards
    // Note: rewardRate = (rewardAmount * ACC_PRECISION) / duration, where rewardAmount has rewardTokenDecimals
    // So rewardRate has scaling of (rewardTokenDecimals + 12) decimals
    const dailyRewards = formatUnits(BigInt(stream.rewardRate) * 86400n, rewardTokenDecimals + 12);

    return { apy, tvlInEth, dailyRewards };
  }, [lpTokenPrice, rewardTokenPrice, stream.rewardRate, stream.totalShares, rewardTokenDecimals, calculateAPY]);

  if (apy === null) {
    return (
      <div className={className}>
        <div className="space-y-2">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs font-mono font-medium text-muted-foreground truncate shrink-0">
              {t("common.apy")}:
            </span>
            <Badge variant="secondary" className="font-mono font-bold bg-muted/40 border-2 border-muted/60">
              --
            </Badge>
          </div>
          <div className="bg-background/30 border-2 border-primary/20 p-1.5 min-w-0">
            <div className="text-xs font-mono text-muted-foreground">
              <span className="text-primary font-medium truncate block">{t("common.daily_rewards")}:</span>
              <div className="font-bold text-primary text-xs mt-1 break-all overflow-hidden">
                {formatBalance(dailyRewards, stream.rewardCoin?.symbol, 8)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const apyColor =
    apy >= 100
      ? "text-green-600 dark:text-green-400"
      : apy >= 50
        ? "text-yellow-600 dark:text-yellow-400"
        : "text-foreground";
  const apyVariant = apy >= 100 ? "default" : apy >= 50 ? "secondary" : "outline";

  return (
    <div className={className}>
      <div className="space-y-3">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs font-mono font-medium text-muted-foreground truncate shrink-0">
            {t("common.apy")}:
          </span>
          <Badge
            variant={apyVariant}
            className={cn(
              "font-mono font-bold px-2 py-1 text-xs shadow-md shrink-0",
              apyColor,
              apy >= 100
                ? "bg-gradient-to-r from-green-500/20 to-green-500/10 border-green-500/50"
                : apy >= 50
                  ? "bg-gradient-to-r from-yellow-500/20 to-yellow-500/10 border-yellow-500/50"
                  : "bg-gradient-to-r from-muted/20 to-muted/10 border-muted/50",
            )}
          >
            {apy.toFixed(2)}%
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-background/30 border-2 border-primary/20 p-1.5 min-w-0">
            <span className="text-xs font-mono text-muted-foreground truncate block">{t("common.daily_rewards")}:</span>
            <div className="font-mono font-bold text-primary text-xs mt-1 break-all overflow-hidden">
              {formatBalance(dailyRewards, stream.rewardCoin?.symbol, 8)}
            </div>
          </div>
          {tvlInEth && (
            <div className="bg-background/30 border-2 border-primary/20 p-1.5 min-w-0">
              <span className="text-xs font-mono text-muted-foreground truncate block">{t("common.tvl")}:</span>
              <div className="font-mono font-bold text-primary text-xs mt-1 truncate">
                {Number.parseFloat(tvlInEth).toFixed(4)}
              </div>
              <div className="text-xs text-muted-foreground font-mono">ETH</div>
            </div>
          )}
        </div>

        {/* Additional metrics */}
        <div className="bg-background/20 border-2 border-primary/20 p-1.5">
          <div className="space-y-1 text-xs font-mono">
            <div className="flex justify-between items-center gap-1 min-w-0">
              <span className="text-muted-foreground truncate shrink-0">{t("common.reward_rate")}:</span>
              <span className="text-primary font-bold text-xs truncate">
                {formatUnits(stream.rewardRate, rewardTokenDecimals + 12)}/sec
              </span>
            </div>
            <div className="flex justify-between items-center gap-1 min-w-0">
              <span className="text-muted-foreground truncate shrink-0">{t("common.total_participants")}:</span>
              <span
                className={cn(
                  "font-bold text-xs",
                  stream.totalShares > 0n ? "text-green-500" : "text-muted-foreground",
                )}
              >
                {stream.totalShares > 0n ? "Active" : "None"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
