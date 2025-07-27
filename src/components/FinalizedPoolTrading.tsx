import { useMemo, useState, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits } from "viem";
import { useAccount } from "wagmi";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CookbookSwapTile } from "@/components/CookbookSwapTile";
import { TokenImage } from "@/components/TokenImage";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ZCurveClaim } from "@/components/ZCurveClaim";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { useETHPrice } from "@/hooks/use-eth-price";
import { AddLiquidity } from "@/AddLiquidity";
import { RemoveLiquidity } from "@/RemoveLiquidity";
import { TokenSelectionProvider, useTokenSelection } from "@/contexts/TokenSelectionContext";
import { ChevronDownIcon } from "lucide-react";

import type { TokenMeta } from "@/lib/coins";
import { useZCurveSale, useZCurveSaleSummary, useZCurveBalance } from "@/hooks/use-zcurve-sale";
import { computeZCurvePoolId } from "@/lib/zCurvePoolId";
import { useReserves } from "@/hooks/use-reserves";
import { formatNumber } from "@/lib/utils";

// Lazy load heavy components
const PoolPriceChart = lazy(() => import("@/components/PoolPriceChart"));
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
  const [activeTab, setActiveTab] = useState<"swap" | "add" | "remove">("swap");
  const [showPriceChart, setShowPriceChart] = useState<boolean>(true);
  const { setSellToken, setBuyToken } = useTokenSelection();
  
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

  // Create token metadata objects for ETH and the coin
  const ethToken = useMemo<TokenMeta>(() => ({
    id: null,
    symbol: "ETH",
    name: "Ethereum",
    decimals: 18,
    image: "", // Will use theme-aware icon
    balance: 0n, // Will be fetched by components
    reserve0: reserves?.reserve0 || 0n,
    reserve1: reserves?.reserve1 || 0n,
    source: "COOKBOOK" as const,
  }), [reserves]);

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
      <div className="container mx-auto max-w-2xl px-2 sm:px-4 py-4 sm:py-8">
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
    const totalSupply = sale?.coin?.totalSupply ? BigInt(sale.coin.totalSupply) : 0n;
    const marketCap = usdPrice * Number(formatUnits(totalSupply, 18));

    return { coinPrice: price, coinUsdPrice: usdPrice, marketCapUsd: marketCap };
  }, [reserves, ethPrice?.priceUSD, sale]);

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
        <div className="flex items-center justify-center gap-3">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full overflow-hidden">
            <TokenImage token={coinToken} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">{coinToken.name}</h1>
            <p className="text-muted-foreground">{coinToken.symbol}</p>
          </div>
        </div>
      </div>

      {/* Trading Interface - matching ENS style with proper tabs */}
      <div className="bg-card border border-border rounded-lg p-2 sm:p-4 md:p-6 mb-4 sm:mb-6 md:mb-8">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="flex flex-wrap sm:grid sm:grid-cols-3 gap-1 bg-muted/50 p-1 h-auto w-full">
            <TabsTrigger 
              value="swap" 
              className="flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              {t("common.swap")}
            </TabsTrigger>
            <TabsTrigger 
              value="add" 
              className="flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              {t("common.add")}
            </TabsTrigger>
            <TabsTrigger 
              value="remove" 
              className="flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              {t("common.remove")}
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
                feeOrHook={30n}
              />

              {/* Chart */}
              <div className="mt-4 border-t border-border pt-4">
                <div className="relative flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() => setShowPriceChart((prev) => !prev)}
                      className="text-xs text-muted-foreground flex items-center gap-1 hover:text-primary"
                    >
                      {showPriceChart ? t("coin.hide_chart") : t("coin.show_chart")}
                      <ChevronDownIcon
                        className={`w-3 h-3 transition-transform ${showPriceChart ? "rotate-180" : ""}`}
                      />
                    </button>
                    {showPriceChart && (
                      <div className="text-xs text-muted-foreground">
                        {coinSymbol}/ETH {t("coin.price_history")}
                      </div>
                    )}
                  </div>

                  {showPriceChart && (
                    <div className="transition-all duration-300">
                      <Suspense
                        fallback={
                          <div className="h-64 flex items-center justify-center">
                            <LoadingLogo />
                          </div>
                        }
                      >
                        <PoolPriceChart
                          poolId={poolId}
                          ticker={coinSymbol}
                          ethUsdPrice={ethPrice?.priceUSD}
                        />
                      </Suspense>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-xs text-muted-foreground text-center">{t("coin.pool_fee")}: 0.3%</div>

              {/* Market Stats - subtle below chart */}
              <div className="mt-4 sm:mt-6 grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 text-xs">
                <div className="text-center">
                  <p className="text-muted-foreground opacity-70">{t("coin.price")}</p>
                  <p className="font-medium">{coinPrice > 0 ? `${coinPrice.toFixed(6)} ETH` : "-"}</p>
                  <p className="text-muted-foreground opacity-60">${coinUsdPrice.toFixed(2)}</p>
                </div>

                <div className="text-center">
                  <p className="text-muted-foreground opacity-70">{t("coin.market_cap")}</p>
                  <p className="font-medium">
                    $
                    {marketCapUsd > 1e9
                      ? (marketCapUsd / 1e9).toFixed(2) + "B"
                      : marketCapUsd > 0
                        ? (marketCapUsd / 1e6).toFixed(2) + "M"
                        : "-"}
                  </p>
                </div>

                <div className="text-center">
                  <p className="text-muted-foreground opacity-70">{t("coin.pool_eth")}</p>
                  <p className="font-medium">{formatEther(reserves?.reserve0 || 0n)} ETH</p>
                </div>

                <div className="text-center">
                  <p className="text-muted-foreground opacity-70">{t("coin.pool_tokens", "Pool Tokens")}</p>
                  <p className="font-medium">
                    {Number(formatUnits(reserves?.reserve1 || 0n, 18)).toFixed(3)} {coinSymbol}
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="add" className="mt-2 sm:mt-4">
            <AddLiquidity />
          </TabsContent>

          <TabsContent value="remove" className="mt-2 sm:mt-4">
            <RemoveLiquidity />
          </TabsContent>
        </Tabs>
      </div>

      {/* Info Section */}
      <div className="mt-6 md:mt-8 bg-card border border-border rounded-lg p-4 md:p-6">
        <h2 className="text-lg md:text-xl font-semibold mb-4">
          {t("coin.about_title", "About")} {coinToken.name}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">{t("coin.total_supply")}</p>
            <p className="font-medium">
              {formatNumber(Number(formatUnits(BigInt(sale?.coin?.totalSupply || "0"), 18)), 0)} {coinSymbol}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("coin.pool_fee")}</p>
            <p className="font-medium">0.3%</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("coin.pool_id")}</p>
            <p className="font-mono text-xs break-all hover:text-primary transition-colors">
              {poolId}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("coin.decimals")}</p>
            <p className="font-medium">18</p>
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