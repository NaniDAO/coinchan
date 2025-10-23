import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Address, formatEther, formatUnits } from "viem";
import { useAccount } from "wagmi";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LockedSwapTile } from "@/components/LockedSwapTile";
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
import React from "react";
import { EnhancedPoolChart } from "./EnhancedPoolChart";
import { ETH_TOKEN, TokenMetadata } from "@/lib/pools";
import { CookbookAddress } from "@/constants/Cookbook";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { useGetCoin } from "@/hooks/metadata/use-get-coin";
import { ZDropsTable } from "./ZDropsTable";
import { useGetZDrops } from "@/hooks/use-get-z-drops";
import { CookbookFarmTab } from "./farm/CookbookFarmTab";
import { PoolInfoSection } from "./explorer/token/TokenInfoSection";
import ErrorFallback, { ErrorBoundary } from "./ErrorBoundary";
import { useCoinTotalSupply } from "@/hooks/use-coin-total-supply";
import { getSourceByContract } from "@/lib/protocol";
import { useGetPool } from "@/hooks/use-get-pool";

interface FinalizedPoolTradingProps {
  coinId: string;
  contractAddress?: Address;
  coinName?: string;
  coinSymbol?: string;
  coinIcon?: string;
  poolId?: string;
  totalSupply?: bigint;
}

