import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { mainnet } from "viem/chains";
import { useReadContract } from "wagmi";

import {
  CheckTheChainAbi,
  CheckTheChainAddress,
} from "@/constants/CheckTheChain";
import { CookbookAddress } from "@/constants/Cookbook";
import { useGetCoin } from "@/hooks/metadata/use-get-coin";
import { useZCurveSale } from "@/hooks/use-zcurve-sale";
import { SWAP_FEE, computePoolId } from "@/lib/swap";
import { computeZCurvePoolId } from "@/lib/zCurvePoolId";

import { CoinPreview } from "./CoinPreview";
import { CoinInfoCard } from "./CoinInfoCard";
import { UnifiedCoinTrading } from "./UnifiedCoinTrading";
import { VotePanel } from "./VotePanel";
import { PoolOverview } from "./PoolOverview";
import ErrorFallback, { ErrorBoundary } from "./ErrorBoundary";

export const UnifiedCoinView = ({ coinId }: { coinId: bigint }) => {
  const { t } = useTranslation();

  // Fetch coin metadata
  const { data: coinData, isLoading: isLoadingCoin } = useGetCoin({
    coinId: coinId.toString(),
    token: CookbookAddress,
  });

  // Check for zCurve sale
  const { data: zcurveSale } = useZCurveSale(coinId.toString());

  // Fetch ETH price for market cap calculation
  const { data: ethPriceData } = useReadContract({
    address: CheckTheChainAddress,
    abi: CheckTheChainAbi,
    functionName: "checkPrice",
    args: ["WETH"],
    chainId: mainnet.id,
    query: {
      staleTime: 60_000,
    },
  });

  // Extract coin data
  const [name, symbol, imageUrl, description, tokenURI, poolIds, swapFees] =
    useMemo(() => {
      if (!coinData) return ["", "", "", "", "", undefined, [100n]];
      const pools = coinData.pools.map((pool) => pool.poolId);
      const fees = coinData.pools.map((pool) => BigInt(pool.swapFee));
      return [
        coinData.name || "",
        coinData.symbol || "",
        coinData.imageUrl || "",
        coinData.description || "",
        coinData.tokenURI || "",
        pools,
        fees,
      ];
    }, [coinData]);

  // Calculate market cap in USD
  const marketCapUsd = useMemo(() => {
    if (!coinData || !ethPriceData) return null;

    const priceStr = ethPriceData[1];
    const ethPriceUsd = Number.parseFloat(priceStr);

    if (isNaN(ethPriceUsd) || ethPriceUsd === 0) return null;
    if (coinData.marketCapEth === undefined) return null;

    return coinData.marketCapEth * ethPriceUsd;
  }, [coinData, ethPriceData]);

  // Determine pool ID for AMM trading (after zCurve finalization)
  // For zCurve sales, always use 30 bps fee
  const poolId = zcurveSale
    ? computeZCurvePoolId(coinId, 30n) // Use hardcoded 30 bps for zCurve pools
    : poolIds?.[0] ||
      computePoolId(
        coinId,
        swapFees?.[0] ?? SWAP_FEE,
        CookbookAddress,
      ).toString();

  // Ensure poolId is always a string
  const poolIdString = typeof poolId === "bigint" ? poolId.toString() : poolId;

  return (
    <div className="w-full max-w-screen mx-auto flex flex-col gap-4 px-2 py-4 pb-16 sm:p-6 sm:pb-16">
      <Link
        to="/explore"
        className="text-sm self-start underline py-2 px-1 touch-manipulation"
      >
        ⬅︎ {t("navigation.back_to_explorer", "Back to Explorer")}
      </Link>

      <CoinPreview
        coinId={coinId}
        name={name}
        symbol={symbol}
        isLoading={isLoadingCoin}
      />

      <ErrorBoundary
        fallback={
          <ErrorFallback errorMessage="Error rendering Coin Info Card" />
        }
      >
        <CoinInfoCard
          coinId={coinId}
          name={name}
          symbol={symbol}
          description={
            description || t("coin.no_description", "No description available")
          }
          imageUrl={imageUrl}
          swapFee={swapFees}
          isOwner={false}
          type={"COOKBOOK"}
          marketCapEth={coinData?.marketCapEth ?? 0}
          marketCapUsd={marketCapUsd ?? 0}
          isEthPriceData={ethPriceData !== undefined}
          tokenURI={tokenURI}
          isLoading={isLoadingCoin}
        />
      </ErrorBoundary>

      {/* Unified Trading Interface */}
      <ErrorBoundary
        fallback={
          <ErrorFallback errorMessage="Error rendering trading interface" />
        }
      >
        <UnifiedCoinTrading
          coinId={coinId.toString()}
          coinName={name}
          coinSymbol={symbol}
          coinIcon={imageUrl}
          poolId={poolIdString}
        />
      </ErrorBoundary>

      {/* Vote Panel - only show if not in active zCurve sale */}
      {(!zcurveSale || zcurveSale.status !== "ACTIVE") && (
        <ErrorBoundary
          fallback={
            <ErrorFallback errorMessage="Error rendering voting panel" />
          }
        >
          <VotePanel coinId={coinId} />
        </ErrorBoundary>
      )}

      {/* Pool Overview - only show if AMM pool exists */}
      {(!zcurveSale || zcurveSale.status === "FINALIZED") && (
        <PoolOverview
          coinId={coinId.toString()}
          poolId={poolIdString}
          symbol={symbol}
          priceImpact={null}
        />
      )}
    </div>
  );
};
