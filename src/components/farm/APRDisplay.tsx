import { useCombinedApr } from "@/hooks/use-combined-apr";
import type { IncentiveStream } from "@/hooks/use-incentive-streams";
import { TokenMeta } from "@/lib/coins";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { parseEther } from "viem";
import { useZChefPool } from "@/hooks/use-zchef-contract";

interface APRDisplayProps {
  stream: IncentiveStream;
  lpToken: TokenMeta;
  shortView?: boolean;
}

export function APRDisplay({ stream, lpToken, shortView = true }: APRDisplayProps) {
  const { t } = useTranslation();
  const [showFarmApr, setShowFarmApr] = useState(false);

  // Get real-time pool data
  const { data: poolData } = useZChefPool(stream.chefId);
  const totalStaked = poolData?.[7] ?? stream.totalShares ?? 0n;

  // Calculate combined APR (base + farm incentives)
  const combinedAprData = useCombinedApr({
    stream,
    lpToken,
    enabled: true, // Only fetch when dialog is open
  });

  // Determine if farm is uninitialized (less than 0.1 ETH worth of LP tokens staked)
  const isUninitializedFarm = totalStaked < parseEther("0.1");

  // For uninitialized farms, show only base APR unless user clicks to reveal
  const shouldHideFarmApr = isUninitializedFarm && !showFarmApr;
  const displayTotalApr = shouldHideFarmApr ? combinedAprData.baseApr : combinedAprData.totalApr;

  if (combinedAprData.isLoading === true) {
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
          [{shouldHideFarmApr ? t("common.base_apr") : t("common.total_apr")}]
        </p>
        <div className="flex items-center gap-2">
          <p className="font-mono font-bold text-sm text-green-600 mt-1">{displayTotalApr.toFixed(2)}%</p>
          {shouldHideFarmApr && (
            <button
              onClick={() => setShowFarmApr(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer underline"
              title="Click to show farm APR"
            >
              +farm
            </button>
          )}
        </div>
      </>
    );
  }

  /* Combined APR Information */
  return (
    <div className="border border-muted p-3">
      <h4 className="font-mono text-xs uppercase tracking-wider mb-2 text-muted-foreground">
        [{t("common.expected_returns")}]
      </h4>

      {/* Total APR Display */}
      <div className="mb-3 p-2 border border-muted">
        <div className="text-center">
          <p className="text-muted-foreground font-mono text-xs">
            {shouldHideFarmApr ? t("common.base_apr") : t("common.total_apr")}:
          </p>
          <div className="flex items-center justify-center gap-2">
            <p className="font-mono font-bold text-green-600 text-lg">{displayTotalApr.toFixed(2)}%</p>
            {shouldHideFarmApr && (
              <button
                onClick={() => setShowFarmApr(true)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer underline"
                title="Click to show farm APR"
              >
                +farm
              </button>
            )}
          </div>
        </div>
      </div>

      {/* APR Breakdown */}
      <div className={`grid gap-2 mb-3 ${shouldHideFarmApr ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
        <div className="border border-muted p-2">
          <p className="text-muted-foreground font-mono text-xs">
            {t("common.base_apr")} ({t("common.trading_fees")}):
          </p>
          <p className="font-mono font-bold text-foreground text-sm">{combinedAprData.baseApr.toFixed(2)}%</p>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            {combinedAprData.breakdown.tradingFees / 100}% fee
          </p>
        </div>

        {shouldHideFarmApr ? (
          <div className="border border-muted p-2 bg-muted/20">
            <p className="text-muted-foreground font-mono text-xs">
              {t("common.farm_apr")} ({t("common.incentives")}):
            </p>
            <button
              onClick={() => setShowFarmApr(true)}
              className="font-mono font-bold text-foreground text-sm hover:text-primary transition-colors underline"
            >
              Click to show
            </button>
            <p className="text-xs text-muted-foreground font-mono mt-1">Hidden for uninitialized farms</p>
          </div>
        ) : (
          <div className="border border-muted p-2">
            <p className="text-muted-foreground font-mono text-xs">
              {t("common.farm_apr")} ({t("common.incentives")}):
            </p>
            <p className="font-mono font-bold text-foreground text-sm">{combinedAprData.farmApr.toFixed(2)}%</p>
            <p className="text-xs text-muted-foreground font-mono mt-1">
              {combinedAprData.breakdown.rewardSymbol} rewards
            </p>
          </div>
        )}
      </div>

      <div className="p-2 border border-muted">
        <p className="text-xs font-mono text-muted-foreground">
          <span className="text-foreground">i</span>{" "}
          {shouldHideFarmApr
            ? "Farm APR is hidden for uninitialized farms to avoid misleading figures. Click to reveal actual calculations."
            : t("common.combined_apr_note")}
        </p>
      </div>
    </div>
  );
}
