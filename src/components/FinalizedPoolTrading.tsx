import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits } from "viem";
import { useAccount } from "wagmi";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CookbookSwapTile } from "@/components/CookbookSwapTile";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ZCurveClaim } from "@/components/ZCurveClaim";
import { useETHPrice } from "@/hooks/use-eth-price";
import { ZCurveAddLiquidity } from "@/components/ZCurveAddLiquidity";
import { ZCurveRemoveLiquidity } from "@/components/ZCurveRemoveLiquidity";
import {
  TokenSelectionProvider,
  useTokenSelection,
} from "@/contexts/TokenSelectionContext";
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
import React from "react";
import { PoolChart } from "./PoolChart";
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
            <div className="w-full bg-card border border-border rounded-lg p-4 lg:p-6 xl:p-8">
              <ZCurveAddLiquidity
                coinId={coinId}
                poolId={poolId}
                feeOrHook={30n}
              />
            </div>
          </TabsContent>

          <TabsContent value="remove" className="mt-0">
            <div className="w-full bg-card border border-border rounded-lg p-4 lg:p-6 xl:p-8">
              {/* Remove Liquidity Form */}
              <ZCurveRemoveLiquidity
                coinId={coinId}
                poolId={poolId}
                feeOrHook={30n}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Info Section */}
      <div className="mt-6 md:mt-8 bg-card rounded-lg p-6">
        <h2 className="text-lg md:text-xl font-semibold mb-6 flex items-center gap-2">
          <span className="w-2 h-2 bg-primary rounded-full"></span>
          ETH / {coinToken.symbol} {t("coin.pool_details", "Pool")}
        </h2>

        {/* Unified Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
          {/* Price */}
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Price
            </div>
            <div className="font-semibold text-lg">
              {coinPrice > 0 ? `${coinPrice.toFixed(6)} ETH` : "-"}
            </div>
            <div className="text-sm text-muted-foreground">
              ${coinUsdPrice.toFixed(2)}
            </div>
          </div>

          {/* Market Cap */}
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Market Cap
            </div>
            <div className="font-semibold text-lg">
              $
              {marketCapUsd > 1e9
                ? (marketCapUsd / 1e9).toFixed(2) + "B"
                : marketCapUsd > 0
                  ? (marketCapUsd / 1e6).toFixed(2) + "M"
                  : "-"}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatNumber(1_000_000_000, 0)} supply
            </div>
          </div>

          {/* ETH Liquidity */}
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              ETH Liquidity
            </div>
            <div className="font-semibold text-lg">
              {formatNumber(Number(formatEther(reserves?.reserve0 || 0n)), 4)}
            </div>
            <div className="text-xs text-muted-foreground">ETH</div>
          </div>

          {/* Token Liquidity */}
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              {coinSymbol} Liquidity
            </div>
            <div className="font-semibold text-lg">
              {formatNumber(
                Number(formatUnits(reserves?.reserve1 || 0n, 18)),
                0,
              )}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              {coinSymbol}
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-medium">
                0.3% Fee
              </span>
            </div>
          </div>
        </div>

        {/* Technical Details - Minimalist */}
        <details className="group pt-4">
          <summary className="flex items-center justify-between cursor-pointer py-2 hover:text-primary transition-colors">
            <span className="text-sm font-medium text-muted-foreground">
              Technical Details
            </span>
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
