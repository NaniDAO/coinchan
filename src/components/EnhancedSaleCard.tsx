import { memo } from "react";
import { useAccount } from "wagmi";
import { useZCurveSaleSummary } from "@/hooks/use-zcurve-sale";
import { Sale } from "@/hooks/use-zcurve-sales";
import { SaleCard } from "./SaleCard";

interface EnhancedSaleCardProps {
  sale: Sale;
  fetchOnchainData?: boolean;
}

export const EnhancedSaleCard = memo(({ sale, fetchOnchainData = false }: EnhancedSaleCardProps) => {
  const { address } = useAccount();
  
  // Only fetch onchain data if requested (e.g., for user's own sales or important sales)
  const { data: onchainData } = useZCurveSaleSummary(
    fetchOnchainData ? sale.coinId : undefined,
    address
  );

  // Merge onchain data with indexed data - prioritize onchain data when available
  const enhancedSale = onchainData ? {
    ...sale,
    // Use onchain data if it exists (even if 0), only fall back if undefined/null
    currentPrice: onchainData.currentPrice !== undefined ? onchainData.currentPrice : sale.currentPrice,
    ethEscrow: onchainData.ethEscrow !== undefined ? onchainData.ethEscrow : sale.ethEscrow,
    netSold: onchainData.netSold !== undefined ? onchainData.netSold : sale.netSold,
    saleCap: onchainData.saleCap !== undefined ? onchainData.saleCap : sale.saleCap,
    ethTarget: onchainData.ethTarget !== undefined ? onchainData.ethTarget : sale.ethTarget,
    percentFunded: onchainData.percentFunded !== undefined ? onchainData.percentFunded : sale.percentFunded,
    isFinalized: onchainData.isFinalized !== undefined ? onchainData.isFinalized : sale.status === "FINALIZED",
  } : sale;

  return <SaleCard sale={enhancedSale} />;
});

EnhancedSaleCard.displayName = "EnhancedSaleCard";