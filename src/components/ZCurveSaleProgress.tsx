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
          <span>{formatEther(ethEscrow).slice(0, 8)} ETH</span>
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
            {formatEther(netSold).slice(0, 8)} {t("common.sold", "sold")}
          </span>
          <span>
            {formatEther(saleCap).slice(0, 8)} {t("common.cap", "cap")}
          </span>
        </div>
      </div>

      {/* Price Info */}
      <div className="grid grid-cols-2 gap-4 pt-2">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {t("sale.current_price", "Current Price")}
          </p>
          <p className="text-sm font-medium">
            {sale.currentPrice
              ? formatEther(BigInt(sale.currentPrice)).slice(0, 10)
              : "0"}{" "}
            ETH
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
