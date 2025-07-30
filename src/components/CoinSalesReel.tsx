import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useZCurveSales } from "@/hooks/use-zcurve-sales";
import { formatImageURL } from "@/hooks/metadata";

export const CoinSalesReel = () => {
  const { data, isLoading } = useZCurveSales();

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
      .slice(0, 15); // Limit to 15 coins for the reel
  }, [data]);

  if (isLoading || !displaySales.length) return null;

  return (
    <div className="mb-4 w-full max-w-[600px]">
      <div className="text-lg mb-2 font-bold">active coins:</div>
      <div className="relative overflow-hidden bg-muted/20 p-2 border border-border">
        <div className="flex gap-2 animate-scroll-left whitespace-nowrap">
          {/* Duplicate the array for seamless scrolling */}
          {[...displaySales, ...displaySales].map((sale, index) => (
            <Link
              key={`${sale.coinId}-${index}`}
              to="/c/$coinId"
              params={{ coinId: sale.coinId.toString() }}
              className="inline-flex flex-col items-center group"
            >
              <div className="relative w-10 h-10 overflow-hidden border border-border hover:border-primary transition-all duration-200 transform hover:scale-110 bg-background">
                <img
                  src={formatImageURL(sale.coin!.imageUrl!)}
                  alt={sale.coin?.symbol || "Coin"}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {sale.status === "ACTIVE" && (
                  <div className="absolute inset-0 bg-gradient-to-t from-green-500/30 to-transparent pointer-events-none animate-pulse" />
                )}
              </div>
              <div className="text-[10px] text-center mt-0.5 text-muted-foreground group-hover:text-foreground transition-colors max-w-[40px] truncate">
                {sale.coin?.symbol}
              </div>
            </Link>
          ))}
        </div>
        {/* Fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none" />
      </div>
      <style jsx>{`
        @keyframes scroll-left {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-scroll-left {
          animation: scroll-left 40s linear infinite;
          display: flex;
          gap: 0.5rem;
        }
        .animate-scroll-left:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
};