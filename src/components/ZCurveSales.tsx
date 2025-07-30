import { formatImageURL } from "@/hooks/metadata";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "./ui/badge";
import { CreatorDisplay } from "./CreatorDisplay";
import { ZCurveMiniChart } from "./ZCurveMiniChart";
import type { ZCurveSale } from "@/hooks/use-zcurve-sale";
// Removed CoinImagePopup import to avoid nested interactive elements
import { useTheme } from "@/lib/theme";
import { useTranslation } from "react-i18next";
import { memo, useMemo } from "react";
import { ZCURVE_STANDARD_PARAMS } from "@/lib/zCurveHelpers";

// Use ZCurveSale type from hooks
type Sale = ZCurveSale;

// GraphQL query
const GET_ZCURVE_SALES = `
  query GetZCurveSales {
    zcurveSales(where: {}) {
      items {
        coinId
        createdAt
        creator
        currentPrice
        deadline
        divisor
        ethEscrow
        feeOrHook
        ethTarget
        lpSupply
        netSold
        percentFunded
        quadCap
        saleCap
        purchases {
          totalCount
          items {
            buyer
          }
        }
        sells {
          totalCount
          items {
            seller
          }
        }
        status
        coin {
          name
          symbol
          imageUrl
          description
          decimals
        }
      }
    }
  }
`;

// Helper function to calculate funded percentage
const calculateFundedPercentage = (sale: Sale): number => {
  if (sale.status === "FINALIZED") return 100;
  
  // Use percentFunded from indexer if available
  if (sale.percentFunded !== undefined && sale.percentFunded !== null) {
    return sale.percentFunded / 100;
  }
  
  // Otherwise calculate from ethEscrow and ethTarget
  try {
    const ethEscrow = BigInt(sale.ethEscrow || "0");
    const ethTarget = BigInt(sale.ethTarget || "0");
    if (ethTarget === 0n) return 0;
    const percentage = Number((ethEscrow * 10000n) / ethTarget) / 100;
    return Math.min(percentage, 100);
  } catch (e) {
    console.error("Error calculating funded percentage:", e, sale);
    return 0;
  }
};

// Helper function to format price
const formatPrice = (sale: Sale): string | JSX.Element => {
  try {
    let priceInWei = Number(sale.currentPrice || 0);
    
    if (sale.status === "FINALIZED" && priceInWei === 0) {
      const tokensSold = BigInt(sale.netSold || "0");
      const ethRaised = BigInt(sale.ethEscrow || "0");
      
      // Only calculate average price if we have meaningful volume
      if (tokensSold > 0n && ethRaised > 0n) {
        priceInWei = Number((ethRaised * BigInt(1e18)) / tokensSold);
      }
    }
    
    const priceInEth = priceInWei / 1e18;
    
    if (priceInEth === 0) {
      return "0";
    }
    
    // Format based on size
    if (priceInEth < 1e-15) {
      const wei = priceInEth * 1e18;
      if (wei < 1) {
        return `${(priceInWei / 1e18).toExponential(2)} ETH`;
      }
      return `${wei.toFixed(0)} wei`;
    }
    if (priceInEth < 1e-9) {
      const gwei = priceInEth * 1e9;
      return `${gwei.toFixed(3)} gwei`;
    }
    if (priceInEth < 1e-6) {
      return `${(priceInEth * 1e6).toFixed(3)} μETH`;
    }
    if (priceInEth < 0.01) {
      const str = priceInEth.toFixed(12).replace(/\.?0+$/, '');
      const parts = str.split('.');
      if (parts.length === 2 && parts[1].length > 3) {
        const leadingZeros = parts[1].match(/^0+/)?.[0].length || 0;
        if (leadingZeros >= 3) {
          const significantPart = parts[1].slice(leadingZeros);
          return (
            <span className="font-mono">
              0.{`{${leadingZeros}}`}{significantPart.slice(0, 4)} ETH
            </span>
          );
        }
      }
      return `${str} ETH`;
    }
    return `${priceInEth.toFixed(6)} ETH`;
  } catch (e) {
    console.error("Error formatting price:", e, sale);
    return "Error";
  }
};

