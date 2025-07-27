import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { ZCurveBuy } from "@/components/ZCurveBuy";
import { ZCurveSell } from "@/components/ZCurveSell";
import { ZCurveClaim } from "@/components/ZCurveClaim";
import { BuyCookbook } from "@/components/BuyCookbook";
import { SellCookbook } from "@/components/SellCookbook";
import { ZCurveSaleProgress } from "@/components/ZCurveSaleProgress";

import { useZCurveSale, useZCurveFinalization } from "@/hooks/use-zcurve-sale";
import { formatDistanceToNow } from "date-fns";

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
  poolId 
}: UnifiedCoinTradingProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy");
  
  const { data: sale, isLoading: saleLoading } = useZCurveSale(coinId);
  const { data: finalization } = useZCurveFinalization(coinId);
  
  // Determine trading mode
  const isZCurveActive = sale && sale.status === "ACTIVE";
  const isFinalized = sale?.status === "FINALIZED" || !!finalization;
  const hasPool = isFinalized && poolId;
  
  // Calculate sale deadline
  const deadline = sale ? new Date(Number(sale.deadline) * 1000) : null;
  const isExpired = deadline && deadline < new Date();
  
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
      {/* Sale Status Banner */}
      {sale && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {isZCurveActive ? (
                  <>
                    <span className="mr-2">🚀</span>
                    {t("trade.zcurve_sale_active", "zCurve Sale Active")}
                  </>
                ) : isFinalized ? (
                  <>
                    <span className="mr-2">✅</span>
                    {t("trade.sale_finalized", "Sale Finalized")}
                  </>
                ) : (
                  <>
                    <span className="mr-2">⏰</span>
                    {t("trade.sale_expired", "Sale Expired")}
                  </>
                )}
              </CardTitle>
              <Badge variant={isZCurveActive ? "default" : isFinalized ? "secondary" : "outline"}>
                {sale.status}
              </Badge>
            </div>
            {isZCurveActive && deadline && (
              <CardDescription>
                {t("trade.ends_in", "Ends in")} {formatDistanceToNow(deadline)}
              </CardDescription>
            )}
          </CardHeader>
          
          {/* Sale Progress */}
          {isZCurveActive && <ZCurveSaleProgress sale={sale} />}
        </Card>
      )}
      
      {/* Claim Section (if applicable) */}
      <ZCurveClaim coinId={coinId} coinSymbol={coinSymbol} />
      
      {/* Trading Interface */}
      <Card>
        <CardHeader>
          <CardTitle>
            {isZCurveActive 
              ? t("trade.trade_on_curve", "Trade on Curve")
              : t("trade.trade", "Trade")}
          </CardTitle>
          {isZCurveActive && (
            <CardDescription>
              {t("trade.zcurve_description", "Buy and sell tokens on the bonding curve during the sale period")}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "buy" | "sell")}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="buy">{t("trade.buy", "Buy")}</TabsTrigger>
              <TabsTrigger value="sell">{t("trade.sell", "Sell")}</TabsTrigger>
            </TabsList>
            
            <TabsContent value="buy" className="mt-4">
              {isZCurveActive ? (
                <ZCurveBuy 
                  coinId={coinId}
                  coinName={coinName}
                  coinSymbol={coinSymbol}
                  coinIcon={coinIcon}
                />
              ) : hasPool ? (
                <BuyCookbook 
                  poolId={poolId}
                  tokenName={coinName}
                  tokenSymbol={coinSymbol}
                  tokenIcon={coinIcon}
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
            </TabsContent>
            
            <TabsContent value="sell" className="mt-4">
              {isZCurveActive ? (
                <ZCurveSell
                  coinId={coinId}
                  coinName={coinName}
                  coinSymbol={coinSymbol}
                  coinIcon={coinIcon}
                />
              ) : hasPool ? (
                <SellCookbook
                  poolId={poolId}
                  tokenName={coinName}
                  tokenSymbol={coinSymbol}
                  tokenIcon={coinIcon}
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
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      {/* Trading Info */}
      {isZCurveActive && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("trade.how_it_works", "How It Works")}</CardTitle>
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