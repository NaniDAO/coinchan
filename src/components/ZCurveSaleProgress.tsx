import { useTranslation } from "react-i18next";
import { formatEther } from "viem";
import { CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import type { ZCurveSale } from "@/hooks/use-zcurve-sale";
import { unpackQuadCap } from "@/lib/zCurveHelpers";

interface ZCurveSaleProgressProps {
  sale: ZCurveSale;
}

export function ZCurveSaleProgress({ sale }: ZCurveSaleProgressProps) {
  const { t } = useTranslation();

  const netSold = BigInt(sale.netSold);
  const saleCap = BigInt(sale.saleCap);
  const ethEscrow = BigInt(sale.ethEscrow);
  const ethTarget = BigInt(sale.ethTarget);
  const quadCap = unpackQuadCap(BigInt(sale.quadCap));

  const soldPercentage = saleCap > 0n ? Number((netSold * 100n) / saleCap) : 0;
  const fundedPercentage = sale.percentFunded / 100;
  const quadCapPercentage =
    saleCap > 0n ? Number((quadCap * 100n) / saleCap) : 0;

  return (
    <CardContent className="space-y-4 h-fit">
      {/* Funding Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {t("sale.funding_progress", "Funding Progress")}
          </span>
          <span className="font-medium">{fundedPercentage.toFixed(1)}%</span>
        </div>
        <Progress value={fundedPercentage} className="h-3" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{(() => {
            const ethValue = Number(formatEther(ethEscrow));
            if (ethValue === 0) return "0";
            if (ethValue < 0.0001) return ethValue.toFixed(9);
            if (ethValue < 0.01) return ethValue.toFixed(6);
            if (ethValue < 1) return ethValue.toFixed(4);
            return ethValue.toFixed(2);
          })()} ETH</span>
          <span>
            {t("sale.target", "Target")}: {formatEther(ethTarget)} ETH
          </span>
        </div>
      </div>

      <Separator />

      {/* Sale Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {t("sale.tokens_sold", "Tokens Sold")}
          </span>
          <span className="font-medium">{soldPercentage.toFixed(1)}%</span>
        </div>
        <div className="relative">
          <Progress value={soldPercentage} className="h-3" />
          {/* Quadratic cap indicator */}
          {quadCapPercentage > 0 && quadCapPercentage < 100 && (
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-primary/50"
              style={{ left: `${quadCapPercentage}%` }}
              title={t("sale.quadratic_cap", "Quadratic pricing ends here")}
            />
          )}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {(() => {
              const value = Number(formatEther(netSold));
              if (value === 0) return "0";
              if (value < 1000) return value.toFixed(0);
              if (value < 1000000) return (value / 1000).toFixed(1) + "K";
              return (value / 1000000).toFixed(1) + "M";
            })()} {t("common.sold", "sold")}
          </span>
          <span>
            {(() => {
              const value = Number(formatEther(saleCap));
              if (value < 1000000) return (value / 1000).toFixed(0) + "K";
              return (value / 1000000).toFixed(0) + "M";
            })()} {t("common.cap", "cap")}
          </span>
        </div>
        {saleCap > 0n && (
          <div className="text-xs text-muted-foreground text-center">
            {((Number(netSold) / Number(saleCap)) * 100).toFixed(2)}% {t("sale.of_total_supply", "of total supply")}
          </div>
        )}
      </div>

      {/* Price Info */}
      <div className="grid grid-cols-2 gap-4 pt-2">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {t("sale.current_price", "Current Price")}
          </p>
          <p className="text-sm font-medium">
            {sale.currentPrice ? (() => {
              const price = Number(formatEther(BigInt(sale.currentPrice)));
              if (price === 0) return "0";
              
              // Format very small prices with better readability
              if (price < 1e-15) {
                const exp = Math.floor(Math.log10(price));
                const mantissa = (price / Math.pow(10, exp)).toFixed(2);
                return `${mantissa}×10^${exp}`;
              }
              if (price < 1e-9) {
                const gwei = price * 1e9;
                return `${gwei.toFixed(3)} gwei`;
              }
              if (price < 1e-6) {
                return price.toFixed(9);
              }
              return price.toFixed(8);
            })() : "0"}{" "}
            {sale.currentPrice && Number(formatEther(BigInt(sale.currentPrice))) >= 1e-9 ? "ETH" : ""}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {t("sale.pricing_phase", "Pricing Phase")}
          </p>
          <p className="text-sm font-medium">
            {netSold < quadCap
              ? t("sale.quadratic", "Quadratic")
              : t("sale.linear", "Linear")}
          </p>
          {netSold < quadCap && quadCap > 0n && (
            <p className="text-xs text-muted-foreground">
              {((Number(netSold) / Number(quadCap)) * 100).toFixed(1)}%{" "}
              {t("sale.to_linear", "to linear")}
            </p>
          )}
        </div>
      </div>

      {/* Auto-finalization note */}
      {fundedPercentage >= 90 && (
        <div className="text-xs text-amber-600 dark:text-amber-400 text-center pt-2">
          {t(
            "sale.near_target",
            "Sale will auto-finalize when target is reached",
          )}
        </div>
      )}
    </CardContent>
  );
}
