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

export function ZCurvePriceImpact({ sale, tradeAmount, tokenAmount, isBuying, className = "" }: ZCurvePriceImpactProps) {
  const { t } = useTranslation();

  // Helper function to calculate marginal price at a given netSold amount
  const calculateMarginalPrice = (netSold: bigint, quadCap: bigint, divisor: bigint): bigint => {
    const m = netSold / UNIT_SCALE;
    
    // For very small m values, calculate the actual marginal price
    // The derivative of m²/(6*divisor) is 2m/(6*divisor) = m/(3*divisor)
    if (m < 2n) {
      // Use a minimum value to avoid zero price
      const minM = m > 0n ? m : 1n;
      const denom = 3n * divisor;
      const oneETH = parseEther("1");
      return (minM * oneETH) / denom;
    }
    
    const K = quadCap / UNIT_SCALE;
    const denom = 6n * divisor;
    const oneETH = parseEther("1");
    
    if (m <= K) {
      // Quadratic phase: price = m² / (6 * divisor)
      // But we want marginal price, which is derivative: 2m / (6 * divisor)
      return (2n * m * oneETH) / denom;
    } else {
      // Linear phase: constant marginal price = 2K / (6 * divisor)
      return (2n * K * oneETH) / denom;
    }
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
        const avgPriceForTrade = ethIn * parseEther("1") / tokensOut;
        
        // For buying, impact should be positive (price goes up)
        if (currentMarginalPrice > parseEther("0.000000001")) { // Above 1 gwei
          // Compare the average price of the trade to the current marginal price
          impact = Number(((avgPriceForTrade - currentMarginalPrice) * 10000n) / currentMarginalPrice) / 100;
        } else {
          // When starting from very low prices, calculate impact differently
          // Compare average price to new marginal price
          if (newMarginalPrice > 0n && avgPriceForTrade > newMarginalPrice) {
            // If avg price is higher than new marginal, show moderate impact
            impact = Number(((avgPriceForTrade - newMarginalPrice) * 10000n) / avgPriceForTrade) / 100;
            // Cap the impact for better UX when starting from near 0
            impact = Math.min(impact, 50); // Cap at 50% for near-zero starts
          } else if (newMarginalPrice > 0n) {
            // Normal progression
            impact = 10; // Show 10% for initial purchases
          } else {
            impact = 0;
          }
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
      ? "text-green-600 dark:text-green-400"  // Buy = green (positive)
      : "text-red-600 dark:text-red-400";     // Sell = red (negative)

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
    if (price === 0) return "0";
    
    // For very small values, use more decimal places
    if (price < 1e-15) {
      return price.toExponential(2);
    } else if (price < 1e-6) {
      return price.toFixed(9);
    } else if (price < 1) {
      return price.toFixed(8);
    }
    
    return price.toFixed(6);
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
            <span className={`text-sm font-semibold ${impactColor}`}>
              {formatImpact()}
            </span>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">
              <span>
                {t("trade.marginal_price", "Marginal price")}: {formatPrice(priceImpact.currentPrice)} ETH → {formatPrice(priceImpact.newPrice)} ETH
              </span>
            </div>
            {isBuying && 'avgPrice' in priceImpact && priceImpact.avgPrice !== undefined && (
              <div className="text-xs text-muted-foreground">
                <span>
                  {t("trade.avg_price_this_trade", "Avg price for this trade")}: {formatPrice(priceImpact.avgPrice)} ETH/token
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
