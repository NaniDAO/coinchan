import { useTranslation } from "react-i18next";
import { formatEther, formatUnits } from "viem";
import { CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import type { ZCurveSale } from "@/hooks/use-zcurve-sale";
import { unpackQuadCap, UNIT_SCALE, ZCURVE_STANDARD_PARAMS } from "@/lib/zCurveHelpers";
import { useZCurveSaleSummary, useZCurveFinalization } from "@/hooks/use-zcurve-sale";
import { useAccount } from "wagmi";
import { useMemo, memo } from "react";
import { computeZCurvePoolId } from "@/lib/zCurvePoolId";
import { useReserves } from "@/hooks/use-reserves";
import { useETHPrice } from "@/hooks/use-eth-price";

interface ZCurveSaleProgressProps {
  sale: ZCurveSale;
}

// Helper function to safely convert to BigInt
const toBigInt = (value: string | bigint | undefined): bigint => {
  if (!value) return 0n;
  return typeof value === "bigint" ? value : BigInt(value);
};

// Helper function to get the appropriate price for display
const getDisplayPrice = (
  isFinalized: boolean,
  marketPriceInWei: bigint,
  currentPrice: string | undefined,
  finalizationData: any,
  netSold: bigint,
  ethEscrow: bigint,
): bigint => {
  // For active sales, use the current price from the sale
  if (!isFinalized) {
    return currentPrice ? toBigInt(currentPrice) : 0n;
  }

  // For finalized sales, prefer market price from AMM pool
  if (marketPriceInWei > 0n) {
    return marketPriceInWei;
  }

  // If no market price, use finalization event data (exact LP seeding price)
  if (finalizationData?.ethLp && finalizationData?.coinLp) {
    const ethLp = toBigInt(finalizationData.ethLp);
    const coinLp = toBigInt(finalizationData.coinLp);
    if (ethLp > 0n && coinLp > 0n) {
      return (ethLp * BigInt(1e18)) / coinLp;
    }
  }

  // Last resort: calculate average price from sale (not ideal but better than 0)
  if (netSold > 0n && ethEscrow > 0n) {
    return (ethEscrow * BigInt(1e18)) / netSold;
  }

  return 0n;
};

// Helper function to format price display
const formatPriceDisplay = (priceInWei: bigint, ethPrice?: number): string | JSX.Element => {
  const price = Number(formatEther(priceInWei));

  if (price === 0) return "0 ETH";

  // For very small prices, show USD value if available
  if (price < 1e-6 && ethPrice) {
    const usdPrice = price * ethPrice;
    if (usdPrice < 0.000001) {
      return `$${usdPrice.toExponential(2)}`;
    }
    if (usdPrice < 0.01) {
      // Show with appropriate decimal places
      const decimals = Math.max(2, -Math.floor(Math.log10(usdPrice)) + 2);
      return `$${usdPrice.toFixed(decimals)}`;
    }
    return `$${usdPrice.toFixed(6)}`;
  }

  // Format very small ETH prices
  if (price < 1e-9) {
    return `${price.toExponential(2)} ETH`;
  }
  if (price < 1e-6) {
    return `${(price * 1e6).toFixed(3)} μETH`;
  }
  if (price < 0.001) {
    return `${(price * 1000).toFixed(4)} mETH`;
  }
  if (price < 0.01) {
    return `${price.toFixed(8)} ETH`;
  }
  return `${price.toFixed(6)} ETH`;
};

// Helper to format token amounts
const formatTokenAmount = (value: number): string => {
  if (value === 0) return "0";
  if (value < 1000) return value.toFixed(0);
  if (value < 1000000) return (value / 1000).toFixed(1) + "K";
  return (value / 1000000).toFixed(1) + "M";
};

// Helper to format coins per ETH
const formatCoinsPerEth = (priceInWei: bigint): string => {
  if (priceInWei === 0n) return "";

  const oneEth = BigInt(1e18);
  const coinsPerEth = (oneEth * oneEth) / priceInWei;
  const coinsPerEthNumber = Number(formatEther(coinsPerEth));

  // Format very large numbers with appropriate suffixes
  if (coinsPerEthNumber >= 1e15) {
    return `${(coinsPerEthNumber / 1e15).toFixed(2)}Q per ETH`; // Quadrillion
  } else if (coinsPerEthNumber >= 1e12) {
    return `${(coinsPerEthNumber / 1e12).toFixed(2)}T per ETH`; // Trillion
  } else if (coinsPerEthNumber >= 1e9) {
    return `${(coinsPerEthNumber / 1e9).toFixed(2)}B per ETH`; // Billion
  } else if (coinsPerEthNumber >= 1e6) {
    return `${(coinsPerEthNumber / 1e6).toFixed(2)}M per ETH`; // Million
  } else if (coinsPerEthNumber >= 1e3) {
    return `${(coinsPerEthNumber / 1e3).toFixed(2)}K per ETH`; // Thousand
  } else if (coinsPerEthNumber >= 1) {
    return `${coinsPerEthNumber.toFixed(0)} per ETH`;
  } else {
    return `${coinsPerEthNumber.toFixed(4)} per ETH`;
  }
};

// Helper to format ETH amounts
const formatEthAmount = (ethValue: number): string => {
  if (ethValue === 0) return "0";
  if (ethValue < 0.0001) return ethValue.toFixed(9);
  if (ethValue < 0.01) return ethValue.toFixed(6);
  if (ethValue < 1) return ethValue.toFixed(4);
  return ethValue.toFixed(2);
};

export const ZCurveSaleProgress = memo(({ sale }: ZCurveSaleProgressProps) => {
  const { t } = useTranslation();
  const { address } = useAccount();

  // Validate input
  if (!sale || !sale.coinId) {
    return null;
  }

  // Get real-time onchain data
  const { data: onchainData } = useZCurveSaleSummary(sale.coinId, address);
  const { data: finalizationData } = useZCurveFinalization(sale.coinId);

  // Memoize data conversions
  const saleData = useMemo(() => {
    const netSold = toBigInt(onchainData?.netSold || sale.netSold);
    const saleCap = toBigInt(onchainData?.saleCap || sale.saleCap);
    const ethEscrow = toBigInt(onchainData?.ethEscrow || sale.ethEscrow);
    const ethTarget = toBigInt(onchainData?.ethTarget || sale.ethTarget);
    const quadCap = unpackQuadCap(toBigInt(onchainData?.quadCap || sale.quadCap));
    // Finalized when creator address is 0x0 (contract deletes the sale)
    const isFinalized = onchainData ? onchainData.isFinalized : sale.status === "FINALIZED";
    const feeOrHook = toBigInt(onchainData?.feeOrHook || sale.feeOrHook);

    return { netSold, saleCap, ethEscrow, ethTarget, quadCap, isFinalized, feeOrHook };
  }, [onchainData, sale]);

  // Calculate pool ID for finalized sales
  const poolId = useMemo(() => {
    if (!saleData.isFinalized) return null;
    // Use feeOrHook from sale data, default to 30 bps (0.3% fee) if not available
    const finalFee = saleData.feeOrHook < 10000n ? saleData.feeOrHook : 30n; // Use actual fee or default to 30 bps for hooks
    return computeZCurvePoolId(BigInt(sale.coinId), finalFee);
  }, [saleData.isFinalized, sale.coinId, saleData.feeOrHook]);

  // Fetch pool reserves and ETH price for finalized sales
  const { data: reserves, error: reservesError } = useReserves({
    poolId: poolId ? BigInt(poolId) : undefined,
    source: "COOKBOOK" as const,
  });
  const { data: ethPrice } = useETHPrice();

  // Log errors for debugging but don't crash
  if (reservesError) {
    console.error("Failed to fetch reserves:", reservesError);
  }

  // Memoize percentages - optimized for standard parameters
  const percentages = useMemo(() => {
    // Optimize for standard sale cap (800M tokens)
    const soldPercentage =
      saleData.saleCap === ZCURVE_STANDARD_PARAMS.SALE_CAP
        ? Number((saleData.netSold * 100n) / ZCURVE_STANDARD_PARAMS.SALE_CAP)
        : saleData.saleCap > 0n
          ? Number((saleData.netSold * 100n) / saleData.saleCap)
          : 0;

    // Optimize for standard ETH target (10 ETH)
    const fundedPercentage =
      saleData.ethTarget === ZCURVE_STANDARD_PARAMS.ETH_TARGET
        ? Number((saleData.ethEscrow * 10000n) / ZCURVE_STANDARD_PARAMS.ETH_TARGET) / 100
        : saleData.ethTarget > 0n
          ? Number((saleData.ethEscrow * 10000n) / saleData.ethTarget) / 100
          : 0;

    // Optimize for standard quad cap (552M tokens = 69% of 800M)
    const quadCapPercentage =
      saleData.quadCap === ZCURVE_STANDARD_PARAMS.QUAD_CAP && saleData.saleCap === ZCURVE_STANDARD_PARAMS.SALE_CAP
        ? 69 // Hardcoded 69% for standard params
        : saleData.saleCap > 0n
          ? Number((saleData.quadCap * 100n) / saleData.saleCap)
          : 0;

    return { soldPercentage, fundedPercentage, quadCapPercentage };
  }, [saleData]);

  // Calculate market price and market cap for finalized sales
  const { marketPriceInWei, marketCapUsd } = useMemo(() => {
    if (!saleData.isFinalized || !reserves || reserves.reserve0 === 0n || reserves.reserve1 === 0n) {
      return { marketPriceInWei: 0n, marketCapUsd: 0 };
    }

    // Price = ETH reserve / Token reserve
    const ethReserve = Number(formatEther(reserves.reserve0));
    const tokenReserve = Number(formatUnits(reserves.reserve1, 18));
    const price = ethReserve / tokenReserve;

    // Convert to wei for calculations
    const priceInWei = (reserves.reserve0 * BigInt(1e18)) / reserves.reserve1;

    const usdPrice = price * (ethPrice?.priceUSD || 0);
    // Use standard total supply constant
    const totalSupply = ZCURVE_STANDARD_PARAMS.TOTAL_SUPPLY;
    const marketCap = usdPrice * Number(formatUnits(totalSupply, 18));

    return {
      marketPriceInWei: priceInWei,
      marketCapUsd: marketCap,
    };
  }, [saleData.isFinalized, reserves, ethPrice?.priceUSD]);

  // Calculate display price once
  const displayPriceInWei = useMemo(() => {
    // Special case: if netSold < 2 * UNIT_SCALE, the contract won't create a pool
    if (saleData.isFinalized && saleData.netSold < 2n * UNIT_SCALE) {
      return 0n; // No market price exists
    }

    return getDisplayPrice(
      saleData.isFinalized,
      marketPriceInWei,
      onchainData?.currentPrice || sale.currentPrice,
      finalizationData,
      saleData.netSold,
      saleData.ethEscrow,
    );
  }, [
    saleData.isFinalized,
    marketPriceInWei,
    onchainData?.currentPrice,
    sale.currentPrice,
    finalizationData,
    saleData.netSold,
    saleData.ethEscrow,
  ]);

  // Format values for display
  const displayValues = useMemo(() => {
    const priceInEth = Number(formatEther(displayPriceInWei));
    const usdPrice = priceInEth * (ethPrice?.priceUSD || 0);

    return {
      ethAmount: formatEthAmount(Number(formatEther(saleData.ethEscrow))),
      netSoldFormatted: formatTokenAmount(Number(formatEther(saleData.netSold))),
      saleCapFormatted: formatTokenAmount(Number(formatEther(saleData.saleCap))),
      priceDisplay: formatPriceDisplay(displayPriceInWei, ethPrice?.priceUSD),
      coinsPerEth: formatCoinsPerEth(displayPriceInWei),
      usdPrice: usdPrice,
      showUsdPrice: usdPrice > 0 && priceInEth < 0.001, // Show USD for small prices
    };
  }, [saleData.ethEscrow, saleData.netSold, saleData.saleCap, displayPriceInWei, ethPrice?.priceUSD]);

  return (
    <CardContent className="space-y-4 h-fit">
      {/* Funding Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t("sale.funding_progress", "Funding Progress")}</span>
          <span className="font-medium">{percentages.fundedPercentage.toFixed(1)}%</span>
        </div>
        <Progress value={percentages.fundedPercentage} className="h-3" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{displayValues.ethAmount} ETH</span>
          <span>
            {t("sale.target", "Target")}:{" "}
            {saleData.ethTarget === ZCURVE_STANDARD_PARAMS.ETH_TARGET ? "10" : formatEther(saleData.ethTarget)} ETH
          </span>
        </div>
      </div>

      <Separator />

      {/* Sale Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t("sale.tokens_sold", "Tokens Sold")}</span>
          <span className="font-medium">{percentages.soldPercentage.toFixed(1)}%</span>
        </div>
        <div className="relative">
          <Progress value={percentages.soldPercentage} className="h-3" />
          {/* Quadratic cap indicator */}
          {percentages.quadCapPercentage > 0 && percentages.quadCapPercentage < 100 && (
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-primary/50"
              style={{ left: `${percentages.quadCapPercentage}%` }}
              title={t("sale.quadratic_cap", "Quadratic pricing ends here")}
            />
          )}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {displayValues.netSoldFormatted} {t("common.sold", "sold")}
          </span>
          <span>
            {saleData.saleCap === ZCURVE_STANDARD_PARAMS.SALE_CAP ? "800M" : displayValues.saleCapFormatted}{" "}
            {t("common.cap", "cap")}
          </span>
        </div>
        {saleData.saleCap > 0n && (
          <div className="text-xs text-muted-foreground text-center">
            {percentages.soldPercentage.toFixed(2)}% {t("sale.of_total_supply", "of total supply")}
          </div>
        )}
      </div>

      {/* Price Info */}
      <div className="grid grid-cols-2 gap-4 pt-2">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {saleData.isFinalized
              ? marketPriceInWei > 0n
                ? t("sale.market_price", "Market Price")
                : t("sale.final_price", "Final Price")
              : t("sale.current_price", "Current Price")}
          </p>
          <p className="text-sm font-medium">{displayValues.priceDisplay}</p>
          {/* Show ETH price in small text if displaying USD */}
          {displayValues.showUsdPrice && displayPriceInWei > 0n && (
            <p className="text-xs text-muted-foreground">
              {Number(formatEther(displayPriceInWei)).toExponential(2)} ETH
            </p>
          )}
          {/* Coins per 1 ETH display */}
          <p className="text-xs text-muted-foreground mt-0.5">{displayValues.coinsPerEth}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {saleData.isFinalized ? t("sale.market_cap", "Market Cap") : t("sale.pricing_phase", "Pricing Phase")}
          </p>
          <p className="text-sm font-medium">
            {saleData.isFinalized
              ? marketCapUsd > 0
                ? marketCapUsd > 1e9
                  ? `$${(marketCapUsd / 1e9).toFixed(2)}B`
                  : marketCapUsd > 1e6
                    ? `$${(marketCapUsd / 1e6).toFixed(2)}M`
                    : `$${(marketCapUsd / 1e3).toFixed(2)}K`
                : `${Number(formatEther(saleData.ethEscrow)).toFixed(4)} ETH raised`
              : saleData.netSold < saleData.quadCap
                ? t("sale.quadratic", "Quadratic")
                : t("sale.linear", "Linear")}
          </p>
          {saleData.isFinalized && marketCapUsd > 0 && (
            <p className="text-xs text-muted-foreground">
              {Number(formatEther(saleData.ethEscrow)).toFixed(2)} ETH raised
            </p>
          )}
          {!saleData.isFinalized && saleData.netSold < saleData.quadCap && saleData.quadCap > 0n && (
            <p className="text-xs text-muted-foreground">
              {(100 - (Number(saleData.netSold) / Number(saleData.quadCap)) * 100).toFixed(1)}%{" "}
              {t("sale.to_linear", "to linear")}
            </p>
          )}
        </div>
      </div>

      {/* Auto-finalization note or finalized status */}
      {saleData.isFinalized ? (
        <div className="text-xs text-green-600 dark:text-green-400 text-center pt-2">
          {saleData.netSold < 2n * UNIT_SCALE
            ? t("sale.finalized_no_pool", "Sale finalized. No pool created (insufficient volume).")
            : t("sale.finalized_success", "Sale finalized successfully. Pool created on zAMM.")}
        </div>
      ) : percentages.fundedPercentage >= 90 || percentages.soldPercentage >= 90 ? (
        <div className="text-xs text-amber-600 dark:text-amber-400 text-center pt-2">
          {percentages.soldPercentage >= 90
            ? t("sale.near_sold_out", "Sale will auto-finalize when sold out")
            : t("sale.near_target", "Sale will auto-finalize when target is reached")}
        </div>
      ) : null}
    </CardContent>
  );
});

ZCurveSaleProgress.displayName = "ZCurveSaleProgress";
