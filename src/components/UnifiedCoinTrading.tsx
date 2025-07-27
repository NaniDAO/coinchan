import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { ZCurveTrading } from "@/components/ZCurveTrading";
import { ZCurveClaim } from "@/components/ZCurveClaim";
import { BuySellCookbookCoin } from "@/components/BuySellCookbookCoin";
import { ZCurveSaleProgress } from "@/components/ZCurveSaleProgress";
import { ZCurveLiveChart } from "@/components/ZCurveLiveChart";
import { ZCurveReserves } from "@/components/ZCurveReserves";
import { PoolOverview } from "@/components/PoolOverview";

import { useZCurveSale, useZCurveFinalization, useZCurveBalance, useZCurveSaleSummary } from "@/hooks/use-zcurve-sale";
import { getExpectedPoolId } from "@/lib/zCurvePoolId";
import { useAccount } from "wagmi";

interface UnifiedCoinTradingProps {
  coinId: string;
  coinName?: string;
  coinSymbol?: string;
  coinIcon?: string;
  poolId?: string; // For AMM trading after finalization
}

export function UnifiedCoinTrading({
  coinId,
  coinName = "Token",
  coinSymbol = "TOKEN",
  coinIcon,
  poolId,
}: UnifiedCoinTradingProps) {
  const { t } = useTranslation();

  const { data: sale, isLoading: saleLoading, error: saleError } = useZCurveSale(coinId);
  const { data: finalization } = useZCurveFinalization(coinId);
  const { address } = useAccount();
  const { data: saleSummary } = useZCurveSaleSummary(coinId, address);
  const { data: userBalance } = useZCurveBalance(coinId, address);
  
  console.log("ZCURVESALE:", {
    sale,
    saleLoading,
    saleError,
  });
  // Time formatting utility
  const formatTimeRemaining = useMemo(() => {
    return (deadline: Date): string => {
      const now = new Date();
      const diff = deadline.getTime() - now.getTime();

      if (diff <= 0) return "Expired";

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

      if (days > 0) return `${days}d ${hours}h`;
      if (hours > 0) return `${hours}h`;

      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      return `${minutes}m`;
    };
  }, []);

  // Memoize computed values to prevent unnecessary recalculations
  const { isZCurveActive, isFinalized, hasPool, computedPoolId, deadline, isExpired } = useMemo(() => {
    const active = sale && sale.status === "ACTIVE";
    const finalized = sale?.status === "FINALIZED" || !!finalization;

    // Calculate expected pool ID from sale parameters
    const expectedPoolId = sale ? getExpectedPoolId(sale) : null;
    const poolIdValue = poolId || expectedPoolId;
    const hasPoolValue = finalized && poolIdValue && poolIdValue !== "0";

    // Calculate sale deadline
    const deadlineDate = sale ? new Date(Number(sale.deadline) * 1000) : null;
    const expired = deadlineDate && deadlineDate < new Date();

    return {
      isZCurveActive: active,
      isFinalized: finalized,
      hasPool: hasPoolValue,
      computedPoolId: poolIdValue,
      deadline: deadlineDate,
      isExpired: expired,
    };
  }, [sale, finalization, poolId]);

  if (saleLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">{t("common.loading", "Loading...")}</div>
        </CardContent>
      </Card>
    );
  }

  // Check if user has claimable balance
  const balance = saleSummary?.userBalance ? BigInt(saleSummary.userBalance) : userBalance ? BigInt(userBalance.balance) : 0n;
  const hasClaimableBalance = balance > 0n && (sale?.status === "FINALIZED" || saleSummary?.isFinalized);

  return (
    <div className="w-full">
      <div className="max-w-[1600px] mx-auto px-4 space-y-6">
        {/* Claimable Balance Alert - Most prominent when available */}
      {hasClaimableBalance && (
        <Alert className="border-2 border-primary bg-gradient-to-r from-primary/20 to-primary/10 shadow-xl">
          <AlertTitle className="text-lg font-bold flex items-center gap-2">
            <span className="text-2xl animate-bounce">💰</span>
            {t("claim.alert_title", "You have tokens to claim!")}
          </AlertTitle>
          <AlertDescription className="text-base mt-2">
            {t("claim.alert_description", "The sale has finalized and you have tokens ready to claim. Scroll down to claim them.")}
          </AlertDescription>
        </Alert>
      )}

      {/* Sale Status Banner */}
      {sale && (
        <Card className="border-2 border-border bg-background hover:shadow-lg transition-all duration-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-bold">
                {isZCurveActive ? (
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full bg-green-500"
                      style={{ boxShadow: "0 0 8px rgba(34, 197, 94, 0.4)" }}
                    />
                    {t("trade.zcurve_sale_active", "zCurve Sale Active")}
                  </div>
                ) : isFinalized ? (
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full bg-blue-500"
                      style={{ boxShadow: "0 0 8px rgba(59, 130, 246, 0.4)" }}
                    />
                    {t("trade.amm_trading_active", "AMM Trading Active")}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full bg-amber-500"
                      style={{ boxShadow: "0 0 8px rgba(245, 158, 11, 0.4)" }}
                    />
                    {t("trade.sale_expired", "Sale Expired")}
                  </div>
                )}
              </CardTitle>
              <Badge variant={isZCurveActive ? "default" : isFinalized ? "secondary" : "outline"}>
                {isFinalized ? "AMM" : sale.status}
              </Badge>
            </div>
            {isZCurveActive && deadline && (
              <CardDescription>
                {t("trade.ends_in", "Ends in")} {formatTimeRemaining(deadline)}
              </CardDescription>
            )}
            {isFinalized && hasPool && (
              <CardDescription>
                {t("trade.amm_pool_description", "Trade on Cookbook AMM with instant liquidity")}
              </CardDescription>
            )}
          </CardHeader>

          {/* Sale Progress */}
          {isZCurveActive && <ZCurveSaleProgress sale={sale} />}
        </Card>
      )}

      {/* Claim Section (if applicable) */}
      {sale?.status === "FINALIZED" && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-center">
            {t("claim.section_title", "Token Claim")}
          </h2>
          <ZCurveClaim coinId={coinId} coinSymbol={coinSymbol} />
        </div>
      )}

      {/* Desktop: Side by side, Mobile: Stacked */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Chart Section - Takes more space on desktop */}
        {isZCurveActive && sale && (
          <div className="lg:col-span-7">
            <Card className="border-2 border-border bg-background hover:shadow-lg transition-all duration-200 h-full">
              <CardContent className="pt-6">
                <ZCurveLiveChart sale={sale} />
              </CardContent>
            </Card>
          </div>
        )}
        
        {/* Pool Overview for finalized sales */}
        {isFinalized && hasPool && computedPoolId && (
          <div className="lg:col-span-7">
            <Card className="border-2 border-border bg-background hover:shadow-lg transition-all duration-200 h-full">
              <CardContent className="pt-6">
                <PoolOverview poolId={computedPoolId} coinId={coinId} symbol={coinSymbol} />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Trading Section */}
        <div className={`space-y-4 ${(isZCurveActive && sale) || (isFinalized && hasPool) ? "lg:col-span-5" : "lg:col-span-12"}`}>
          {/* Trading Interface */}
          <Card className="border-2 border-border bg-background hover:shadow-lg transition-all duration-200">
            <CardHeader>
              <CardTitle>
                {isZCurveActive ? t("trade.trade_on_curve", "Trade on Curve") : t("trade.trade", "Trade")}
              </CardTitle>
              {isZCurveActive && (
                <CardDescription>
                  {t("trade.zcurve_description", "Buy and sell tokens on the bonding curve during the sale period")}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {isZCurveActive ? (
                <ZCurveTrading coinId={coinId} coinName={coinName} coinSymbol={coinSymbol} coinIcon={coinIcon} />
              ) : hasPool ? (
                <BuySellCookbookCoin coinId={BigInt(coinId)} symbol={coinSymbol} />
              ) : (
                <Alert>
                  <AlertDescription>
                    {isExpired && !isFinalized
                      ? t("trade.waiting_finalization", "Sale expired. Waiting for finalization...")
                      : t("trade.no_liquidity", "No liquidity available for trading")}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Curve Reserves */}
          {isZCurveActive && sale && <ZCurveReserves sale={sale} />}

          {/* Trading Info */}
          {(isZCurveActive || (isFinalized && hasPool)) && (
            <Card className="border-2 border-border bg-background hover:shadow-md transition-all duration-200">
              <CardHeader>
                <CardTitle className="text-base font-bold">{t("trade.how_it_works", "How It Works")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {isZCurveActive ? (
                  <>
                    <p>• {t("trade.zcurve_info_1", "Tokens are traded on a bonding curve during the sale")}</p>
                    <p>• {t("trade.zcurve_info_3", "You can buy and sell at any time during the sale")}</p>
                    <p>• {t("trade.zcurve_info_4", "After finalization, liquidity moves to an AMM pool")}</p>
                  </>
                ) : (
                  <>
                    <p>• {t("trade.amm_info_1", "Trade with instant liquidity on Cookbook AMM")}</p>
                    <p>• {t("trade.amm_info_2", "Automated market maker ensures constant liquidity")}</p>
                    <p>• {t("trade.amm_info_3", "View charts, holders, and trading activity")}</p>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
