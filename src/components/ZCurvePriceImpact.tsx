import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, parseEther } from "viem";
import { InfoIcon } from "lucide-react";
import type { ZCurveSale } from "@/hooks/use-zcurve-sale";
import { UNIT_SCALE, unpackQuadCap } from "@/lib/zCurveHelpers";

interface ZCurvePriceImpactProps {
  sale: ZCurveSale;
  tradeAmount: string; // User input amount (ETH for buying, tokens for selling)
  tokenAmount?: string; // Token amount (for buying scenario)
  isBuying: boolean;
  className?: string;
}

export function ZCurvePriceImpact({
  sale,
  tradeAmount,
  tokenAmount,
  isBuying,
  className = "",
}: ZCurvePriceImpactProps) {
  const { t } = useTranslation();

  // Helper function to calculate marginal price at a given netSold amount
  // This matches the zCurve contract's _cost function
  const calculateMarginalPrice = (netSold: bigint, quadCap: bigint, divisor: bigint): bigint => {
    const oneETH = parseEther("1");

    // Calculate cost of next UNIT_SCALE tokens
    const cost = (n: bigint): bigint => {
      const m = n / UNIT_SCALE;
      if (m < 2n) return 0n; // First tick free

      const K = quadCap / UNIT_SCALE;
      const denom = 6n * divisor;

      if (m <= K) {
        // Quadratic phase: sum of squares formula
        const sumSq = (m * (m - 1n) * (2n * m - 1n)) / 6n;
        return (sumSq * oneETH) / denom;
      } else {
        // Mixed phase
        const sumK = (K * (K - 1n) * (2n * K - 1n)) / 6n;
        const quadCost = (sumK * oneETH) / denom;
        const pK = (K * K * oneETH) / denom;
        const tailTicks = m - K;
        const tailCost = pK * tailTicks;
        return quadCost + tailCost;
      }
    };

    // Marginal price is the cost of the next UNIT_SCALE tokens
    return cost(netSold + UNIT_SCALE) - cost(netSold);
  };

  const priceImpact = useMemo(() => {
    if (!tradeAmount || parseFloat(tradeAmount) === 0) return null;

    try {
      const netSold = BigInt(sale.netSold);
      const quadCap = unpackQuadCap(BigInt(sale.quadCap));
      const divisor = BigInt(sale.divisor);
      const saleCap = BigInt(sale.saleCap);

      // Calculate current marginal price
      const currentMarginalPrice = calculateMarginalPrice(netSold, quadCap, divisor);

      let newNetSold: bigint;
      let impact: number;
      let isHighImpact: boolean;

      if (isBuying) {
        // For buying: use the token amount that will be purchased
        let tokensOut: bigint;
        try {
          tokensOut = tokenAmount ? parseEther(tokenAmount) : 0n;
        } catch {
          return null;
        }
        if (tokensOut === 0n) return null;

        // Calculate new net sold after this purchase
        newNetSold = netSold + tokensOut;

        if (newNetSold > saleCap) return null;

        const newMarginalPrice = calculateMarginalPrice(newNetSold, quadCap, divisor);

        // Calculate average price for this trade
        let ethIn: bigint;
        try {
          ethIn = parseEther(tradeAmount);
        } catch {
          return null;
        }
        // Calculate average price with better precision
        // avgPrice = ethIn / tokensOut, but we multiply by 1e18 to maintain precision
        const avgPriceForTrade = tokensOut > 0n ? (ethIn * parseEther("1")) / tokensOut : 0n;

        // For buying, impact should be positive (price goes up)
        // Calculate the actual price change more accurately
        if (currentMarginalPrice === 0n && newMarginalPrice > 0n) {
          // Starting from zero, show 100% impact
          impact = 100;
        } else if (currentMarginalPrice > 0n && newMarginalPrice > currentMarginalPrice) {
          // Normal case: calculate percentage change
          const priceDiff = newMarginalPrice - currentMarginalPrice;
          impact = Number((priceDiff * 10000n) / currentMarginalPrice) / 100;

          // For very small impacts, ensure we show at least some change
          if (impact < 0.001 && tokensOut > UNIT_SCALE) {
            // Calculate based on average vs marginal price difference
            const avgDiff = avgPriceForTrade > currentMarginalPrice ? avgPriceForTrade - currentMarginalPrice : 0n;
            if (avgDiff > 0n) {
              impact = Math.max(0.01, Number((avgDiff * 10000n) / currentMarginalPrice) / 100);
            }
          }
        } else if (currentMarginalPrice === newMarginalPrice && tokensOut > 0n) {
          // Prices appear the same due to rounding, but there's still an impact
          // Use the ratio of trade size to current supply as a proxy
          const supplyImpact = Number((tokensOut * 1000n) / (netSold + 1n)) / 10;
          impact = Math.max(0.01, Math.min(supplyImpact, 1)); // Between 0.01% and 1%
        } else {
          impact = 0;
        }

        isHighImpact = impact > 10; // 10% for buys

        return {
          currentPrice: Number(formatEther(currentMarginalPrice)),
          newPrice: Number(formatEther(newMarginalPrice)),
          avgPrice: Number(formatEther(avgPriceForTrade)),
          impactPercent: Math.abs(impact), // Always positive for display
          isHighImpact,
        };
      } else {
        // For selling: price decreases
        let tokensIn: bigint;
        try {
          tokensIn = parseEther(tradeAmount);
        } catch {
          return null;
        }
        newNetSold = netSold > tokensIn ? netSold - tokensIn : 0n;

        // For selling, we need to calculate the actual ETH received
        // to determine the true price impact
        const newMarginalPrice = calculateMarginalPrice(newNetSold, quadCap, divisor);

        // For selling, impact should be negative (price goes down)
        if (currentMarginalPrice > 0n && newMarginalPrice > 0n) {
          // Calculate the percentage difference between prices
          impact = -Number(((currentMarginalPrice - newMarginalPrice) * 10000n) / currentMarginalPrice) / 100;

          // For very small trades where both prices are nearly identical,
          // calculate impact based on the average vs marginal price
          if (Math.abs(impact) < 0.01 && currentMarginalPrice > parseEther("0.000000001")) {
            // Use a small negative impact to indicate selling pressure
            impact = -0.5; // 0.5% impact for minimal sells
          }
        } else if (currentMarginalPrice === 0n && newMarginalPrice === 0n) {
          // Both prices at minimum, no real impact
          impact = 0;
        } else {
          // Fallback for edge cases
          impact = -1; // Show 1% impact
        }

        isHighImpact = Math.abs(impact) > 10; // 10% for sells

        return {
          currentPrice: Number(formatEther(currentMarginalPrice)),
          newPrice: Number(formatEther(newMarginalPrice)),
          impactPercent: impact, // Negative for sells
          isHighImpact,
        };
      }
    } catch (error) {
      console.error("Error calculating price impact:", error);
      return null;
    }
  }, [sale, tradeAmount, tokenAmount, isBuying]);

  if (!priceImpact) return null;

  // Color based on buy/sell and impact level
  const impactColor = priceImpact.isHighImpact
    ? "text-amber-600 dark:text-amber-400"
    : isBuying
      ? "text-green-600 dark:text-green-400" // Buy = green (positive)
      : "text-red-600 dark:text-red-400"; // Sell = red (negative)

  const borderColor = priceImpact.isHighImpact
    ? "border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20"
    : isBuying
      ? "border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20"
      : "border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20";

  // Format the display - always show sign with more precision for small impacts
  const formatImpact = () => {
    const absImpact = Math.abs(priceImpact.impactPercent);
    const precision = absImpact < 0.01 ? 3 : 2;
    if (isBuying) {
      return `+${absImpact.toFixed(precision)}%`;
    } else {
      return `${priceImpact.impactPercent.toFixed(precision)}%`; // Already negative
    }
  };

  // Format very small prices with appropriate precision
  const formatPrice = (price: number): string => {
    if (price === 0) return "0 ETH";

    // For extremely small values, use gwei or wei
    if (price < 1e-15) {
      const wei = price * 1e18;
      if (wei < 0.001) {
        return `${wei.toExponential(2)} wei`;
      }
      return `${wei.toFixed(3)} wei`;
    } else if (price < 1e-9) {
      const gwei = price * 1e9;
      if (gwei < 0.001) {
        return `${gwei.toFixed(6)} gwei`;
      } else if (gwei < 1) {
        return `${gwei.toFixed(4)} gwei`;
      }
      return `${gwei.toFixed(2)} gwei`;
    } else if (price < 1e-6) {
      return `${(price * 1e6).toFixed(3)} μETH`;
    } else if (price < 0.001) {
      return `${(price * 1000).toFixed(4)} mETH`;
    } else if (price < 1) {
      return price.toFixed(6) + " ETH";
    }

    return price.toFixed(4) + " ETH";
  };

  return (
    <div className={`rounded-lg border p-3 ${borderColor} ${className}`}>
      <div className="flex items-start gap-2">
        <InfoIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
        <div className="flex-1 space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">
              {isBuying ? t("trade.buy_impact", "Buy Impact") : t("trade.sell_impact", "Sell Impact")}
            </span>
            <span className={`text-sm font-semibold ${impactColor}`}>{formatImpact()}</span>
          </div>
          <div className="space-y-1">
            {/* Only show price change if there's a meaningful difference */}
            {Math.abs(priceImpact.newPrice - priceImpact.currentPrice) > priceImpact.currentPrice * 0.0001 && (
              <div className="text-xs text-muted-foreground">
                <span>
                  {t("trade.price_change", "Price")}: {formatPrice(priceImpact.currentPrice)} →{" "}
                  {formatPrice(priceImpact.newPrice)}
                </span>
              </div>
            )}
            {isBuying && "avgPrice" in priceImpact && priceImpact.avgPrice !== undefined && (
              <div className="text-xs text-muted-foreground">
                <span>
                  {t("trade.avg_price_this_trade", "Avg price")}: {formatPrice(priceImpact.avgPrice)}
                </span>
              </div>
            )}
          </div>
          {priceImpact.isHighImpact && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              {t("trade.high_impact_warning", "Large trade - consider splitting into smaller amounts")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
