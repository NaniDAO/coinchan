import { useCombinedApy } from "@/hooks/use-combined-apy";
import type { IncentiveStream } from "@/hooks/use-incentive-streams";
import { TokenMeta } from "@/lib/coins";
import { useTranslation } from "react-i18next";

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
  // Calculate combined APY (base + farm incentives)
  const combinedApyData = useCombinedApy({
    stream,
    lpToken,
    enabled: true, // Only fetch when dialog is open
  });

  if (combinedApyData.isLoading === true) {
    return (
      <div className="border border-muted p-3">
        <div className="animate-pulse">
          <div className="h-3 bg-muted mb-2"></div>
          <div className="h-6 bg-muted mb-2"></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="h-12 bg-muted"></div>
            <div className="h-12 bg-muted"></div>
          </div>
        </div>
      </div>
    );
  }

  if (shortView) {
    return (
      <>
        <p className="text-muted-foreground font-mono text-xs">
          [{t("common.total_apy")}]
        </p>
        <p className="font-mono font-bold text-sm text-green-600 mt-1">
          {combinedApyData.totalApy.toFixed(2)}%
        </p>
      </>
    );
  }

  /* Combined APY Information */
  return (
    <div className="border border-muted p-3">
      <h4 className="font-mono text-xs uppercase tracking-wider mb-2 text-muted-foreground">
        [{t("common.expected_returns")}]
      </h4>

      {/* Total APY Display */}
      <div className="mb-3 p-2 border border-muted">
        <div className="text-center">
          <p className="text-muted-foreground font-mono text-xs">
            {t("common.total_apy")}:
          </p>
          <p className="font-mono font-bold text-green-600 text-lg">
            {combinedApyData.totalApy.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* APY Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        <div className="border border-muted p-2">
          <p className="text-muted-foreground font-mono text-xs">
            {t("common.base_apy")} ({t("common.trading_fees")}):
          </p>
          <p className="font-mono font-bold text-foreground text-sm">
            {combinedApyData.baseApy.toFixed(2)}%
          </p>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            {combinedApyData.breakdown.tradingFees / 100}% fee
          </p>
        </div>
        <div className="border border-muted p-2">
          <p className="text-muted-foreground font-mono text-xs">
            {t("common.farm_apy")} ({t("common.incentives")}):
          </p>
          <p className="font-mono font-bold text-foreground text-sm">
            {combinedApyData.farmApy.toFixed(2)}%
          </p>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            {combinedApyData.breakdown.rewardSymbol} rewards
          </p>
        </div>
      </div>

      <div className="p-2 border border-muted">
        <p className="text-xs font-mono text-muted-foreground">
          <span className="text-foreground">i</span>{" "}
          {t("common.combined_apy_note")}
        </p>
      </div>
    </div>
  );
}
