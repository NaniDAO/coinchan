import { memo } from "react";
import { useZCurveSaleSummary } from "@/hooks/use-zcurve-sale";
import { Sale } from "@/hooks/use-zcurve-sales";
import { SaleCard } from "./SaleCard";
import { zeroAddress } from "viem";

interface EnhancedSaleCardProps {
  sale: Sale;
  fetchOnchainData?: boolean;
  hasHighMomentum?: boolean;
}

export const EnhancedSaleCard = memo(({ sale, fetchOnchainData = false, hasHighMomentum = false }: EnhancedSaleCardProps) => {
  // Only fetch onchain data if requested with error handling
  const { data: onchainData, isError } = useZCurveSaleSummary(fetchOnchainData ? sale.coinId : undefined, zeroAddress);

  // Merge onchain data with indexed data - prioritize onchain data when available and no error
  const enhancedSale =
    onchainData && !isError
      ? {
          ...sale,
          // Use onchain data if it exists (even if 0), only fall back if undefined/null
          currentPrice: onchainData.currentPrice !== undefined ? onchainData.currentPrice : sale.currentPrice,
          ethEscrow: onchainData.ethEscrow !== undefined ? onchainData.ethEscrow : sale.ethEscrow,
          netSold: onchainData.netSold !== undefined ? onchainData.netSold : sale.netSold,
          saleCap: onchainData.saleCap !== undefined ? onchainData.saleCap : sale.saleCap,
          ethTarget: onchainData.ethTarget !== undefined ? onchainData.ethTarget : sale.ethTarget,
          percentFunded: onchainData.percentFunded !== undefined ? onchainData.percentFunded : sale.percentFunded,
          isFinalized: onchainData.isFinalized !== undefined ? onchainData.isFinalized : sale.status === "FINALIZED",
        }
      : sale;

  console.log("SALE:", {
    enhancedSale,
    onchainData,
  });

  return <SaleCard sale={enhancedSale} hasHighMomentum={hasHighMomentum} />;
});

EnhancedSaleCard.displayName = "EnhancedSaleCard";