// Custom hook for fetching sales
const useZCurveSales = () => {
  return useQuery({
    queryKey: ["zcurveSales"],
    queryFn: async () => {
      // Ensure we have the indexer URL
      const indexerUrl = import.meta.env.VITE_INDEXER_URL;
      if (!indexerUrl) {
        throw new Error("Indexer URL not configured");
      }
      
      const response = await fetch(
        indexerUrl + "/graphql",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: GET_ZCURVE_SALES,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Network response was not ok");
      }

      const data = await response.json();

      if (data.errors) {
        throw new Error(data.errors[0]?.message || "GraphQL error");
      }

      // Validate the response structure
      if (!data?.data?.zcurveSales?.items) {
        console.error("Invalid response structure:", data);
        return [];
      }
      
      return data.data.zcurveSales.items;
    },
    refetchInterval: 10000, // Refetch every 10 seconds
    staleTime: 5000, // Consider data stale after 5 seconds
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false, // Prevent aggressive refetching
  });
};

// Memoized sale card component to prevent unnecessary re-renders
const SaleCard = memo(({ sale }: { sale: Sale }) => {
  const { t } = useTranslation();
  
  // Ensure coinId is a string
  if (!sale?.coinId) {
    return null;
  }
  
  // Memoize expensive calculations
  const fundedPercentage = useMemo(() => calculateFundedPercentage(sale), [sale.status, sale.percentFunded, sale.ethEscrow, sale.ethTarget]);
  const formattedPrice = useMemo(() => formatPrice(sale), [sale.status, sale.currentPrice, sale.netSold, sale.ethEscrow, sale.ethTarget]);
  const uniqueWalletCount = useMemo(() => {
    try {
      const uniqueBuyers = new Set(sale.purchases?.items?.map((p) => p.buyer) || []);
      const uniqueSellers = new Set(sale.sells?.items?.map((s) => s.seller) || []);
      return new Set([...uniqueBuyers, ...uniqueSellers]).size;
    } catch (e) {
      console.error("Error calculating wallet count:", e);
      return 0;
    }
  }, [sale.purchases?.items, sale.sells?.items]);
  
  // Check if using standard parameters for optimization
  // const isStandardSale = useMemo(() => {
  //   return sale.ethTarget === ZCURVE_STANDARD_PARAMS.ETH_TARGET.toString() &&
  //          sale.saleCap === ZCURVE_STANDARD_PARAMS.SALE_CAP.toString();
  // }, [sale.ethTarget, sale.saleCap]);
  // TODO: Use isStandardSale for optimized rendering of standard parameters
  
  return (
    <Link
      to="/c/$coinId"
      params={{
        coinId: String(sale.coinId),
      }}
      className="block focus:outline-none focus:ring-2 focus:ring-primary/50 rounded"
      aria-label={`View ${sale.coin?.name || 'coin'} sale details`}
    >
      <div
        className={cn(
          "border p-3 text-card-foreground transition-all duration-200 relative overflow-hidden cursor-pointer select-none",
          "border-border hover:border-primary active:border-primary/80",
          "bg-card hover:bg-accent/5",
          "hover:shadow-lg active:scale-[0.99]",
          sale.status === "FINALIZED" ? "bg-amber-50/5 dark:bg-amber-900/5" : "bg-green-50/5 dark:bg-green-900/5"
        )}
      >
      {/* Background gradient for funding progress */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: sale.status === "FINALIZED" 
            ? `linear-gradient(to right, rgba(245, 158, 11, 0.1) 0%, rgba(245, 158, 11, 0.05) 100%)`
            : `linear-gradient(to right, rgba(34, 197, 94, 0.1) 0%, rgba(34, 197, 94, 0.1) ${fundedPercentage}%, transparent ${fundedPercentage}%)`
        }}
      />
      
      <div className="flex items-start gap-4 group relative z-10">
        {/* Coin Image */}
        <div className="flex-shrink-0">
          <div className="w-8 h-8 rounded-full overflow-hidden border border-border bg-muted">
            {sale.coin?.imageUrl ? (
              <img
                src={formatImageURL(sale.coin.imageUrl)}
                alt={sale.coin?.name || "Unknown"}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  // Show fallback
                  const parent = target.parentElement;
                  if (parent) {
                    parent.innerHTML = `<div class="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">${(sale.coin?.symbol || "?")[0].toUpperCase()}</div>`;
                  }
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
                {(sale.coin?.symbol || "?")[0].toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {/* Sale Info */}
        <div className="flex-1 font-mono text-sm">
          <div className="font-bold group-hover:text-primary transition-colors">
            {sale.coin?.name || "Unknown"} ({sale.coin?.symbol || "???"}) 
          </div>
          <div className="text-muted-foreground mt-1 line-clamp-2">
            {sale.coin?.description || "No description available"}
          </div>
          <div className="mt-2 space-y-2 text-xs">
            {/* Price and funding info */}
            <div className="grid grid-cols-2 gap-x-3 text-[11px]">
              <div>
                <span className="text-muted-foreground">
                  {sale.status === "FINALIZED" ? t("sale.final_price_label", "Final Price") : t("sale.price_label", "Current Price")}
                </span>
                <div className="font-medium">
                  {formattedPrice}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">{t("sale.funded_label", "Funded")}</span>
                <div className="font-medium">
                  {fundedPercentage.toFixed(1)}%
                </div>
              </div>
            </div>
            
            {/* Trading activity */}
            <div className="border-t border-border/30 pt-1 text-[11px]">
              <div className="font-medium">
                {t("sale.buys_label", "Buys")} {sale.purchases?.totalCount || 0} | 
                {t("sale.sells_label", "Sells")} {sale.sells?.totalCount || 0} | 
                {t("sale.wallets_label", "Wallets")} {uniqueWalletCount}
              </div>
            </div>
            
            {/* Creator */}
            <div className="flex items-center gap-1 border-t border-border/30 pt-1">
              <span>{t("sale.creator_label", "Creator")}:</span>
              {sale.creator ? (
                <CreatorDisplay 
                  address={sale.creator} 
                  size="sm"
                  showLabel={false}
                  className="text-xs"
                />
              ) : (
                <span className="text-muted-foreground">Unknown</span>
              )}
            </div>
          </div>
        </div>

        {/* Bonding Curve Chart */}
        <div className="flex-shrink-0 w-32">
          <div className="border border-border rounded-sm p-1 bg-muted/20">
            <ZCurveMiniChart 
              sale={sale as ZCurveSale} 
              className="h-16 w-full"
            />
          </div>
        </div>

        {/* Status */}
        <div className="text-right font-mono text-xs">
          <Badge
            className={cn(
              "border border-border px-2 py-1",
              sale.status === "ACTIVE"
                ? "bg-green-500 text-white"
                : sale.status === "FINALIZED"
                ? "bg-amber-500 text-white"
                : "bg-gray-200 text-gray-600",
            )}
          >
            {sale.status}
          </Badge>
          <div className="mt-2 text-muted-foreground text-[11px]">
            <div>{sale.createdAt ? new Date(sale.createdAt * 1000).toLocaleDateString() : "Unknown"}</div>
            <div>
              {(() => {
                if (!sale.deadline) return "→ Unknown";
                
                const deadline = new Date(Number(sale.deadline) * 1000);
                const now = new Date();
                
                if (sale.status === "ACTIVE" && deadline > now) {
                  // Show time remaining for active sales
                  const remaining = deadline.getTime() - now.getTime();
                  const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
                  const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                  
                  if (days > 0) {
                    return `→ ${days}d ${hours}h left`;
                  } else if (hours > 0) {
                    return `→ ${hours}h left`;
                  } else {
                    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                    return `→ ${minutes}m left`;
                  }
                } else if (sale.createdAt) {
                  // Show duration for finalized sales
                  const created = new Date(sale.createdAt * 1000);
                  const durationMs = deadline.getTime() - created.getTime();
                  const days = Math.round(durationMs / (1000 * 60 * 60 * 24));
                  
                  if (days === 14) {
                    return "→ 2 week sale";
                  } else if (days === 7) {
                    return "→ 1 week sale";
                  } else {
                    return `→ ${days} day sale`;
                  }
                }
                return "→ Unknown";
              })()}
            </div>
          </div>
        </div>
      </div>
      
      {/* Progress bar at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-border/20">
        <div 
          className={cn(
            "h-full transition-all duration-300",
            sale.status === "FINALIZED" ? "bg-amber-500/50" : "bg-green-500/50"
          )}
          style={{ 
            width: `${Math.min(fundedPercentage, 100)}%` 
          }}
        />
      </div>
    </div>
  </Link>
  );
});

SaleCard.displayName = 'SaleCard';

export const ZCurveSales = () => {
  const { data: sales, isLoading, error, isRefetching } = useZCurveSales();
  const { theme } = useTheme();
  const { t } = useTranslation();
  
  // Sort sales by funding percentage and creation date
  const sortedSales = useMemo(() => {
    if (!sales) return [];
    return [...sales].sort((a, b) => {
      // Active sales first
      if (a.status !== b.status) {
        return a.status === "ACTIVE" ? -1 : 1;
      }
      // Then by funding percentage
      const aFunded = calculateFundedPercentage(a);
      const bFunded = calculateFundedPercentage(b);
      if (aFunded !== bFunded) {
        return bFunded - aFunded;
      }
      // Finally by creation date (newest first)
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [sales]);

  if (isLoading) {
    return (
      <div className="">
        <div className="border-border text-foreground p-3">
          <h2 className="font-mono text-2xl tracking-widest font-bold uppercase">
            ZCURVE {t("common.sales", "SALES")}
          </h2>
        </div>
        <div className="p-4">
          <div className="border-l-4 border-border m-0 p-0 space-y-2">
            {/* Skeleton cards */}
            {[1, 2, 3].map((i) => (
              <div key={i} className="border border-border p-3 bg-card animate-pulse">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-1/3" />
                    <div className="h-3 bg-muted rounded w-2/3" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                  <div className="w-32 h-16 bg-muted rounded" />
                  <div className="w-16 space-y-2">
                    <div className="h-6 bg-muted rounded" />
                    <div className="h-3 bg-muted rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="">
        <div className="border-border text-foreground p-3">
          <h2 className="font-mono text-2xl tracking-widest font-bold uppercase">
            ZCURVE {t("common.sales", "SALES")}
          </h2>
        </div>
        <div className="p-4">
          <div className="border border-destructive/50 bg-destructive/10 p-4 rounded">
            <div className="font-mono text-sm text-destructive">
              <div className="font-bold mb-1">Error loading sales</div>
              <div className="text-xs opacity-80">{error.message}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="">
      <div className="">
        {/* Header */}
        <div className="border-border text-foreground p-3 flex items-center justify-between">
          <h2 className="font-mono text-2xl tracking-widest font-bold uppercase">
            ZCURVE {t("common.sales", "SALES")} ({sortedSales.length})
          </h2>
          {isRefetching && (
            <div className="font-mono text-xs text-muted-foreground animate-pulse">
              Updating...
            </div>
          )}
        </div>

        {/* Sales List */}
        <div className="p-4">
          {!sales || sales.length === 0 ? (
            <div className="font-mono text-sm text-secondary-foreground bg-secondary p-4 rounded">
              &gt; no active sales found
            </div>
          ) : (
            <div className="border-l-4 border-border m-0 p-0 space-y-2">
              {sortedSales.map((sale: Sale, index: number) => (
                <SaleCard key={sale.coinId || `sale-${index}`} sale={sale} />
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Video */}
      <video
        className="fixed bottom-5 right-5 w-40 h-40"
        style={{
          clipPath: "polygon(50% 10%, 75% 50%, 50% 90%, 25% 50%)",
        }}
        src={theme === "dark" ? "/zammzamm-bw.mp4" : "/zammzamm.mp4"}
        autoPlay
        loop
        muted
        aria-hidden="true"
      />
    </div>
  );
};