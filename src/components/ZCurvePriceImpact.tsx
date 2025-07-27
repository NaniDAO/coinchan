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

  const priceImpact = useMemo(() => {
    if (!tradeAmount || parseFloat(tradeAmount) === 0) return null;

    try {
      const amount = parseEther(tradeAmount);
      const netSold = BigInt(sale.netSold);
      const currentPrice = BigInt(sale.currentPrice || "0");

      if (currentPrice === 0n) return null;

      // For buying: calculate average price per token for the purchase
      if (isBuying) {
        // Current marginal price (price of next token)
        const currentPricePerToken = currentPrice;

        // Calculate average price for the batch
        // This would ideally use the view helper, but we can approximate
        const newNetSold = netSold + amount;
        const saleCap = BigInt(sale.saleCap);

        if (newNetSold > saleCap) return null;

        // Estimate new marginal price after purchase
        const quadCap = unpackQuadCap(BigInt(sale.quadCap));
        const divisor = BigInt(sale.divisor);

        // Calculate tick position
        const newTicks = newNetSold / UNIT_SCALE;
        const K = quadCap / UNIT_SCALE;

        let newMarginalPrice: bigint;
        if (newTicks <= K) {
          // Still in quadratic phase
          newMarginalPrice = (newTicks * newTicks * parseEther("1")) / (6n * divisor);
        } else {
          // In linear phase
          newMarginalPrice = (K * K * parseEther("1")) / (6n * divisor);
        }

        // Price impact = (newPrice - currentPrice) / currentPrice * 100
        const impact = Number(((newMarginalPrice - currentPricePerToken) * 10000n) / currentPricePerToken) / 100;

        return {
          currentPrice: Number(formatEther(currentPricePerToken)),
          newPrice: Number(formatEther(newMarginalPrice)),
          impactPercent: impact,
          isHighImpact: impact > 5,
        };
      } else {
        // For selling: calculate impact on marginal price
        const newNetSold = netSold > amount ? netSold - amount : 0n;

        // Calculate new marginal price after sale
        const quadCap = unpackQuadCap(BigInt(sale.quadCap));
        const divisor = BigInt(sale.divisor);

        const newTicks = newNetSold / UNIT_SCALE;
        const K = quadCap / UNIT_SCALE;

        let newMarginalPrice: bigint;
        if (newTicks < 2n) {
          newMarginalPrice = 0n;
        } else if (newTicks <= K) {
          // In quadratic phase
          newMarginalPrice = (newTicks * newTicks * parseEther("1")) / (6n * divisor);
        } else {
          // In linear phase
          newMarginalPrice = (K * K * parseEther("1")) / (6n * divisor);
        }

        // Price impact = (currentPrice - newPrice) / currentPrice * 100
        const impact =
          currentPrice > 0n ? Number(((currentPrice - newMarginalPrice) * 10000n) / currentPrice) / 100 : 0;

        return {
          currentPrice: Number(formatEther(currentPrice)),
          newPrice: Number(formatEther(newMarginalPrice)),
          impactPercent: impact,
          isHighImpact: impact > 5,
        };
      }
    } catch (error) {
      console.error("Error calculating price impact:", error);
      return null;
    }
  }, [sale, tradeAmount, isBuying]);

  if (!priceImpact) return null;

  const impactColor = priceImpact.isHighImpact
    ? "text-amber-600 dark:text-amber-400"
    : priceImpact.impactPercent > 0
      ? "text-green-600 dark:text-green-400"
      : "text-muted-foreground";

  const borderColor = priceImpact.isHighImpact
    ? "border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20"
    : priceImpact.impactPercent > 0
      ? "border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20"
      : "";

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
              {priceImpact.impactPercent > 0 ? "+" : ""}
              {priceImpact.impactPercent.toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {t("trade.price_per_token", "Price per token")}: {priceImpact.currentPrice.toFixed(6)} →{" "}
              {priceImpact.newPrice.toFixed(6)} ETH
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
