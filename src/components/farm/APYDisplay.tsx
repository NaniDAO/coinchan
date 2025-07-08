import { useCombinedApy } from "@/hooks/use-combined-apy";
import type { IncentiveStream } from "@/hooks/use-incentive-streams";
import { useZChefUtilities } from "@/hooks/use-zchef-contract";
import { TokenMeta } from "@/lib/coins";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatUnits } from "viem";

interface APYDisplayProps {
  stream: IncentiveStream;
  lpToken: TokenMeta;
  shortView?: boolean;
}

export function APYDisplay({
  stream,
  lpToken,
  shortView = true,
}: APYDisplayProps) {
  const { t } = useTranslation();
  const { calculateAPY } = useZChefUtilities();
  // Calculate combined APY (base + farm incentives)
  const combinedApyData = useCombinedApy({
    stream,
    lpToken,
    enabled: true, // Only fetch when dialog is open
  });

  // Memoize expensive calculations
  const { dailyRewards } = useMemo(() => {
    const rewardTokenDecimals = stream.rewardCoin?.decimals || 18;

    // Calculate daily rewards
    // Note: rewardRate = (rewardAmount * ACC_PRECISION) / duration, where rewardAmount has rewardTokenDecimals
    // So rewardRate has scaling of (rewardTokenDecimals + 12) decimals
    const dailyRewards = formatUnits(
      BigInt(stream.rewardRate) * 86400n,
      rewardTokenDecimals + 12,
    );

    return { dailyRewards, rewardTokenDecimals };
  }, [stream.rewardRate, stream.totalShares, calculateAPY]);

  console.log("Daily Rewards:", dailyRewards);

  if (combinedApyData.isLoading === true) {
    return (
      <div className="bg-gradient-to-r from-green-500/10 to-green-500/5 border border-green-500/30 rounded-lg p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-green-500/20 rounded mb-2"></div>
          <div className="h-8 bg-green-500/20 rounded mb-2"></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="h-16 bg-green-500/20 rounded"></div>
            <div className="h-16 bg-green-500/20 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (shortView) {
    return (
      <>
        <p className="text-muted-foreground font-mono font-medium text-xs">
          [{t("common.total_apy")}]
        </p>
        <p className="font-mono font-bold text-lg text-green-600 dark:text-green-400 mt-1">
          {combinedApyData.totalApy.toFixed(2)}%
        </p>
      </>
    );
  }

  /* Combined APY Information */
  return (
    <div className="bg-gradient-to-r from-green-500/10 to-green-500/5 border border-green-500/30 rounded-lg p-4">
      <h4 className="font-mono font-bold text-sm uppercase tracking-wider mb-3 text-green-600 dark:text-green-400">
        [{t("common.expected_returns")}]
      </h4>

      {/* Total APY Display */}
      <div className="mb-4 p-3 bg-gradient-to-r from-green-600/20 to-green-500/10 border border-green-500/40 rounded">
        <div className="text-center">
          <p className="text-muted-foreground font-mono text-xs">
            {t("common.total_apy")}:
          </p>
          <p className="font-mono font-bold text-green-600 dark:text-green-400 text-2xl">
            {combinedApyData.totalApy.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* APY Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="bg-background/40 border border-green-500/20 rounded p-3">
          <p className="text-muted-foreground font-mono text-xs">
            {t("common.base_apy")} ({t("common.trading_fees")}):
          </p>
          <p className="font-mono font-bold text-blue-600 dark:text-blue-400 text-lg">
            {combinedApyData.baseApy.toFixed(2)}%
          </p>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            {combinedApyData.breakdown.tradingFees.swapFee / 100}% fee
          </p>
        </div>
        <div className="bg-background/40 border border-green-500/20 rounded p-3">
          <p className="text-muted-foreground font-mono text-xs">
            {t("common.farm_apy")} ({t("common.incentives")}):
          </p>
          <p className="font-mono font-bold text-green-600 dark:text-green-400 text-lg">
            {combinedApyData.farmApy.toFixed(2)}%
          </p>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            {combinedApyData.breakdown.farmIncentives.rewardSymbol} rewards
          </p>
        </div>
      </div>

      <div className="mt-3 p-2 bg-background/30 border border-green-500/20 rounded">
        <p className="text-xs font-mono text-muted-foreground">
          <span className="text-green-600 dark:text-green-400">ℹ</span>{" "}
          {t("common.combined_apy_note")}
        </p>
      </div>
    </div>
  );
}
