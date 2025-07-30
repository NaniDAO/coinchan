import { useMemo, useState, useEffect } from "react";
import { useZCurveSales } from "@/hooks/use-zcurve-sales";
import { useTranslation } from "react-i18next";
import { CoinSaleReelItem } from "./CoinSaleReelItem";
import { Skeleton } from "./ui/skeleton";

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

  if (isLoading) {
    return (
      <div className="mt-2 mb-4 w-full flex items-start gap-3">
        <Skeleton className="w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <Skeleton className="h-3 w-16 mb-1" />
          <Skeleton className="h-3 w-24" />
          <div className="flex gap-1 mt-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="w-1 h-1 rounded-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!displaySales.length) return null;

  const currentSale = displaySales[visibleIndex];

  return (
    <div className="mt-2 mb-4 w-full flex items-start gap-3">
      <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0">
        {displaySales.map((sale, index) => (
          <CoinSaleReelItem
            key={sale.coinId}
            sale={sale}
            index={index}
            visibleIndex={visibleIndex}
          />
        ))}
      </div>
      
      {/* Coin info to the right */}
      <div className="flex-1 min-w-0">
        <div className="transition-all duration-500">
          <div className="text-xs font-mono font-bold truncate">
            {currentSale.coin?.symbol}
          </div>
          <div className="text-xs text-muted-foreground">
            {currentSale.status === "ACTIVE" ? t("landing.bonding_now") : t("landing.graduated")}
          </div>
          
          {/* Progress dots */}
          <div className="flex gap-1 mt-2">
            {displaySales.map((_, index) => (
              <div
                key={index}
                className={`w-1 h-1 rounded-full transition-all duration-300 ${
                  index === visibleIndex 
                    ? 'bg-primary w-3' 
                    : 'bg-muted-foreground/30'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};