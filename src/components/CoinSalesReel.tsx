import { useMemo, useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useZCurveSales } from "@/hooks/use-zcurve-sales";
import { formatImageURL } from "@/hooks/metadata";
import { formatEther } from "viem";
import { useTranslation } from "react-i18next";
import { calculateFundedPercentage } from "@/lib/zcurve";

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
          <Link
            key={sale.coinId}
            to="/c/$coinId"
            params={{ coinId: sale.coinId.toString() }}
            className={`absolute inset-0 transition-all duration-1000 ${
              index === visibleIndex 
                ? 'opacity-100 scale-100 z-10' 
                : 'opacity-0 scale-95 z-0'
            }`}
          >
            <div className="relative w-full h-full">
              {/* Main coin image */}
              <div className="w-full h-full overflow-hidden border-2 border-border hover:border-primary transition-all duration-300 bg-background transform hover:scale-105 hover:rotate-3">
                <img
                  src={formatImageURL(sale.coin!.imageUrl!)}
                  alt={sale.coin?.symbol || "Coin"}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                
                {/* Status indicator */}
                {sale.status === "ACTIVE" && (
                  <div className="absolute top-2 right-2 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                )}
                
                {/* Progress bar for active sales */}
                {sale.status === "ACTIVE" && index === visibleIndex && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-background/80">
                    <div 
                      className="h-full bg-primary transition-all duration-500"
                      style={{ width: `${calculateFundedPercentage(sale)}%` }}
                    />
                  </div>
                )}
              </div>
              
              {/* Hover overlay with info */}
              <div className="absolute inset-0 bg-background/95 opacity-0 hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center p-2">
                <div className="text-base font-bold">{sale.coin?.symbol}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {sale.status === "ACTIVE" 
                    ? `${calculateFundedPercentage(sale).toFixed(1)}% funded` 
                    : "Finalized"}
                </div>
                {(sale.status === "ACTIVE" && sale.ethEscrow) ? (
                  <div className="text-xs mt-1 font-mono">
                    {parseFloat(formatEther(BigInt(sale.ethEscrow))).toFixed(3)} ETH raised
                  </div>
                ) : sale.status === "FINALIZED" && sale.finalization?.ethLp ? (
                  <div className="text-xs mt-1 font-mono">
                    {parseFloat(formatEther(BigInt(sale.finalization.ethLp))).toFixed(3)} ETH liquidity
                  </div>
                ) : null}
              </div>
            </div>
          </Link>
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