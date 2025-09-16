import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { ZCurveTrading } from "@/components/ZCurveTrading";
import { ZCurveClaim } from "@/components/ZCurveClaim";
import { BuySellCookbookCoin } from "@/components/BuySellCookbookCoin";
import { BuyCoinSale } from "@/components/BuyCoinSale";
import { ZCurveSaleProgress } from "@/components/ZCurveSaleProgress";
import { ZCurvePriceChart } from "@/components/ZCurvePriceChart";
import { ZCurveReserves } from "@/components/ZCurveReserves";
import { FinalizedPoolTrading } from "@/components/FinalizedPoolTrading";
import { ZCurveActivity } from "@/components/ZCurveActivity";
import { CreatorDisplay } from "@/components/CreatorDisplay";
import { CoinImagePopup } from "@/components/CoinImagePopup";

import { useZCurveSale, useZCurveFinalization } from "@/hooks/use-zcurve-sale";
import { useCoinSale } from "@/hooks/use-coin-sale";
import { getExpectedPoolId } from "@/lib/zCurvePoolId";
import { useETHPrice } from "@/hooks/use-eth-price";
import { CandlestickChartIcon, LineChartIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChartPreviewData {
  amount: bigint;
  isBuying: boolean;
}

interface UnifiedCoinTradingProps {
  coinId: string;
  coinName?: string;
  coinSymbol?: string;
  coinIcon?: string;
  poolId?: string; // For AMM trading after finalization
}

const PoolPriceChart = lazy(() => import("@/components/PoolPriceChart"));
const PoolCandleChart = lazy(() => import("@/PoolCandleChart"));

export function UnifiedCoinTrading({ coinId, coinName, coinSymbol, coinIcon, poolId }: UnifiedCoinTradingProps) {
  const { t } = useTranslation();
  const [chartPreview, setChartPreview] = useState<ChartPreviewData | null>(null);
  const { data: ethPrice } = useETHPrice();
  const [chartType, setChartType] = useState<"line" | "candle">("line");

  const { data: sale, isLoading: saleLoading, refetch: refetchSale } = useZCurveSale(coinId);
  const { data: finalization } = useZCurveFinalization(coinId);

  // Check for ZAMMLaunch sale
  const { data: zammLaunchSale, isLoading: zammLoading } = useCoinSale({
    coinId: coinId,
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
  const { isZCurveActive, isZAMMLaunchActive, isFinalized, hasPool, computedPoolId, deadline, isExpired } =
    useMemo(() => {
      const active = sale && sale.status === "ACTIVE";
      const finalized = sale?.status === "FINALIZED" || !!finalization;

      // Check if ZAMMLaunch sale is active
      const zammActive = zammLaunchSale && zammLaunchSale.status === "ACTIVE";

      // Calculate expected pool ID from sale parameters
      const expectedPoolId = sale ? getExpectedPoolId(sale) : null;
      const poolIdValue = poolId || expectedPoolId;
      // For regular cookbook coins without sales, just check if they have a poolId
      const hasPoolValue =
        (finalized && poolIdValue && poolIdValue !== "0") ||
        (!sale && !zammActive && poolIdValue && poolIdValue !== "0");

      // Calculate sale deadline
      const deadlineDate = sale ? new Date(Number(sale.deadline) * 1000) : null;
      const expired = deadlineDate && deadlineDate < new Date();

      return {
        isZCurveActive: active,
        isZAMMLaunchActive: zammActive,
        isFinalized: finalized,
        hasPool: hasPoolValue,
        computedPoolId: poolIdValue,
        deadline: deadlineDate,
        isExpired: expired,
      };
    }, [sale, finalization, poolId, zammLaunchSale]);

  // Handle chart type change with stability
  const handleChartTypeChange = useCallback((type: "line" | "candle") => {
    setChartType(type);
  }, []);

  if (saleLoading || zammLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">{t("common.loading", "Loading...")}</div>
        </CardContent>
      </Card>
    );
  }

  // For finalized sales with pools OR regular cookbook coins with pools, use the clean trading layout
  if ((isFinalized && hasPool) || (!sale && !zammLaunchSale && hasPool)) {
    return (
      <FinalizedPoolTrading
        coinId={coinId}
        coinName={coinName}
        coinSymbol={coinSymbol}
        coinIcon={coinIcon}
        poolId={computedPoolId || undefined}
      />
    );
  }

  return (
    <div className="w-full">
      <div className="space-y-6">
        {/* Claim Section (if applicable) */}
        {sale?.status === "FINALIZED" && <ZCurveClaim coinId={coinId} coinSymbol={coinSymbol} />}

        {/* Desktop: Side by side, Mobile: Stacked */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Chart Section - Takes more space on desktop */}
          {sale && (
            <div className="lg:col-span-7 flex flex-col gap-8">
              <Card className="border-2 border-border bg-background hover:shadow-lg transition-all duration-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between mb-3">
                    {/* Coin Image */}
                    {(coinIcon || sale?.coin?.imageUrl) && (
                      <CoinImagePopup
                        imageUrl={coinIcon || sale?.coin?.imageUrl || null}
                        coinName={coinName || sale?.coin?.name || "Token"}
                        coinSymbol={coinSymbol || sale?.coin?.symbol}
                        size="md"
                        className="border-2 border-border"
                      />
                    )}
                    <Badge variant={isZCurveActive ? "default" : isFinalized ? "secondary" : "outline"}>
                      {isFinalized ? "AMM" : sale.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-bold">
                      {isZCurveActive ? (
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full bg-green-500"
                            style={{
                              boxShadow: "0 0 8px rgba(34, 197, 94, 0.4)",
                            }}
                          />
                          {t("trade.zcurve_sale_active", "zCurve Sale Active")}
                        </div>
                      ) : isFinalized ? (
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full bg-blue-500"
                            style={{
                              boxShadow: "0 0 8px rgba(59, 130, 246, 0.4)",
                            }}
                          />
                          {t("trade.amm_trading_active", "AMM Trading Active")}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full bg-amber-500"
                            style={{
                              boxShadow: "0 0 8px rgba(245, 158, 11, 0.4)",
                            }}
                          />
                          {t("trade.sale_expired", "Sale Expired")}
                        </div>
                      )}
                    </CardTitle>
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
                  {/* Creator display for zCurve sales */}
                  {sale?.creator && (
                    <div className="mt-2">
                      <CreatorDisplay address={sale.creator} size="sm" className="text-xs" showLabel={true} />
                    </div>
                  )}
                </CardHeader>

                {sale && <ZCurveSaleProgress sale={sale} />}
              </Card>
              <Card className="border-2 border-border bg-background hover:shadow-lg transition-all duration-200 h-fit">
                <CardContent className="pt-6">
                  <ZCurvePriceChart
                    sale={sale}
                    previewAmount={chartPreview?.amount}
                    isBuying={chartPreview?.isBuying}
                  />
                </CardContent>
              </Card>
            </div>
          )}

          {/* Trading Section */}
          <div className={`space-y-4 ${sale ? "lg:col-span-5" : "lg:col-span-12"}`}>
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
                  <ZCurveTrading
                    coinId={coinId}
                    coinName={coinName}
                    coinSymbol={coinSymbol}
                    coinIcon={coinIcon}
                    onPreviewChange={setChartPreview}
                    onTransactionSuccess={refetchSale}
                  />
                ) : isZAMMLaunchActive ? (
                  <BuyCoinSale
                    coinId={BigInt(coinId)}
                    symbol={coinSymbol}
                    onPriceImpactChange={() => {}} // ZAMMLaunch doesn't have price impact
                  />
                ) : hasPool ? (
                  <BuySellCookbookCoin
                    coinId={BigInt(coinId)}
                    symbol={coinSymbol}
                    hideZAMMLaunchClaim={isFinalized} // Hide for zCurve graduated coins
                  />
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
                      <p>• {t("trade.zcurve_info_1", "Tokens are traded on a bonding curve during sale")}</p>
                      <p>• {t("trade.zcurve_info_3", "You can buy and sell at any time during sale")}</p>
                      <p>• {t("trade.zcurve_info_4", "After finalization, liquidity moves to AMM pool")}</p>
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

        {/* Activity and Price Chart Section - Side by side for active zCurve */}
        {isZCurveActive && sale && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-8">
            {/* Price Chart */}
            <Card className="border-2 border-border bg-background">
              <CardHeader>
                <CardTitle className="text-lg font-bold">{t("trade.price_chart", "Price Chart")}</CardTitle>
                <CardDescription>{t("trade.price_chart_desc", "Historical price movement and volume")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div>Loading...</div>}>
                  {/* <ZCurvePriceChart
                  coinId={coinId}
                  coinSymbol={coinSymbol}
                  currentBondingPrice={saleSummary?.currentPrice || sale?.currentPrice}
                  isActiveSale={sale?.status === "ACTIVE"}
                /> */}

                  {computedPoolId && chartType === "line" && (
                    <PoolPriceChart
                      poolId={computedPoolId}
                      // poolId={computedPoolId(coinId, 30n, CookbookAddress)}
                      ticker={coinSymbol}
                      ethUsdPrice={ethPrice?.priceUSD}
                    />
                  )}
                  {computedPoolId && chartType === "candle" && (
                    <PoolCandleChart
                      poolId={computedPoolId}
                      interval="1h"
                      ticker={coinSymbol}
                      ethUsdPrice={ethPrice?.priceUSD}
                    />
                  )}
                  <div className="w-fit border border-border flex flex-row items-center mt-2">
                    <button
                      onClick={() => handleChartTypeChange("candle")}
                      className={cn(
                        "h-8 px-2 sm:px-3 flex items-center justify-center transition-all",
                        chartType === "candle"
                          ? "bg-primary !text-primary-foreground"
                          : "bg-transparent hover:bg-muted",
                      )}
                    >
                      <CandlestickChartIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleChartTypeChange("line")}
                      className={cn(
                        "h-8 px-2 sm:px-3 flex items-center justify-center transition-all",
                        chartType === "line" ? "bg-primary !text-primary-foreground" : "bg-transparent hover:bg-muted",
                      )}
                    >
                      <LineChartIcon className="h-4 w-4" />
                    </button>
                  </div>
                </Suspense>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="border-2 border-border bg-background">
              <CardHeader>
                <CardTitle className="text-lg font-bold">{t("trade.recent_activity", "Recent Activity")}</CardTitle>
                <CardDescription>{t("trade.activity_desc", "Latest buy and sell transactions")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ZCurveActivity coinId={coinId} coinSymbol={coinSymbol} />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
