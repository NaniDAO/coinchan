import { useCombinedApy } from "@/hooks/use-combined-apy";
import type { IncentiveStream } from "@/hooks/use-incentive-streams";
import { TokenMeta } from "@/lib/coins";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { parseEther } from "viem";

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
  const [showFarmApy, setShowFarmApy] = useState(false);
  
  // Calculate combined APY (base + farm incentives)
  const combinedApyData = useCombinedApy({
    stream,
    lpToken,
    enabled: true, // Only fetch when dialog is open
  });

  // Determine if farm is uninitialized (less than 0.1 ETH worth of LP tokens staked)
  const isUninitializedFarm = stream.totalShares < parseEther("0.1");
  
  // For uninitialized farms, show only base APY unless user clicks to reveal
  const shouldHideFarmApy = isUninitializedFarm && !showFarmApy;
  const displayTotalApy = shouldHideFarmApy ? combinedApyData.baseApy : combinedApyData.totalApy;

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
          [{shouldHideFarmApy ? t("common.base_apy") : t("common.total_apy")}]
        </p>
        <div className="flex items-center gap-2">
          <p className="font-mono font-bold text-sm text-green-600 mt-1">
            {displayTotalApy.toFixed(2)}%
          </p>
          {shouldHideFarmApy && (
            <button
              onClick={() => setShowFarmApy(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer underline"
              title="Click to show farm APY"
            >
              +farm
            </button>
          )}
        </div>
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
            {shouldHideFarmApy ? t("common.base_apy") : t("common.total_apy")}:
          </p>
          <div className="flex items-center justify-center gap-2">
            <p className="font-mono font-bold text-green-600 text-lg">
              {displayTotalApy.toFixed(2)}%
            </p>
            {shouldHideFarmApy && (
              <button
                onClick={() => setShowFarmApy(true)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer underline"
                title="Click to show farm APY"
              >
                +farm
              </button>
            )}
          </div>
        </div>
      </div>

      {/* APY Breakdown */}
      <div className={`grid gap-2 mb-3 ${shouldHideFarmApy ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
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
        
        {shouldHideFarmApy ? (
          <div className="border border-muted p-2 bg-muted/20">
            <p className="text-muted-foreground font-mono text-xs">
              {t("common.farm_apy")} ({t("common.incentives")}):
            </p>
            <button
              onClick={() => setShowFarmApy(true)}
              className="font-mono font-bold text-foreground text-sm hover:text-primary transition-colors underline"
            >
              Click to show
            </button>
            <p className="text-xs text-muted-foreground font-mono mt-1">
              Hidden for uninitialized farms
            </p>
          </div>
        ) : (
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
        )}
      </div>

      <div className="p-2 border border-muted">
        <p className="text-xs font-mono text-muted-foreground">
          <span className="text-foreground">i</span>{" "}
          {shouldHideFarmApy 
            ? "Farm APY is hidden for uninitialized farms to avoid misleading figures. Click to reveal actual calculations."
            : t("common.combined_apy_note")}
        </p>
      </div>
    </div>
  );
}
