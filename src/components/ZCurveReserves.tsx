import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatEther } from "viem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useZCurveSaleSummary } from "@/hooks/use-zcurve-sale";
import { useAccount } from "wagmi";
import type { ZCurveSale } from "@/hooks/use-zcurve-sale";

// Helper function to format large numbers with commas
function formatTokenAmount(value: bigint): string {
  const formatted = formatEther(value);
  const [whole, decimal] = formatted.split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimal ? `${withCommas}.${decimal.slice(0, 2)}` : withCommas;
}

interface ZCurveReservesProps {
  sale: ZCurveSale;
  className?: string;
}

export function ZCurveReserves({ sale, className = "" }: ZCurveReservesProps) {
  const { t } = useTranslation();
  const { address } = useAccount();
  
  // Get real-time onchain data
  const { data: onchainData } = useZCurveSaleSummary(sale.coinId, address);

  // Calculate virtual reserves for the curve
  const reserves = useMemo(() => {
    // Use onchain data if available, otherwise fall back to indexed data
    const ethEscrow = BigInt(onchainData?.ethEscrow || sale.ethEscrow);
    const netSold = BigInt(onchainData?.netSold || sale.netSold);
    const saleCap = BigInt(onchainData?.saleCap || sale.saleCap);
    const availableTokens = saleCap - netSold;

    // For zCurve, the "reserves" are:
    // - ETH: Amount in escrow (can be withdrawn by selling)
    // - Tokens: Remaining tokens available for sale
    return {
      ethReserve: ethEscrow,
      tokenReserve: availableTokens,
      // Virtual liquidity = ETH that would be needed to buy all remaining tokens
      virtualLiquidity: ethEscrow,
    };
  }, [onchainData, sale]);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("trade.curve_reserves", "Curve Reserves")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("trade.eth_in_curve", "ETH in Curve")}</p>
            <p className="text-sm font-medium">{formatEther(reserves.ethReserve).slice(0, 8)} ETH</p>
            <p className="text-xs text-muted-foreground">{t("trade.withdrawable", "Withdrawable by selling")}</p>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("trade.tokens_available", "Tokens Available")}</p>
            <p className="text-sm font-medium">{formatTokenAmount(reserves.tokenReserve)}</p>
            <p className="text-xs text-muted-foreground">{t("trade.can_be_purchased", "Can be purchased")}</p>
          </div>
        </div>

        <div className="pt-2 border-t border-border">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">{t("trade.total_value_locked", "Total Value Locked")}</span>
            <span className="text-sm font-medium">{formatEther(reserves.ethReserve).slice(0, 8)} ETH</span>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          {t(
            "trade.curve_reserves_note",
            "Unlike AMM pools, curve reserves are asymmetric. ETH accumulates from purchases, tokens deplete from the sale supply.",
          )}
        </div>
      </CardContent>
    </Card>
  );
}
