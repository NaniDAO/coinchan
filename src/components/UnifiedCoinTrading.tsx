import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { ZCurveTrading } from "@/components/ZCurveTrading";
import { ZCurveClaim } from "@/components/ZCurveClaim";
import { BuySellCookbookCoin } from "@/components/BuySellCookbookCoin";
import { ZCurveSaleProgress } from "@/components/ZCurveSaleProgress";
import { ZCurveLiveChart } from "@/components/ZCurveLiveChart";
import { ZCurveReserves } from "@/components/ZCurveReserves";

import { useZCurveSale, useZCurveFinalization } from "@/hooks/use-zcurve-sale";
import { getExpectedPoolId } from "@/lib/zCurvePoolId";

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

  const { data: sale, isLoading: saleLoading } = useZCurveSale(coinId);
  const { data: finalization } = useZCurveFinalization(coinId);

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
  const { isZCurveActive, isFinalized, hasPool, deadline, isExpired } = useMemo(() => {
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

  return (
    <div className="space-y-4">
      {/* Sale Status Banner with Landing Style */}
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
                    {t("trade.sale_finalized", "Sale Finalized")}
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
              <Badge variant={isZCurveActive ? "default" : isFinalized ? "secondary" : "outline"}>{sale.status}</Badge>
            </div>
            {isZCurveActive && deadline && (
              <CardDescription>
                {t("trade.ends_in", "Ends in")} {formatTimeRemaining(deadline)}
              </CardDescription>
            )}
          </CardHeader>

          {/* Sale Progress */}
          {isZCurveActive && <ZCurveSaleProgress sale={sale} />}
        </Card>
      )}

      {/* Claim Section (if applicable) */}
      <ZCurveClaim coinId={coinId} coinSymbol={coinSymbol} />

      {/* Live Chart - only show during active sale */}
      {isZCurveActive && sale && (
        <Card className="border-2 border-border bg-background hover:shadow-lg transition-all duration-200">
          <CardContent className="pt-6">
            <ZCurveLiveChart sale={sale} />
          </CardContent>
        </Card>
      )}

      {/* Trading Interface with Landing Style */}
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

      {/* Curve Reserves - only show during active sale */}
      {isZCurveActive && sale && <ZCurveReserves sale={sale} />}

      {/* Trading Info with ASCII Style */}
      {isZCurveActive && (
        <Card className="border-2 border-border bg-background hover:shadow-md transition-all duration-200">
          <CardHeader>
            <CardTitle className="text-base font-bold">{t("trade.how_it_works", "How It Works")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• {t("trade.zcurve_info_1", "Tokens are traded on a bonding curve during the sale")}</p>
            <p>• {t("trade.zcurve_info_2", "Price increases as more tokens are sold")}</p>
            <p>• {t("trade.zcurve_info_3", "You can buy and sell at any time during the sale")}</p>
            <p>• {t("trade.zcurve_info_4", "After finalization, liquidity moves to an AMM pool")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
