import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits } from "viem";
import { useAccount } from "wagmi";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnhancedCookbookSwapTile } from "@/components/EnhancedCookbookSwapTile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ZCurveClaim } from "@/components/ZCurveClaim";
import { useETHPrice } from "@/hooks/use-eth-price";
import { ZCurveAddLiquidity } from "@/components/ZCurveAddLiquidity";
import { ZCurveRemoveLiquidity } from "@/components/ZCurveRemoveLiquidity";
import { TokenSelectionProvider, useTokenSelection } from "@/contexts/TokenSelectionContext";
import { useTheme } from "@/lib/theme";
import { getEthereumIconDataUri } from "@/components/EthereumIcon";

import type { TokenMeta } from "@/lib/coins";
import { useZCurveSale, useZCurveSaleSummary, useZCurveBalance } from "@/hooks/use-zcurve-sale";
import { computeZCurvePoolId } from "@/lib/zCurvePoolId";
import { useReserves } from "@/hooks/use-reserves";
import { formatNumber } from "@/lib/utils";
import React from "react";
import { EnhancedPoolChart } from "./EnhancedPoolChart";
import { ChevronDown } from "lucide-react";

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
  const [priceImpact, setPriceImpact] = useState<{
    currentPrice: number;
    projectedPrice: number;
    impactPercent: number;
    action: "buy" | "sell";
  } | null>(null);
  const [chartRefreshKey, setChartRefreshKey] = useState(0);

  // Fetch sale and user data
  const { data: sale } = useZCurveSale(coinId);
  const { data: saleSummary } = useZCurveSaleSummary(coinId, address);
  const { data: userBalance } = useZCurveBalance(coinId, address);

  // Calculate pool ID and fee - use feeOrHook from sale data if available
  const { poolId, actualFee } = useMemo(() => {
    if (providedPoolId) {
      // If poolId is provided, extract fee from sale data
      const feeOrHook = sale?.feeOrHook ? BigInt(sale.feeOrHook) : 30n;
      const fee = feeOrHook < 10000n ? feeOrHook : 30n;
      return { poolId: providedPoolId, actualFee: fee };
    }
    // Use feeOrHook from sale data, default to 30 bps (0.3% fee) if not available
    const feeOrHook = sale?.feeOrHook ? BigInt(sale.feeOrHook) : 30n;
    // Check if feeOrHook is a simple fee (< 10000) or a hook address
    const finalFee = feeOrHook < 10000n ? feeOrHook : 30n; // Use actual fee or default to 30 bps for hooks
    const computedPoolId = computeZCurvePoolId(BigInt(coinId), finalFee);
    return { poolId: computedPoolId, actualFee: finalFee };
  }, [providedPoolId, coinId, sale]);

  // Fetch pool reserves
  const { data: reserves, refetch: refetchReserves } = useReserves({
    poolId: poolId ? BigInt(poolId) : undefined,
    source: "COOKBOOK" as const,
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
          <AlertDescription>{t("trade.pool_not_found", "Pool not found")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { data: ethPrice } = useETHPrice();

  // Helper function to format very small USD values
  const formatUsdPrice = (price: number): string => {
    if (price === 0) return "$0.00";
    if (price < 0.00000001) {
      // For extremely small values, use scientific notation
      return `$${price.toExponential(2)}`;
    }
    if (price < 0.000001) {
      // For very small values, show up to 10 decimal places
      const formatted = price.toFixed(10);
      // Remove trailing zeros
      return `$${formatted.replace(/\.?0+$/, '')}`;
    }
    if (price < 0.01) {
      return `$${price.toFixed(6)}`;
    }
    if (price < 1) {
      return `$${price.toFixed(4)}`;
    }
    return `$${price.toFixed(2)}`;
  };

  // Calculate market cap and price
  const { coinPrice, coinUsdPrice, marketCapUsd, marketCapEth } = useMemo(() => {
    if (!reserves || reserves.reserve0 === 0n || reserves.reserve1 === 0n) {
      console.warn("No reserves available for pool:", poolId, reserves);
      return {
        coinPrice: 0,
        coinUsdPrice: 0,
        marketCapUsd: 0,
        marketCapEth: 0,
      };
    }

    // Price = ETH reserve / Token reserve (ETH is token0/reserve0)
    const ethReserve = Number(formatEther(reserves.reserve0));
    const tokenReserve = Number(formatUnits(reserves.reserve1, 18));

    if (tokenReserve === 0) {
      console.warn("Token reserve is 0");
      return {
        coinPrice: 0,
        coinUsdPrice: 0,
        marketCapUsd: 0,
        marketCapEth: 0,
      };
    }

    const price = ethReserve / tokenReserve;
    const usdPrice = price * (ethPrice?.priceUSD || 0);

    // Use 1 billion (1e9) as the total supply for all zCurve launched tokens
    const totalSupply = 1_000_000_000; // 1 billion tokens
    const marketCapInEth = price * totalSupply;
    const marketCap = usdPrice * totalSupply;

    console.log("Price calculation:", {
      ethReserve,
      tokenReserve,
      price,
      usdPrice,
      marketCap,
      marketCapInEth,
      ethPriceUSD: ethPrice?.priceUSD,
    });

    return {
      coinPrice: price,
      coinUsdPrice: usdPrice,
      marketCapUsd: marketCap,
      marketCapEth: marketCapInEth,
    };
  }, [reserves, ethPrice?.priceUSD, poolId]);

  return (
    <div>
      {/* Claim Section */}
      {hasClaimableBalance && (
        <div className="mb-4 sm:mb-6">
          <ZCurveClaim coinId={coinId} coinSymbol={coinSymbol} />
        </div>
      )}

      {/* Trading Interface - Desktop: side by side, Mobile: stacked with swap first */}
      <div className="flex flex-col lg:grid lg:grid-cols-10 gap-4">
        {/* Mobile: Swap first, Desktop: Chart on left */}
        <div className="order-2 lg:order-1 col-span-1 lg:col-span-7">
          <EnhancedPoolChart 
            key={chartRefreshKey}
            poolId={poolId} 
            coinSymbol={coinSymbol} 
            ethPrice={ethPrice}
            priceImpact={priceImpact}
            onTransactionSuccess={() => {
              refetchReserves();
              setChartRefreshKey(prev => prev + 1);
            }}
          />
        </div>

        <Tabs className="order-1 lg:order-2 col-span-1 lg:col-span-3" value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          {/* Tabs at the top */}
          <TabsList className="bg-muted/50 rounded-lg p-1 w-full flex justify-between">
            <TabsTrigger
              value="swap"
              className="flex-1 px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              {t("common.swap")}
            </TabsTrigger>
            <TabsTrigger
              value="add"
              className="flex-1 px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              {t("common.add")}
            </TabsTrigger>
            <TabsTrigger
              value="remove"
              className="flex-1 px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              {t("common.remove")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="swap" className="mt-4">
            {/* Swap Section - Desktop: Right, Mobile: Top */}
            <div className="w-full">
              <EnhancedCookbookSwapTile
                coinId={coinId}
                coinName={sale?.coin?.name || coinName}
                coinSymbol={sale?.coin?.symbol || coinSymbol}
                coinIcon={sale?.coin?.imageUrl || coinIcon}
                poolId={poolId}
                feeOrHook={actualFee}
                onPriceImpactChange={setPriceImpact}
                onTransactionSuccess={() => {
                  refetchReserves();
                  setChartRefreshKey(prev => prev + 1);
                }}
              />
            </div>
          </TabsContent>

          <TabsContent value="add" className="mt-4">
            <div className="w-full">
              <ZCurveAddLiquidity coinId={coinId} poolId={poolId} feeOrHook={actualFee} />
            </div>
          </TabsContent>

          <TabsContent value="remove" className="mt-4">
            <div className="w-full">
              {/* Remove Liquidity Form */}
              <ZCurveRemoveLiquidity coinId={coinId} poolId={poolId} feeOrHook={actualFee} />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Info Section */}
      <div className="mt-4 sm:mt-6 md:mt-8 bg-card rounded-lg p-4 sm:p-6">
        <h2 className="text-base sm:text-lg md:text-xl font-semibold mb-4 sm:mb-6 flex items-center gap-2">
          <span className="w-2 h-2 bg-primary rounded-full"></span>
          ETH / {coinToken.symbol} {t("coin.pool_details", "Pool")}
        </h2>

        {/* Unified Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-4 sm:mb-6">
          {/* Price */}
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 sm:mb-2">Price</div>
            <div className="font-semibold text-sm sm:text-base lg:text-lg">
              {reserves && coinPrice > 0
                ? coinPrice < 1e-15
                  ? `${((reserves.reserve0 * BigInt(1e18)) / reserves.reserve1).toString()} wei`
                  : coinPrice < 1e-12
                    ? `${(coinPrice * 1e9).toFixed(6)} gwei`
                  : coinPrice < 1e-9
                    ? `${(coinPrice * 1e9).toFixed(3)} gwei`
                    : coinPrice < 1e-6
                      ? `${(coinPrice * 1e6).toFixed(3)} μETH`
                    : coinPrice < 0.001
                      ? `${(coinPrice * 1000).toFixed(4)} mETH`
                    : coinPrice < 0.01
                      ? `${coinPrice.toFixed(6)} ETH`
                    : coinPrice < 1
                      ? `${coinPrice.toFixed(4)} ETH`
                      : `${coinPrice.toFixed(2)} ETH`
                : "0.00000000 ETH"}
            </div>
            <div className="text-sm text-muted-foreground">
              {ethPrice?.priceUSD 
                ? formatUsdPrice(coinUsdPrice)
                : "Loading..."}
            </div>
            {/* Tokens per ETH for context */}
            {reserves && coinPrice > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                {(() => {
                  const tokensPerEth = 1 / coinPrice;
                  if (tokensPerEth >= 1e9) {
                    return `${(tokensPerEth / 1e9).toFixed(2)}B per ETH`;
                  } else if (tokensPerEth >= 1e6) {
                    return `${(tokensPerEth / 1e6).toFixed(2)}M per ETH`;
                  } else if (tokensPerEth >= 1e3) {
                    return `${(tokensPerEth / 1e3).toFixed(2)}K per ETH`;
                  } else {
                    return `${tokensPerEth.toFixed(2)} per ETH`;
                  }
                })()}
              </div>
            )}
          </div>

          {/* Market Cap */}
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 sm:mb-2">Market Cap</div>
            <div className="font-semibold text-sm sm:text-base lg:text-lg">
              {reserves && marketCapEth > 0 ? (
                <>
                  {marketCapEth < 1
                    ? `${marketCapEth.toFixed(4)} ETH`
                    : marketCapEth < 1000
                      ? `${marketCapEth.toFixed(2)} ETH`
                      : `${(marketCapEth / 1000).toFixed(2)}K ETH`}
                  {ethPrice?.priceUSD && marketCapUsd > 0 && (
                    <span className="text-muted-foreground text-xs ml-1">
                      (~$
                      {marketCapUsd > 1e9
                        ? `${(marketCapUsd / 1e9).toFixed(2)}B`
                        : marketCapUsd > 1e6
                          ? `${(marketCapUsd / 1e6).toFixed(2)}M`
                          : marketCapUsd > 1000
                            ? `${(marketCapUsd / 1e3).toFixed(2)}K`
                            : marketCapUsd.toFixed(0)}
                      )
                    </span>
                  )}
                </>
              ) : (
                "Loading..."
              )}
            </div>
            <div className="text-xs text-muted-foreground">{formatNumber(1_000_000_000, 0)} supply</div>
          </div>

          {/* ETH Liquidity */}
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 sm:mb-2">ETH Liquidity</div>
            <div className="font-semibold text-sm sm:text-base lg:text-lg">
              {formatNumber(Number(formatEther(reserves?.reserve0 || 0n)), 4)}
            </div>
            <div className="text-xs text-muted-foreground">ETH</div>
          </div>

          {/* Token Liquidity */}
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 sm:mb-2">
              {coinSymbol} Liquidity
            </div>
            <div className="font-semibold text-sm sm:text-base lg:text-lg">
              {formatNumber(Number(formatUnits(reserves?.reserve1 || 0n, 18)), 0)}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              {coinSymbol}
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-medium">
                {(Number(actualFee) / 100).toFixed(2)}% Fee
              </span>
            </div>
          </div>
        </div>

        {/* Technical Details - Minimalist */}
        <details className="group pt-4">
          <summary className="flex items-center justify-between cursor-pointer py-2 hover:text-primary transition-colors">
            <span className="text-sm font-medium text-muted-foreground">Technical Details</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground group-open:rotate-180 transition-transform" />
          </summary>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pool ID</span>
              <span className="font-mono text-xs text-primary">
                {poolId?.slice(0, 8)}...{poolId?.slice(-6)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Decimals</span>
              <span>18</span>
            </div>
          </div>
        </details>
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
