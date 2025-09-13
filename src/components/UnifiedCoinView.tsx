import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatEther } from "viem";

import { CookbookAddress } from "@/constants/Cookbook";
import { useGetCoin } from "@/hooks/metadata/use-get-coin";
import { useZCurveSale } from "@/hooks/use-zcurve-sale";
import { SWAP_FEE, computePoolId } from "@/lib/swap";
import { computeZCurvePoolId } from "@/lib/zCurvePoolId";
import { useReserves } from "@/hooks/use-reserves";
import { ZCURVE_STANDARD_PARAMS } from "@/lib/zCurveHelpers";
import { useETHPrice } from "@/hooks/use-eth-price";

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
  const { data: ethPriceData } = useETHPrice();

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

  // Determine pool ID first (needed for reserves)
  const poolId = useMemo(() => {
    if (zcurveSale) {
      const feeOrHook = BigInt(zcurveSale.feeOrHook || 30n);
      const actualFee = feeOrHook < 10000n ? feeOrHook : 30n;
      return computeZCurvePoolId(coinId, actualFee);
    }
    return (
      poolIds?.[0] ||
      computePoolId(
        coinId,
        swapFees?.[0] ?? SWAP_FEE,
        CookbookAddress,
      ).toString()
    );
  }, [zcurveSale, coinId, poolIds, swapFees]);

  // Fetch pool reserves for finalized zCurve sales
  const { data: reserves } = useReserves({
    poolId:
      zcurveSale && zcurveSale.status === "FINALIZED" && poolId
        ? BigInt(poolId)
        : undefined,
    source: "COOKBOOK" as const,
  });

  // Calculate market cap based on phase
  const { marketCapEth, marketCapUsd, effectiveSwapFee, isZCurveBonding } =
    useMemo(() => {
      if (!ethPriceData) {
        return {
          marketCapEth: null,
          marketCapUsd: null,
          effectiveSwapFee: swapFees,
          isZCurveBonding: false,
        };
      }

      const ethPriceUsd = ethPriceData.priceUSD;

      if (isNaN(ethPriceUsd) || ethPriceUsd === 0) {
        return {
          marketCapEth: null,
          marketCapUsd: null,
          effectiveSwapFee: swapFees,
          isZCurveBonding: false,
        };
      }

      // Check if in active zCurve bonding phase
      if (zcurveSale && zcurveSale.status === "ACTIVE") {
        // During bonding curve phase - use hardcoded 1 billion total supply for zCurve tokens
        const totalSupply = ZCURVE_STANDARD_PARAMS.TOTAL_SUPPLY;

        // For market cap calculation during bonding curve, use a more intuitive approach:
        // Calculate based on what it would cost to buy the remaining supply at current prices

        const ethEscrow = BigInt(zcurveSale.ethEscrow || "0");
        const netSold = BigInt(zcurveSale.netSold || "0");
        const saleCap = BigInt(
          zcurveSale.saleCap || ZCURVE_STANDARD_PARAMS.SALE_CAP,
        );

        // First, try using the current marginal price if we have meaningful sales
        const currentPriceWei = BigInt(zcurveSale.currentPrice || "0");

        if (netSold > 0n && ethEscrow > 0n) {
          // Calculate average price paid so far
          const avgPriceWei = (ethEscrow * 10n ** 18n) / netSold;

          // For very early sales, use the average price as it's more representative
          // For later sales, we could use the marginal price
          // A good heuristic: if less than 1% sold, use average price
          const percentSold = (netSold * 100n) / saleCap;

          let effectivePriceWei: bigint;
          if (percentSold < 1n && avgPriceWei > 0n) {
            // Very early stage - use average price
            effectivePriceWei = avgPriceWei;
          } else if (currentPriceWei > 0n) {
            // Use current marginal price
            effectivePriceWei = currentPriceWei;
          } else {
            // Fallback to average
            effectivePriceWei = avgPriceWei;
          }

          // Calculate market cap using the effective price
          const marketCapWei = (totalSupply * effectivePriceWei) / 10n ** 18n;

          if (marketCapWei > 0n) {
            const impliedMarketCapEth = Number(formatEther(marketCapWei));

            return {
              marketCapEth: impliedMarketCapEth,
              marketCapUsd: impliedMarketCapEth * ethPriceUsd,
              effectiveSwapFee: [0n], // 0% during bonding
              isZCurveBonding: true,
            };
          }
        }

        // If we have a current price but no sales yet, use it
        if (currentPriceWei > 0n) {
          const marketCapWei = (totalSupply * currentPriceWei) / 10n ** 18n;
          if (marketCapWei > 0n) {
            const impliedMarketCapEth = Number(formatEther(marketCapWei));

            return {
              marketCapEth: impliedMarketCapEth,
              marketCapUsd: impliedMarketCapEth * ethPriceUsd,
              effectiveSwapFee: [0n], // 0% during bonding
              isZCurveBonding: true,
            };
          }
        }

        return {
          marketCapEth: 0,
          marketCapUsd: 0,
          effectiveSwapFee: [0n], // 0% during bonding
          isZCurveBonding: true,
        };
      }

      // For finalized AMM pools (including graduated zCurve)
      let actualSwapFee = swapFees;
      if (zcurveSale && zcurveSale.status === "FINALIZED") {
        // Extract the actual fee from feeOrHook (it's stored as basis points)
        const feeOrHook = BigInt(zcurveSale.feeOrHook);
        // Check if it's a simple fee (not a hook address)
        if (feeOrHook < 10000n) {
          actualSwapFee = [feeOrHook];
        } else {
          // Default to 30 bps if it's a hook
          actualSwapFee = [30n];
        }
      }

      // Calculate market cap from reserves if available (for finalized zCurve sales)
      if (
        zcurveSale &&
        zcurveSale.status === "FINALIZED" &&
        reserves &&
        reserves.reserve0 > 0n &&
        reserves.reserve1 > 0n
      ) {
        const ethReserve = Number(formatEther(reserves.reserve0));
        const tokenReserve = Number(formatEther(reserves.reserve1));
        const price = ethReserve / tokenReserve;
        const totalSupply = 1_000_000_000; // 1 billion tokens
        const marketCapEth = price * totalSupply;
        const marketCapUsd = marketCapEth * ethPriceUsd;

        return {
          marketCapEth: marketCapEth,
          marketCapUsd: marketCapUsd,
          effectiveSwapFee: actualSwapFee,
          isZCurveBonding: false,
        };
      }

      return {
        marketCapEth: coinData?.marketCapEth ?? null,
        marketCapUsd: coinData?.marketCapEth
          ? coinData.marketCapEth * ethPriceUsd
          : null,
        effectiveSwapFee: actualSwapFee,
        isZCurveBonding: false,
      };
    }, [coinData, ethPriceData, zcurveSale, swapFees, reserves]);

  // Ensure poolId is always a string
  const poolIdString = typeof poolId === "bigint" ? poolId.toString() : poolId;

  return (
    <div className="w-full max-w-screen mx-auto flex flex-col gap-4 px-2 py-4 pb-16 sm:p-6 sm:pb-16">
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
          swapFee={effectiveSwapFee}
          isOwner={false}
          type={"COOKBOOK"}
          marketCapEth={marketCapEth ?? 0}
          marketCapUsd={marketCapUsd ?? 0}
          isEthPriceData={ethPriceData !== undefined}
          tokenURI={tokenURI}
          isLoading={isLoadingCoin}
          isZCurveBonding={isZCurveBonding}
          zcurveFeeOrHook={zcurveSale?.feeOrHook}
          creator={zcurveSale?.creator}
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
          token={CookbookAddress}
          priceImpact={null}
        />
      )}
    </div>
  );
};
