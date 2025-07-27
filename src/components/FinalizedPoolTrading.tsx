import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatEther } from "viem";
import { useAccount } from "wagmi";

import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CookbookSwapTile } from "@/components/CookbookSwapTile";
import { PoolOverview } from "@/components/PoolOverview";
import { TokenImage } from "@/components/TokenImage";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ZCurveClaim } from "@/components/ZCurveClaim";
import PoolPriceChart from "@/components/PoolPriceChart";
import { useETHPrice } from "@/hooks/use-eth-price";

import type { TokenMeta } from "@/lib/coins";
import { useZCurveSale, useZCurveSaleSummary, useZCurveBalance } from "@/hooks/use-zcurve-sale";
import { computeZCurvePoolId } from "@/lib/zCurvePoolId";
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
  
  // Calculate pool ID with hardcoded 30 bps for curve launched pools
  const poolId = useMemo(() => {
    if (providedPoolId) return providedPoolId;
    // Use 30 bps (0.3% fee) for all curve launched pools
    return computeZCurvePoolId(BigInt(coinId), 30n);
  }, [providedPoolId, coinId]);

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

  const { data: ethPrice } = useETHPrice();

  return (
    <div className="container mx-auto max-w-2xl px-2 sm:px-4 py-4 sm:py-8">
      {/* Claimable Balance Alert */}
      {hasClaimableBalance && (
        <Alert className="mb-4 sm:mb-6 border-2 border-primary bg-gradient-to-r from-primary/20 to-primary/10 shadow-xl">
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
      {hasClaimableBalance && (
        <div className="mb-4 sm:mb-6">
          <ZCurveClaim coinId={coinId} coinSymbol={coinSymbol} />
        </div>
      )}

      {/* Header with coin info - matching ENS style */}
      <div className="mb-4 sm:mb-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full overflow-hidden">
            <TokenImage token={tokenMeta} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">{tokenMeta.name}</h1>
            <p className="text-muted-foreground">{tokenMeta.symbol}</p>
          </div>
        </div>
      </div>

      {/* Trading Interface - matching ENS style */}
      <div className="bg-card border border-border rounded-lg p-2 sm:p-4 md:p-6 mb-4 sm:mb-6 md:mb-8">
        <Tabs defaultValue="swap" className="w-full">
          <TabsList className="grid grid-cols-3 gap-1 bg-muted/50 p-1 h-auto w-full">
            <TabsTrigger value="swap" className="flex-1 px-2 py-1.5 text-xs sm:text-sm">
              {t("common.swap", "Swap")}
            </TabsTrigger>
            <TabsTrigger value="chart" className="flex-1 px-2 py-1.5 text-xs sm:text-sm">
              {t("common.chart", "Chart")}
            </TabsTrigger>
            <TabsTrigger value="info" className="flex-1 px-2 py-1.5 text-xs sm:text-sm">
              {t("common.info", "Info")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="swap" className="mt-2 sm:mt-4">
            <div className="space-y-2 sm:space-y-4">
              <CookbookSwapTile 
                coinId={coinId}
                coinName={sale?.coin?.name || coinName}
                coinSymbol={sale?.coin?.symbol || coinSymbol}
                coinIcon={sale?.coin?.imageUrl || coinIcon}
                poolId={poolId}
                userBalance={saleSummary?.userBalance ? BigInt(saleSummary.userBalance) : undefined}
                feeOrHook={30n} // Hardcode to 30 bps for curve launched pools
              />

              {/* Market Stats - below swap like ENS */}
              {poolMetrics && (
                <div className="mt-4 sm:mt-6 grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 text-xs">
                  <div className="text-center">
                    <p className="text-muted-foreground opacity-70">{t("coin.price")}</p>
                    <p className="font-medium">{formatNumber(parseFloat(poolMetrics.tokenPriceETH), 6)} ETH</p>
                    {ethPrice?.priceUSD && (
                      <p className="text-muted-foreground opacity-60">
                        ${formatNumber(parseFloat(poolMetrics.tokenPriceETH) * ethPrice.priceUSD, 2)}
                      </p>
                    )}
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground opacity-70">{t("coin.market_cap")}</p>
                    <p className="font-medium">{formatNumber(parseFloat(poolMetrics.marketCapETH), 2)} ETH</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground opacity-70">{t("coin.pool_eth")}</p>
                    <p className="font-medium">{formatNumber(parseFloat(poolMetrics.ethReserve), 4)} ETH</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground opacity-70">{t("coin.pool_tokens", "Pool Tokens")}</p>
                    <p className="font-medium">{formatNumber(parseFloat(poolMetrics.tokenReserve), 0)} {tokenMeta.symbol}</p>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="chart" className="mt-2 sm:mt-4">
            <div className="h-64 sm:h-96">
              <PoolPriceChart 
                poolId={poolId || ""}
                ticker={coinSymbol}
                ethUsdPrice={ethPrice?.priceUSD}
              />
            </div>
          </TabsContent>

          <TabsContent value="info" className="mt-2 sm:mt-4">
            <div className="space-y-4">
              <PoolOverview poolId={poolId || ""} coinId={coinId} symbol={coinSymbol} />
              
              {/* Token Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">{t("coin.total_supply")}</p>
                  <p className="font-medium">{formatNumber(parseFloat(poolMetrics?.totalSupply || "0"), 0)} {coinSymbol}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("coin.pool_fee")}</p>
                  <p className="font-medium">0.3%</p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}