import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatEther } from "viem";
import { useAccount } from "wagmi";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CookbookSwapTile } from "@/components/CookbookSwapTile";
import { PoolOverview } from "@/components/PoolOverview";
import { TokenImage } from "@/components/TokenImage";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ZCurveClaim } from "@/components/ZCurveClaim";

import type { TokenMeta } from "@/lib/coins";
import { useZCurveSale, useZCurveSaleSummary, useZCurveBalance } from "@/hooks/use-zcurve-sale";
import { getExpectedPoolId } from "@/lib/zCurvePoolId";
import { useReserves } from "@/hooks/use-reserves";
import { formatNumber } from "@/lib/utils";

interface FinalizedPoolTradingProps {
  coinId: string;
  coinName?: string;
  coinSymbol?: string;
  coinIcon?: string;
  poolId?: string;
}

export function FinalizedPoolTrading({
  coinId,
  coinName = "Token",
  coinSymbol = "TOKEN",
  coinIcon,
  poolId: providedPoolId,
}: FinalizedPoolTradingProps) {
  const { t } = useTranslation();
  const { address } = useAccount();
  
  // Fetch sale and user data
  const { data: sale } = useZCurveSale(coinId);
  const { data: saleSummary } = useZCurveSaleSummary(coinId, address);
  const { data: userBalance } = useZCurveBalance(coinId, address);
  
  // Calculate pool ID
  const poolId = useMemo(() => {
    if (providedPoolId) return providedPoolId;
    if (sale) return getExpectedPoolId(sale);
    return null;
  }, [providedPoolId, sale]);

  // Fetch pool reserves
  const { data: reserves } = useReserves({
    poolId: poolId || "",
    source: "COOKBOOK" as const,
    enabled: !!poolId,
  } as any);

  // Create token metadata
  const tokenMeta = useMemo<TokenMeta>(() => ({
    id: BigInt(coinId),
    symbol: coinSymbol || sale?.coin?.symbol || "TOKEN",
    name: coinName || sale?.coin?.name || "Token",
    decimals: 18,
    image: coinIcon || sale?.coin?.imageUrl || "",
    balance: saleSummary?.userBalance ? BigInt(saleSummary.userBalance) : 0n,
    reserve0: reserves?.reserve0 || 0n,
    reserve1: reserves?.reserve1 || 0n,
    source: "COOKBOOK" as const,
  }), [coinId, coinSymbol, coinName, sale, coinIcon, saleSummary, reserves]);

  // Calculate pool metrics
  const poolMetrics = useMemo(() => {
    if (!reserves || !sale) return null;
    
    const ethReserve = reserves.reserve0;
    const tokenReserve = reserves.reserve1;
    const totalSupply = sale.coin?.totalSupply ? BigInt(sale.coin.totalSupply) : 0n;
    
    // Calculate market cap in ETH
    const marketCapETH = totalSupply > 0n && tokenReserve > 0n && ethReserve > 0n
      ? (totalSupply * ethReserve) / tokenReserve
      : 0n;
    
    // Calculate token price in ETH
    const tokenPriceETH = tokenReserve > 0n ? (ethReserve * 10n ** 18n) / tokenReserve : 0n;
    
    return {
      ethReserve: formatEther(ethReserve),
      tokenReserve: formatEther(tokenReserve),
      marketCapETH: formatEther(marketCapETH),
      tokenPriceETH: formatEther(tokenPriceETH),
      totalSupply: formatEther(totalSupply),
    };
  }, [reserves, sale]);

  // Check if user has claimable balance
  const balance = saleSummary?.userBalance ? BigInt(saleSummary.userBalance) : userBalance ? BigInt(userBalance.balance) : 0n;
  const hasClaimableBalance = balance > 0n;

  if (!poolId) {
    return (
      <Card>
        <CardContent className="py-8">
          <Alert>
            <AlertDescription>
              {t("trade.pool_not_found", "Pool not found")}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Claimable Balance Alert */}
      {hasClaimableBalance && (
        <Alert className="border-2 border-primary bg-gradient-to-r from-primary/20 to-primary/10 shadow-xl">
          <AlertTitle className="text-lg font-bold flex items-center gap-2">
            <span className="text-2xl animate-bounce">💰</span>
            {t("claim.alert_title", "You have tokens to claim!")}
          </AlertTitle>
          <AlertDescription className="text-base mt-2">
            {t("claim.alert_description", "The sale has finalized and you have tokens ready to claim. See below to claim them.")}
          </AlertDescription>
        </Alert>
      )}

      {/* Claim Section */}
      <ZCurveClaim coinId={coinId} coinSymbol={coinSymbol} />

      {/* Header with coin info */}
      <Card className="border-2 border-border bg-gradient-to-br from-background to-muted/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full ring-4 ring-primary/10 overflow-hidden">
                  <TokenImage token={tokenMeta} />
                </div>
                <Badge className="absolute -bottom-1 -right-1 text-xs">AMM</Badge>
              </div>
              <div>
                <CardTitle className="text-2xl flex items-center gap-2">
                  {tokenMeta.name}
                  <span className="text-muted-foreground">({tokenMeta.symbol})</span>
                </CardTitle>
                <CardDescription className="text-base">
                  {t("trade.cookbook_amm_pool", "Cookbook AMM Pool")}
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        
        {/* Pool metrics */}
        {poolMetrics && (
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t("pool.price_per_token", "Price")}</p>
                <p className="text-lg font-mono font-bold">
                  {formatNumber(parseFloat(poolMetrics.tokenPriceETH), 8)} ETH
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t("pool.market_cap", "Market Cap")}</p>
                <p className="text-lg font-mono font-bold">
                  {formatNumber(parseFloat(poolMetrics.marketCapETH), 2)} ETH
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t("pool.eth_reserve", "ETH Reserve")}</p>
                <p className="text-lg font-mono font-bold">
                  {formatNumber(parseFloat(poolMetrics.ethReserve), 4)} ETH
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t("pool.token_reserve", "Token Reserve")}</p>
                <p className="text-lg font-mono font-bold">
                  {formatNumber(parseFloat(poolMetrics.tokenReserve), 0)} {tokenMeta.symbol}
                </p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Main content with tabs */}
      <Tabs defaultValue="trade" className="w-full">
        <TabsList className="grid grid-cols-2 w-full max-w-md mx-auto">
          <TabsTrigger value="trade">{t("common.trade", "Trade")}</TabsTrigger>
          <TabsTrigger value="analytics">{t("common.analytics", "Analytics")}</TabsTrigger>
        </TabsList>
        
        <TabsContent value="trade" className="mt-6">
          <div className="max-w-md mx-auto">
            <Card className="border-2 border-border bg-background">
              <CardContent className="pt-6">
                <CookbookSwapTile 
                  coinId={coinId}
                  coinName={coinName}
                  coinSymbol={coinSymbol}
                  coinIcon={coinIcon}
                  poolId={poolId}
                  userBalance={saleSummary?.userBalance ? BigInt(saleSummary.userBalance) : undefined}
                  feeOrHook={sale?.feeOrHook}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="analytics" className="mt-6">
          <Card className="border-2 border-border bg-background">
            <CardContent className="pt-6">
              <PoolOverview poolId={poolId} coinId={coinId} symbol={coinSymbol} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}