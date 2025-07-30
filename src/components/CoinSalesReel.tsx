import { useMemo, useState, useEffect } from "react";
import { useZCurveSales } from "@/hooks/use-zcurve-sales";
import { useTranslation } from "react-i18next";
import { CoinSaleReelItem } from "./CoinSaleReelItem";

export const CoinSalesReel = () => {
  const { data, isLoading, refetch } = useZCurveSales();
  const [visibleIndex, setVisibleIndex] = useState(0);
  const { t } = useTranslation();

  // Filter for active and finalized sales with images
  const displaySales = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    
    return data
      .filter(sale => 
        (sale.status === "ACTIVE" || sale.status === "FINALIZED") && 
        sale.coin?.imageUrl &&
        sale.coinId
      )
      .sort((a, b) => {
        // Prioritize active over finalized
        if (a.status !== b.status) return a.status === "ACTIVE" ? -1 : 1;
        // Then sort by creation date (newest first)
        return Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0);
      })
      .slice(0, 8); // Limit to 8 coins for vertical display
  }, [data]);

  // Cycle through coins with staggered fade-in effect
  useEffect(() => {
    if (!displaySales.length) return;
    
    const interval = setInterval(() => {
      setVisibleIndex((prev) => (prev + 1) % displaySales.length);
    }, 3000); // Change coin every 3 seconds

    return () => clearInterval(interval);
  }, [displaySales.length]);

  // Refetch data more frequently for active sales
  useEffect(() => {
    if (!displaySales.some(sale => sale.status === "ACTIVE")) return;
    
    // Refetch every 10 seconds for more up-to-date percentages
    const refetchInterval = setInterval(() => {
      refetch();
    }, 10000);

    return () => clearInterval(refetchInterval);
  }, [refetch, displaySales]);

  if (isLoading || !displaySales.length) return null;

  const currentSale = displaySales[visibleIndex];

  return (
    <div className="mb-6 w-full flex flex-col items-center">
      <div className="relative w-32 h-32 group">
        {displaySales.map((sale, index) => (
          <CoinSaleReelItem
            key={sale.coinId}
            sale={sale}
            index={index}
            visibleIndex={visibleIndex}
          />
        ))}
      </div>
      
      {/* Coin info below */}
      <div className="mt-3 text-center transition-all duration-500 min-w-[100px]">
        <div className="text-sm font-mono font-bold">
          {currentSale.coin?.symbol}
        </div>
        <div className="text-xs text-muted-foreground whitespace-nowrap">
          {currentSale.status === "ACTIVE" ? t("landing.bonding_now") : t("landing.graduated")}
        </div>
      </div>
      
      {/* Progress dots */}
      <div className="flex gap-1 mt-3">
        {displaySales.map((_, index) => (
          <div
            key={index}
            className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
              index === visibleIndex 
                ? 'bg-primary w-4' 
                : 'bg-muted-foreground/30'
            }`}
          />
        ))}
      </div>
    </div>
  );
};