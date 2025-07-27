import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, parseEther } from "viem";
import { InfoIcon } from "lucide-react";
import type { ZCurveSale } from "@/hooks/use-zcurve-sale";
import { UNIT_SCALE, unpackQuadCap } from "@/lib/zCurveHelpers";

interface ZCurvePriceImpactProps {
  sale: ZCurveSale;
  tradeAmount: string; // User input amount
  isBuying: boolean;
  className?: string;
}

export function ZCurvePriceImpact({ sale, tradeAmount, isBuying, className = "" }: ZCurvePriceImpactProps) {
  const { t } = useTranslation();

  // Helper function to calculate marginal price at a given netSold amount
  const calculateMarginalPrice = (netSold: bigint, quadCap: bigint, divisor: bigint): bigint => {
    const m = netSold / UNIT_SCALE;
    
    if (m < 2n) return 0n;
    
    const K = quadCap / UNIT_SCALE;
    const denom = 6n * divisor;
    const oneETH = parseEther("1");
    
    if (m <= K) {
      // Quadratic phase: price = m² / (6 * divisor)
      return (m * m * oneETH) / denom;
    } else {
      // Linear phase: price = K² / (6 * divisor)
      return (K * K * oneETH) / denom;
    }
  };

  const priceImpact = useMemo(() => {
    if (!tradeAmount || parseFloat(tradeAmount) === 0) return null;

    try {
      const amount = parseEther(tradeAmount);
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
        // For buying: price increases
        newNetSold = netSold + amount;
        
        if (newNetSold > saleCap) return null;
        
        const newMarginalPrice = calculateMarginalPrice(newNetSold, quadCap, divisor);
        
        // For buying, impact should be positive (price goes up)
        if (currentMarginalPrice > 0n) {
          impact = Number(((newMarginalPrice - currentMarginalPrice) * 10000n) / currentMarginalPrice) / 100;
        } else {
          // If starting from 0, show a large positive impact
          impact = 100;
        }
        
        isHighImpact = impact > 10; // 10% for buys

        return {
          currentPrice: Number(formatEther(currentMarginalPrice)),
          newPrice: Number(formatEther(newMarginalPrice)),
          impactPercent: Math.abs(impact), // Always positive for display
          isHighImpact,
        };
      } else {
        // For selling: price decreases
        newNetSold = netSold > amount ? netSold - amount : 0n;
        
        const newMarginalPrice = calculateMarginalPrice(newNetSold, quadCap, divisor);
        
        // For selling, impact should be negative (price goes down)
        if (currentMarginalPrice > 0n) {
          impact = -Number(((currentMarginalPrice - newMarginalPrice) * 10000n) / currentMarginalPrice) / 100;
        } else {
          impact = 0;
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
  }, [sale, tradeAmount, isBuying]);

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

  // Format the display - always show sign
  const formatImpact = () => {
    if (isBuying) {
      return `+${Math.abs(priceImpact.impactPercent).toFixed(2)}%`;
    } else {
      return `${priceImpact.impactPercent.toFixed(2)}%`; // Already negative
    }
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
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {t("trade.price_per_token", "Price per token")}: {priceImpact.currentPrice.toFixed(8)} →{" "}
              {priceImpact.newPrice.toFixed(8)} ETH
            </span>
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
