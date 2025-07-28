import { useMemo, useState, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits } from "viem";
import { useAccount } from "wagmi";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CookbookSwapTile } from "@/components/CookbookSwapTile";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ZCurveClaim } from "@/components/ZCurveClaim";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { useETHPrice } from "@/hooks/use-eth-price";
import { ZCurveAddLiquidity } from "@/components/ZCurveAddLiquidity";
import { ZCurveRemoveLiquidity } from "@/components/ZCurveRemoveLiquidity";
import { TokenSelectionProvider, useTokenSelection } from "@/contexts/TokenSelectionContext";
import { ChevronDownIcon, CandlestickChartIcon, LineChartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { getEthereumIconDataUri } from "@/components/EthereumIcon";

import type { TokenMeta } from "@/lib/coins";
import { useZCurveSale, useZCurveSaleSummary, useZCurveBalance } from "@/hooks/use-zcurve-sale";
import { computeZCurvePoolId } from "@/lib/zCurvePoolId";
import { useReserves } from "@/hooks/use-reserves";
import { formatNumber } from "@/lib/utils";
import { VotePanel } from "@/components/VotePanel";

// Lazy load heavy components
const PoolPriceChart = lazy(() => import("@/components/PoolPriceChart"));
const PoolCandleChart = lazy(() => import("@/PoolCandleChart"));
import React from "react";

interface FinalizedPoolTradingProps {
  coinId: string;
  coinName?: string;
  coinSymbol?: string;
  coinIcon?: string;
  poolId?: string;
}

function FinalizedPoolTradingInner({
  coinId,
  coinName = "Token",
  coinSymbol = "TOKEN",
  coinIcon,
  poolId: providedPoolId,
}: FinalizedPoolTradingProps) {
  const { t } = useTranslation();
  const { address } = useAccount();
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<"swap" | "add" | "remove">("swap");
  const [showPriceChart, setShowPriceChart] = useState<boolean>(true);
  const [chartType, setChartType] = useState<"line" | "candle">("line");
  const { setSellToken, setBuyToken } = useTokenSelection();
  
  // Fetch sale and user data
  const { data: sale } = useZCurveSale(coinId);
  const { data: saleSummary } = useZCurveSaleSummary(coinId, address);
  const { data: userBalance } = useZCurveBalance(coinId, address);
  
  // Calculate pool ID - use feeOrHook from sale data if available
  const poolId = useMemo(() => {
    if (providedPoolId) return providedPoolId;
    // Use feeOrHook from sale data, default to 30 bps (0.3% fee) if not available
    const feeOrHook = sale?.feeOrHook ? BigInt(sale.feeOrHook) : 30n;
    const finalFee = feeOrHook === 0n ? 30n : feeOrHook; // Default to 30 bps if 0
    return computeZCurvePoolId(BigInt(coinId), finalFee);
  }, [providedPoolId, coinId, sale]);

  // Fetch pool reserves
  const { data: reserves } = useReserves({
    poolId: poolId ? BigInt(poolId) : undefined,
    source: "COOKBOOK" as const,
  });
  
  // Debug logging
  console.log("FinalizedPoolTrading Debug:", {
    coinId,
    sale,
    feeOrHook: sale?.feeOrHook,
    poolId,
    reserves,
    reserve0: reserves?.reserve0?.toString(),
    reserve1: reserves?.reserve1?.toString(),
  });

  // Create token metadata objects for ETH and the coin
  const ethToken = useMemo<TokenMeta>(() => ({
    id: null,
    symbol: "ETH",
    name: "Ethereum",
    decimals: 18,
    image: getEthereumIconDataUri(theme),
    balance: 0n, // Will be fetched by components
    reserve0: reserves?.reserve0 || 0n,
    reserve1: reserves?.reserve1 || 0n,
    source: "COOKBOOK" as const,
  }), [reserves, theme]);

  const coinToken = useMemo<TokenMeta>(() => ({
    id: BigInt(coinId),
    symbol: coinSymbol || sale?.coin?.symbol || "TOKEN",
    name: coinName || sale?.coin?.name || "Token",
    decimals: 18,
    image: coinIcon || sale?.coin?.imageUrl || "",
    tokenUri: coinIcon || sale?.coin?.imageUrl || "",
    balance: 0n, // Will be fetched by components
    reserve0: reserves?.reserve0 || 0n,
    reserve1: reserves?.reserve1 || 0n,
    source: "COOKBOOK" as const,
  }), [coinId, coinSymbol, coinName, sale, coinIcon, reserves]);

  // Set tokens in context when tab changes
  React.useEffect(() => {
    if (activeTab === "add" || activeTab === "remove") {
      setSellToken(ethToken);
      setBuyToken(coinToken);
    }
  }, [activeTab, ethToken, coinToken, setSellToken, setBuyToken]);

  // Check if user has claimable balance from zCurve (NOT their Cookbook balance)
  const zCurveBalance = saleSummary?.userBalance ? BigInt(saleSummary.userBalance) : userBalance ? BigInt(userBalance.balance) : 0n;
  const hasClaimableBalance = zCurveBalance > 0n;

  if (!poolId) {
    return (
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <Alert>
          <AlertDescription>
            {t("trade.pool_not_found", "Pool not found")}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const { data: ethPrice } = useETHPrice();

  // Calculate market cap and price
  const { coinPrice, coinUsdPrice, marketCapUsd } = useMemo(() => {
    const price =
      reserves?.reserve0 && reserves?.reserve1 && reserves.reserve0 > 0n && reserves.reserve1 > 0n
        ? Number(formatEther(reserves.reserve0)) / Number(formatUnits(reserves.reserve1, 18))
        : 0;

    const usdPrice = price * (ethPrice?.priceUSD || 0);
    // Use 1 billion (1e9) as the total supply for all zCurve launched tokens
    const totalSupply = 1_000_000_000n * 10n ** 18n; // 1 billion tokens with 18 decimals
    const marketCap = usdPrice * Number(formatUnits(totalSupply, 18));

    return { coinPrice: price, coinUsdPrice: usdPrice, marketCapUsd: marketCap };
  }, [reserves, ethPrice?.priceUSD, sale]);

  return (
    <div className="w-full">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
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

      {/* Remove the desktop-only header - we'll show metadata above swap tile instead */}

      {/* Trading Interface - Desktop: side by side, Mobile: stacked */}
      <div className="mb-4 sm:mb-6 md:mb-8">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          {/* Tabs at the top */}
          <div className="bg-card border border-border rounded-t-lg p-3 lg:p-4">
            <TabsList className="flex flex-wrap sm:grid sm:grid-cols-3 gap-2 bg-muted/50 p-2 h-auto w-full max-w-2xl mx-auto">
              <TabsTrigger 
                value="swap" 
                className="flex-1 sm:flex-initial px-4 py-2 lg:px-6 lg:py-3 text-xs sm:text-sm lg:text-base data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                {t("common.swap")}
              </TabsTrigger>
              <TabsTrigger 
                value="add" 
                className="flex-1 sm:flex-initial px-4 py-2 lg:px-6 lg:py-3 text-xs sm:text-sm lg:text-base data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                {t("common.add")}
              </TabsTrigger>
              <TabsTrigger 
                value="remove" 
                className="flex-1 sm:flex-initial px-4 py-2 lg:px-6 lg:py-3 text-xs sm:text-sm lg:text-base data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                {t("common.remove")}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="swap" className="mt-0">
            {/* Full width layout for desktop */}
            <div className="w-full">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 xl:gap-8">
                {/* Chart Section - Desktop: Left, Mobile: Below swap */}
                <div className="order-2 lg:order-1 bg-card border border-border rounded-lg p-4 lg:p-6 xl:p-8">
                <div className="h-full flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm lg:text-base font-semibold">{t("common.chart")}</h3>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setChartType(chartType === "line" ? "candle" : "line")}
                        className="h-8 px-2"
                      >
                        {chartType === "line" ? <CandlestickChartIcon className="h-4 w-4" /> : <LineChartIcon className="h-4 w-4" />}
                      </Button>
                      <button
                        onClick={() => setShowPriceChart((prev) => !prev)}
                        className="lg:hidden text-xs text-muted-foreground flex items-center gap-1 hover:text-primary"
                      >
                        {showPriceChart ? t("coin.hide_chart") : t("coin.show_chart")}
                        <ChevronDownIcon
                          className={`w-3 h-3 transition-transform ${showPriceChart ? "rotate-180" : ""}`}
                        />
                      </button>
                    </div>
                  </div>

                  <div className={`flex-1 ${!showPriceChart && "lg:block hidden"}`}>
                    <Suspense
                      fallback={
                        <div className="h-[400px] lg:h-[500px] flex items-center justify-center">
                          <LoadingLogo />
                        </div>
                      }
                    >
                      <div className="h-[400px] lg:h-[500px]">
                        {chartType === "line" ? (
                          <PoolPriceChart
                            poolId={poolId}
                            ticker={coinSymbol}
                            ethUsdPrice={ethPrice?.priceUSD}
                          />
                        ) : (
                          <PoolCandleChart poolId={poolId} interval="1d" />
                        )}
                      </div>
                    </Suspense>
                  </div>

                  {/* Market Stats */}
                  <div className="mt-4 lg:mt-6 pt-4 lg:pt-6 border-t border-border grid grid-cols-2 gap-4 lg:gap-6 text-xs lg:text-sm">
                    <div>
                      <p className="text-muted-foreground mb-1 lg:mb-2">{t("coin.price")}</p>
                      <p className="font-medium lg:text-base">{coinPrice > 0 ? `${coinPrice.toFixed(6)} ETH` : "-"}</p>
                      <p className="text-muted-foreground text-xs lg:text-sm">${coinUsdPrice.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1 lg:mb-2">{t("coin.market_cap")}</p>
                      <p className="font-medium lg:text-base">
                        $
                        {marketCapUsd > 1e9
                          ? (marketCapUsd / 1e9).toFixed(2) + "B"
                          : marketCapUsd > 0
                            ? (marketCapUsd / 1e6).toFixed(2) + "M"
                            : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1 lg:mb-2">{t("coin.pool_eth")}</p>
                      <p className="font-medium lg:text-base">{formatNumber(Number(formatEther(reserves?.reserve0 || 0n)), 4)} ETH</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1 lg:mb-2">{t("coin.pool_tokens", "Pool Tokens")}</p>
                      <p className="font-medium lg:text-base">
                        {formatNumber(Number(formatUnits(reserves?.reserve1 || 0n, 18)), 0)} {coinSymbol}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Swap Section - Desktop: Right, Mobile: Top */}
              <div className="order-1 lg:order-2 bg-card border border-border rounded-lg p-4 lg:p-6 xl:p-8">
                <div className="w-full">
                  {/* Token Metadata */}
                  <div className="mb-6">
                    <div className="flex items-center gap-3 mb-4">
                      {coinIcon && (
                        <img 
                          src={coinIcon} 
                          alt={coinName} 
                          className="w-16 h-16 rounded-full"
                        />
                      )}
                      <div>
                        <h2 className="text-2xl font-bold">
                          {coinName} ({coinSymbol})
                        </h2>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>[CURVE]</span>
                          <span>•</span>
                          <span>ID: {coinId}</span>
                        </div>
                      </div>
                    </div>
                    
                    {sale?.coin?.description && (
                      <p className="text-sm text-muted-foreground mb-4">
                        {sale.coin.description}
                      </p>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground mb-1">{t("coin.pool_fee")}</p>
                        <p className="font-medium">0.3%</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-1">{t("coin.market_cap")}</p>
                        <p className="font-medium">
                          {marketCapUsd > 0 ? (
                            <>
                              {(marketCapUsd / (ethPrice?.priceUSD || 1)).toFixed(2)} ETH
                              <span className="text-xs text-muted-foreground ml-1">
                                (~${formatNumber(marketCapUsd, 0)})
                              </span>
                            </>
                          ) : (
                            "N/A"
                          )}
                        </p>
                      </div>
                    </div>
                    
                    <a 
                      href={`/coin/${coinId}`}
                      className="inline-block mt-3 text-xs text-primary hover:underline"
                    >
                      {t("coin.view_token_metadata", "View Token Metadata")} →
                    </a>
                  </div>
                  
                  <div className="border-t pt-6">
                    <CookbookSwapTile 
                    coinId={coinId}
                    coinName={sale?.coin?.name || coinName}
                    coinSymbol={sale?.coin?.symbol || coinSymbol}
                    coinIcon={sale?.coin?.imageUrl || coinIcon}
                    poolId={poolId}
                    feeOrHook={30n}
                    />
                  </div>
                  
                  {/* Vote Panel centered at bottom of swap tile */}
                  <div className="mt-6 lg:mt-8 flex justify-center">
                    <VotePanel coinId={BigInt(coinId)} />
                  </div>
                </div>
              </div>
            </div>
            </div>
          </TabsContent>

          <TabsContent value="add" className="mt-0">
            <div className="w-full">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 xl:gap-8">
                {/* Add Liquidity Form */}
                <div className="bg-card border border-border rounded-lg p-4 lg:p-6 xl:p-8">
                  <ZCurveAddLiquidity 
                    coinId={coinId} 
                    poolId={poolId}
                    feeOrHook={30n}
                  />
                </div>
                
                {/* Pool Info for Add Liquidity */}
                <div className="bg-card border border-border rounded-lg p-4 lg:p-6 xl:p-8">
                  <h3 className="text-lg lg:text-xl font-semibold mb-4 lg:mb-6">{t("liquidity.pool_info")}</h3>
                  <div className="space-y-4 lg:space-y-6">
                    <div>
                      <p className="text-sm lg:text-base text-muted-foreground mb-1 lg:mb-2">{t("coin.current_price")}</p>
                      <p className="font-medium lg:text-lg">{coinPrice > 0 ? `${coinPrice.toFixed(6)} ETH` : "-"}</p>
                      <p className="text-sm lg:text-base text-muted-foreground">${coinUsdPrice.toFixed(2)} USD</p>
                    </div>
                    <div>
                      <p className="text-sm lg:text-base text-muted-foreground mb-1 lg:mb-2">{t("coin.pool_liquidity")}</p>
                      <p className="font-medium lg:text-lg">{formatNumber(Number(formatEther(reserves?.reserve0 || 0n)), 4)} ETH</p>
                      <p className="text-sm lg:text-base text-muted-foreground">{formatNumber(Number(formatUnits(reserves?.reserve1 || 0n, 18)), 0)} {coinSymbol}</p>
                    </div>
                    <div>
                      <p className="text-sm lg:text-base text-muted-foreground mb-1 lg:mb-2">{t("coin.pool_fee")}</p>
                      <p className="font-medium lg:text-lg">0.3%</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="remove" className="mt-0">
            <div className="w-full">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 xl:gap-8">
                {/* Remove Liquidity Form */}
                <div className="bg-card border border-border rounded-lg p-4 lg:p-6 xl:p-8">
                  <ZCurveRemoveLiquidity 
                    coinId={coinId}
                    poolId={poolId}
                    feeOrHook={30n}
                  />
                </div>
                
                {/* Pool Info for Remove Liquidity */}
                <div className="bg-card border border-border rounded-lg p-4 lg:p-6 xl:p-8">
                  <h3 className="text-lg lg:text-xl font-semibold mb-4 lg:mb-6">{t("liquidity.your_position")}</h3>
                  <div className="space-y-4 lg:space-y-6">
                    <div>
                      <p className="text-sm lg:text-base text-muted-foreground mb-1 lg:mb-2">{t("coin.current_price")}</p>
                      <p className="font-medium lg:text-lg">{coinPrice > 0 ? `${coinPrice.toFixed(6)} ETH` : "-"}</p>
                      <p className="text-sm lg:text-base text-muted-foreground">${coinUsdPrice.toFixed(2)} USD</p>
                    </div>
                    <div>
                      <p className="text-sm lg:text-base text-muted-foreground mb-1 lg:mb-2">{t("coin.pool_liquidity")}</p>
                      <p className="font-medium lg:text-lg">{formatNumber(Number(formatEther(reserves?.reserve0 || 0n)), 4)} ETH</p>
                      <p className="text-sm lg:text-base text-muted-foreground">{formatNumber(Number(formatUnits(reserves?.reserve1 || 0n, 18)), 0)} {coinSymbol}</p>
                    </div>
                    <div>
                      <p className="text-sm lg:text-base text-muted-foreground mb-1 lg:mb-2">{t("coin.pool_fee")}</p>
                      <p className="font-medium lg:text-lg">0.3%</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Info Section */}
      <div className="mt-6 md:mt-8 bg-card border border-border rounded-lg p-4 md:p-6 lg:p-8">
        <h2 className="text-lg md:text-xl lg:text-2xl font-semibold mb-4 lg:mb-6">
          {t("coin.pool_details", "Pool Details")}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 text-sm lg:text-base">
          <div>
            <p className="text-muted-foreground mb-1">{t("coin.total_supply")}</p>
            <p className="font-medium lg:text-lg">
              {formatNumber(1_000_000_000, 0)} {coinSymbol}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">{t("coin.pool_fee")}</p>
            <p className="font-medium lg:text-lg">0.3%</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">{t("coin.pool_id")}</p>
            <p className="font-mono text-xs lg:text-sm break-all hover:text-primary transition-colors">
              {poolId}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">{t("coin.decimals")}</p>
            <p className="font-medium lg:text-lg">18</p>
          </div>
        </div>
      </div>

    </div>
    </div>
  );
}

// Export wrapped component with TokenSelectionProvider
export function FinalizedPoolTrading(props: FinalizedPoolTradingProps) {
  return (
    <TokenSelectionProvider>
      <FinalizedPoolTradingInner {...props} />
    </TokenSelectionProvider>
  );
}