function FinalizedPoolTradingInner({
  coinId,
  contractAddress,
  coinName,
  coinSymbol,
  coinIcon,
  poolId: providedPoolId,
  totalSupply,
}: FinalizedPoolTradingProps) {
  const { t } = useTranslation();
  const { address } = useAccount();
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<"swap" | "add" | "remove" | "airdrop" | "farm">("swap");
  const [hideFarm, setHideFarm] = useState(false);
  const { setSellToken, setBuyToken } = useTokenSelection();
  const { data: zDrops } = useGetZDrops({
    address,
    tokenIn: {
      address: contractAddress || CookbookAddress,
      id: BigInt(coinId),
    },
  });

  const [chartRefreshKey, setChartRefreshKey] = useState(0);

  const contractSource = getSourceByContract(contractAddress);
  const source = contractSource && contractSource !== "ERC20" ? contractSource : ("COOKBOOK" as const);

  // Fetch sale and user data
  const { data: sale } = useZCurveSale(coinId);
  const { data: pool } = useGetPool(providedPoolId ?? "", source);
  const { data: saleSummary } = useZCurveSaleSummary(coinId, address);
  const { data: userBalance } = useZCurveBalance(coinId, address);

  // Fetch coin data to get totalSupply if not provided
  const { data: coinData } = useGetCoin({
    coinId: coinId,
    token: contractAddress || CookbookAddress,
  });

  // Calculate pool ID and fee - use feeOrHook from sale data if available
  const { poolId, actualFee } = useMemo(() => {
    if (providedPoolId) {
      // If poolId is provided, extract fee from sale data
      const feeOrHook = sale?.feeOrHook ? BigInt(sale.feeOrHook) : pool?.swapFee ? BigInt(pool.swapFee) : 30n;
      const fee = feeOrHook < 10000n ? feeOrHook : 30n;
      return { poolId: providedPoolId, actualFee: fee };
    }
    // Use feeOrHook from sale data, default to 30 bps (0.3% fee) if not available
    const feeOrHook = sale?.feeOrHook ? BigInt(sale.feeOrHook) : 30n;
    // Check if feeOrHook is a simple fee (< 10000) or a hook address
    const finalFee = feeOrHook < 10000n ? feeOrHook : 30n; // Use actual fee or default to 30 bps for hooks
    const computedPoolId = computeZCurvePoolId(BigInt(coinId), finalFee);
    return { poolId: computedPoolId, actualFee: finalFee };
  }, [providedPoolId, pool, coinId, sale]);

  // Fetch pool reserves
  const { data: reserves, refetch: refetchReserves } = useReserves({
    poolId: poolId ? BigInt(poolId) : undefined,
    source,
  });

  // Fetch total supply from holder balances as a fallback
  const { data: holdersTotalSupply } = useCoinTotalSupply(coinId, reserves);

  // Calculate total supply - using the same reliable method
  const actualTotalSupply = useMemo(() => {
    // If totalSupply is provided as a prop, use it
    if (totalSupply && totalSupply > 0n) {
      return totalSupply;
    }

    // Try to get it from coinData (but check it's not 0)
    if (coinData?.totalSupply && coinData.totalSupply > 0n) {
      return coinData.totalSupply;
    }

    // Use the total calculated from holders as a fallback
    if (holdersTotalSupply && holdersTotalSupply > 0n) {
      return holdersTotalSupply;
    }

    // As a last resort, return null
    return null;
  }, [totalSupply, coinData, holdersTotalSupply]);

  // Create token metadata objects for ETH and the coin
  const ethToken = useMemo<TokenMeta>(
    () => ({
      id: null,
      symbol: "ETH",
      name: "Ethereum",
      decimals: 18,
      image: getEthereumIconDataUri(theme),
      imageUrl: getEthereumIconDataUri(theme),
      balance: 0n, // Will be fetched by components
      reserve0: reserves?.reserve0 || 0n,
      reserve1: reserves?.reserve1 || 0n,
      source: source,
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
      imageUrl: coinIcon || sale?.coin?.imageUrl || "",
      tokenUri: coinIcon || sale?.coin?.imageUrl || "",
      balance: 0n, // Will be fetched by components
      reserve0: reserves?.reserve0 || 0n,
      reserve1: reserves?.reserve1 || 0n,
      source: source,
    }),
    [coinId, coinSymbol, coinName, sale, coinIcon, reserves],
  );

  const { data: userTokenBalance } = useTokenBalance({
    token: {
      id: BigInt(coinId),
      address: CookbookAddress,
    },
    address,
  });

  const token = useMemo<TokenMetadata | undefined>(() => {
    const symbol = coinSymbol ?? sale?.coin?.symbol;
    const name = coinName ?? sale?.coin?.name;
    const imageUrl = coinIcon ?? sale?.coin?.imageUrl ?? "";

    // Strictly bail if any required token fields aren't loaded yet
    if (symbol === undefined || name === undefined || imageUrl === undefined) return undefined;

    // Safely parse id
    if (coinId == null) return undefined;
    let id: bigint;
    try {
      id = BigInt(coinId);
    } catch {
      return undefined;
    }

    return {
      id,
      address: contractAddress || CookbookAddress,
      symbol,
      name,
      decimals: 18,
      imageUrl,
      balance: userTokenBalance,
      standard: "ERC6909",
    };
  }, [
    coinId,
    coinSymbol,
    coinName,
    coinIcon,
    sale?.coin?.symbol,
    sale?.coin?.name,
    sale?.coin?.imageUrl,
    userTokenBalance,
  ]);

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

    // Use actual total supply from the indexer (in wei, so format it)
    // Never fall back to a hardcoded value - show N/A if not available
    const supply = actualTotalSupply ? Number(formatEther(actualTotalSupply)) : null;
    const marketCapInEth = supply ? price * supply : 0;
    const marketCap = supply ? usdPrice * supply : 0;

    return {
      coinPrice: price,
      coinUsdPrice: usdPrice,
      marketCapUsd: marketCap,
      marketCapEth: marketCapInEth,
    };
  }, [reserves, ethPrice?.priceUSD, poolId, actualTotalSupply]);

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
            priceImpact={undefined}
            onTransactionSuccess={() => {
              refetchReserves();
              setChartRefreshKey((prev) => prev + 1);
            }}
          />
        </div>

        <Tabs
          className="order-1 lg:order-2 col-span-1 lg:col-span-3"
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as any)}
        >
          {/* Tabs at the top */}
          <TabsList className="bg-muted/50 rounded-lg p-1 w-full flex justify-between">
            <TabsTrigger
              value="swap"
              className="flex-1 px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              {t("common.swap")}
            </TabsTrigger>
            <TabsTrigger
              value="add"
              className="flex-1 px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              {t("common.add")}
            </TabsTrigger>
            <TabsTrigger
              value="remove"
              className="flex-1 px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              {t("common.remove")}
            </TabsTrigger>
            <TabsTrigger
              value="airdrop"
              className="flex-1 px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              {t("common.airdrop")}
            </TabsTrigger>
            {hideFarm === true ? null : (
              <TabsTrigger
                value="farm"
                className="flex-1 px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                {t("common.farm", "Farm")}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="swap" className="mt-4">
            <ErrorBoundary fallback={<div>Error loading LockedSwapTile</div>}>
              {/* Swap Section - Desktop: Right, Mobile: Top */}
              <div className="w-full">{token ? <LockedSwapTile token={token} /> : <div>loading...</div>}</div>
            </ErrorBoundary>
          </TabsContent>
          <TabsContent value="add" className="mt-4">
            <div className="w-full">
              <ZCurveAddLiquidity
                coinId={coinId}
                contractAddress={contractAddress}
                source={source}
                poolId={poolId}
                feeOrHook={actualFee}
              />
            </div>
          </TabsContent>
          <TabsContent value="remove" className="mt-4">
            <div className="w-full">
              {/* Remove Liquidity Form */}
              <ZCurveRemoveLiquidity
                coinId={coinId}
                contractAddress={contractAddress}
                source={source}
                poolId={poolId}
                feeOrHook={actualFee}
              />
            </div>
          </TabsContent>
          <TabsContent value="airdrop" className="mt-4">
            {zDrops ? (
              <ZDropsTable zDrops={zDrops} />
            ) : (
              <div className="text-center text-muted-foreground">{t("coin.no_airdrops", "No Airdrops Available")}</div>
            )}
          </TabsContent>
          <TabsContent value="farm" className="mt-4">
            <CookbookFarmTab
              setHide={setHideFarm}
              poolId={poolId}
              contractAddress={contractAddress}
              source={source}
              coinId={coinId}
              coinSymbol={coinSymbol || coinToken.symbol}
              swapFee={actualFee}
            />
          </TabsContent>
        </Tabs>
      </div>

      <ErrorBoundary fallback={<ErrorFallback errorMessage="Error loading Pool Info" />}>
        {/* Info Section */}
        <PoolInfoSection
          tokenA={ETH_TOKEN} // @TODO Hardcoded FIX
          tokenB={token}
          reserves={reserves}
          price={coinPrice}
          priceUsd={coinUsdPrice}
          ethPrice={ethPrice}
          marketCapEth={marketCapEth}
          marketCapUsd={marketCapUsd}
          fee={actualFee}
          poolId={poolId}
          totalSupply={actualTotalSupply}
        />
      </ErrorBoundary>
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
