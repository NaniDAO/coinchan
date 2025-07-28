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
import {
  TokenSelectionProvider,
  useTokenSelection,
} from "@/contexts/TokenSelectionContext";
import {
  ChevronDownIcon,
  CandlestickChartIcon,
  LineChartIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { getEthereumIconDataUri } from "@/components/EthereumIcon";

import type { TokenMeta } from "@/lib/coins";
import {
  useZCurveSale,
  useZCurveSaleSummary,
  useZCurveBalance,
} from "@/hooks/use-zcurve-sale";
import { computeZCurvePoolId } from "@/lib/zCurvePoolId";
import { useReserves } from "@/hooks/use-reserves";
import { formatNumber } from "@/lib/utils";
import { VotePanel } from "@/components/VotePanel";

// Lazy load heavy components
const PoolPriceChart = lazy(() => import("@/components/PoolPriceChart"));
const PoolCandleChart = lazy(() => import("@/PoolCandleChart"));
import React from "react";
import { formatImageURL } from "@/hooks/metadata";
import { PoolChart } from "./PoolChart";

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
  const ethToken = useMemo<TokenMeta>(
    () => ({
      id: null,
      symbol: "ETH",
      name: "Ethereum",
      decimals: 18,
      image: getEthereumIconDataUri(theme),
      balance: 0n, // Will be fetched by components
      reserve0: reserves?.reserve0 || 0n,
      reserve1: reserves?.reserve1 || 0n,
      source: "COOKBOOK" as const,
    }),
    [reserves, theme],
  );

  const coinToken = useMemo<TokenMeta>(
    () => ({
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
    }),
    [coinId, coinSymbol, coinName, sale, coinIcon, reserves],
  );

  // Set tokens in context when tab changes
  React.useEffect(() => {
    if (activeTab === "add" || activeTab === "remove") {
      setSellToken(ethToken);
      setBuyToken(coinToken);
    }
  }, [activeTab, ethToken, coinToken, setSellToken, setBuyToken]);

  // Check if user has claimable balance from zCurve (NOT their Cookbook balance)
  const zCurveBalance = saleSummary?.userBalance
    ? BigInt(saleSummary.userBalance)
    : userBalance
      ? BigInt(userBalance.balance)
      : 0n;
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
      reserves?.reserve0 &&
      reserves?.reserve1 &&
      reserves.reserve0 > 0n &&
      reserves.reserve1 > 0n
        ? Number(formatEther(reserves.reserve0)) /
          Number(formatUnits(reserves.reserve1, 18))
        : 0;

    const usdPrice = price * (ethPrice?.priceUSD || 0);
    // Use 1 billion (1e9) as the total supply for all zCurve launched tokens
    const totalSupply = 1_000_000_000n * 10n ** 18n; // 1 billion tokens with 18 decimals
    const marketCap = usdPrice * Number(formatUnits(totalSupply, 18));

    return {
      coinPrice: price,
      coinUsdPrice: usdPrice,
      marketCapUsd: marketCap,
    };
  }, [reserves, ethPrice?.priceUSD, sale]);

  return (
    <div>
      {/* Claimable Balance Alert */}
      {hasClaimableBalance && (
        <Alert className="mb-4 sm:mb-6 border-2 border-primary bg-gradient-to-r from-primary/20 to-primary/10 shadow-xl">
          <AlertTitle className="text-lg font-bold flex items-center gap-2">
            <span className="text-2xl animate-bounce">💰</span>
            {t("claim.alert_title", "You have tokens to claim!")}
          </AlertTitle>
          <AlertDescription className="text-base mt-2">
            {t(
              "claim.alert_description",
              "The sale has finalized and you have tokens ready to claim. See below to claim them.",
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Claim Section */}
      {hasClaimableBalance && (
        <div className="mb-4 sm:mb-6">
          <ZCurveClaim coinId={coinId} coinSymbol={coinSymbol} />
        </div>
      )}

      {/* Trading Interface - Desktop: side by side, Mobile: stacked */}
      <div className="gap-2 grid grid-cols-10">
        {/* Chart Section - Desktop: Left, Mobile: Below swap */}
        <PoolChart
          poolId={poolId}
          coinSymbol={coinSymbol}
          ethPrice={ethPrice}
          coinPrice={coinPrice}
          coinUsdPrice={coinUsdPrice}
          marketCapUsd={marketCapUsd}
          reserves={reserves}
        />

        <Tabs
          className="lg:col-span-3"
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as any)}
        >
          {/* Tabs at the top */}
          <TabsList className="bg-card  rounded-t-lg p-3 w-full lg:p-4">
            <TabsTrigger
              value="swap"
              className="w-full flex-1 sm:flex-initial px-4 py-2 lg:px-6 lg:py-3 text-xs sm:text-sm lg:text-base data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-sm"
            >
              {t("common.swap")}
            </TabsTrigger>
            <TabsTrigger
              value="add"
              className="w-full flex-1 sm:flex-initial px-4 py-2 lg:px-6 lg:py-3 text-xs sm:text-sm lg:text-base data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-sm"
            >
              {t("common.add")}
            </TabsTrigger>
            <TabsTrigger
              value="remove"
              className="w-full flex-1 sm:flex-initial px-4 py-2 lg:px-6 lg:py-3 text-xs sm:text-sm lg:text-base data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-sm"
            >
              {t("common.remove")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="swap" className="mt-0">
            {/* Swap Section - Desktop: Right, Mobile: Top */}
            <div className="w-full">
              <CookbookSwapTile
                coinId={coinId}
                coinName={sale?.coin?.name || coinName}
                coinSymbol={sale?.coin?.symbol || coinSymbol}
                coinIcon={sale?.coin?.imageUrl || coinIcon}
                poolId={poolId}
                feeOrHook={30n}
              />
            </div>
          </TabsContent>

          <TabsContent value="add" className="mt-0">
            <div className="w-full">
              <div className="grid grid-cols-1 lg:grid-rows-2 gap-4 lg:gap-6 xl:gap-8">
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
                  <h3 className="text-lg lg:text-xl font-semibold mb-4 lg:mb-6">
                    {t("liquidity.pool_info")}
                  </h3>
                  <div className="space-y-4 lg:space-y-6">
                    <div>
                      <p className="text-sm lg:text-base text-muted-foreground mb-1 lg:mb-2">
                        {t("coin.current_price")}
                      </p>
                      <p className="font-medium lg:text-lg">
                        {coinPrice > 0 ? `${coinPrice.toFixed(6)} ETH` : "-"}
                      </p>
                      <p className="text-sm lg:text-base text-muted-foreground">
                        ${coinUsdPrice.toFixed(2)} USD
                      </p>
                    </div>
                    <div>
                      <p className="text-sm lg:text-base text-muted-foreground mb-1 lg:mb-2">
                        {t("coin.pool_liquidity")}
                      </p>
                      <p className="font-medium lg:text-lg">
                        {formatNumber(
                          Number(formatEther(reserves?.reserve0 || 0n)),
                          4,
                        )}{" "}
                        ETH
                      </p>
                      <p className="text-sm lg:text-base text-muted-foreground">
                        {formatNumber(
                          Number(formatUnits(reserves?.reserve1 || 0n, 18)),
                          0,
                        )}{" "}
                        {coinSymbol}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm lg:text-base text-muted-foreground mb-1 lg:mb-2">
                        {t("coin.pool_fee")}
                      </p>
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
                  <h3 className="text-lg lg:text-xl font-semibold mb-4 lg:mb-6">
                    {t("liquidity.your_position")}
                  </h3>
                  <div className="space-y-4 lg:space-y-6">
                    <div>
                      <p className="text-sm lg:text-base text-muted-foreground mb-1 lg:mb-2">
                        {t("coin.current_price")}
                      </p>
                      <p className="font-medium lg:text-lg">
                        {coinPrice > 0 ? `${coinPrice.toFixed(6)} ETH` : "-"}
                      </p>
                      <p className="text-sm lg:text-base text-muted-foreground">
                        ${coinUsdPrice.toFixed(2)} USD
                      </p>
                    </div>
                    <div>
                      <p className="text-sm lg:text-base text-muted-foreground mb-1 lg:mb-2">
                        {t("coin.pool_liquidity")}
                      </p>
                      <p className="font-medium lg:text-lg">
                        {formatNumber(
                          Number(formatEther(reserves?.reserve0 || 0n)),
                          4,
                        )}{" "}
                        ETH
                      </p>
                      <p className="text-sm lg:text-base text-muted-foreground">
                        {formatNumber(
                          Number(formatUnits(reserves?.reserve1 || 0n, 18)),
                          0,
                        )}{" "}
                        {coinSymbol}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm lg:text-base text-muted-foreground mb-1 lg:mb-2">
                        {t("coin.pool_fee")}
                      </p>
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
            <p className="text-muted-foreground mb-1">
              {t("coin.total_supply")}
            </p>
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
