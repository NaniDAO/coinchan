import { formatImageURL } from "@/hooks/metadata";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "./ui/badge";
import { CreatorDisplay } from "./CreatorDisplay";
import { ZCurveMiniChart } from "./ZCurveMiniChart";
import { CoinImagePopup } from "./CoinImagePopup";
import { useTheme } from "@/lib/theme";
import { useTranslation } from "react-i18next";
import { memo, useMemo } from "react";

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
const calculateFundedPercentage = (sale: any): number => {
  if (sale.status === "FINALIZED") return 100;
  
  // Use percentFunded from indexer if available
  if (sale.percentFunded !== undefined && sale.percentFunded !== null) {
    return sale.percentFunded / 100;
  }
  
  // Otherwise calculate from ethEscrow and ethTarget
  const ethEscrow = BigInt(sale.ethEscrow);
  const ethTarget = BigInt(sale.ethTarget);
  if (ethTarget === 0n) return 0;
  const percentage = Number((ethEscrow * 10000n) / ethTarget) / 100;
  return Math.min(percentage, 100);
};

// Helper function to format price
const formatPrice = (sale: any): string | JSX.Element => {
  let priceInWei = Number(sale.currentPrice);
  
  if (sale.status === "FINALIZED" && priceInWei === 0) {
    const tokensSold = BigInt(sale.netSold);
    const ethRaised = BigInt(sale.ethEscrow);
    
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
};

// Custom hook for fetching sales
const useZCurveSales = () => {
  return useQuery({
    queryKey: ["zcurveSales"],
    queryFn: async () => {
      const response = await fetch(
        import.meta.env.VITE_INDEXER_URL + "/graphql",
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

      return data.data.zcurveSales.items;
    },
    refetchInterval: 10000, // Refetch every 10 seconds
    staleTime: 5000, // Consider data stale after 5 seconds
  });
};

// Memoized sale card component to prevent unnecessary re-renders
const SaleCard = memo(({ sale }: { sale: any }) => {
  const { t } = useTranslation();
  
  // Ensure coinId is a string
  if (!sale?.coinId) {
    return null;
  }
  
  // Memoize expensive calculations
  const fundedPercentage = useMemo(() => calculateFundedPercentage(sale), [sale.status, sale.percentFunded, sale.ethEscrow, sale.ethTarget]);
  const formattedPrice = useMemo(() => formatPrice(sale), [sale.status, sale.currentPrice, sale.netSold, sale.ethEscrow, sale.ethTarget]);
  const uniqueWalletCount = useMemo(() => {
    const uniqueBuyers = new Set(sale.purchases?.items?.map((p: any) => p.buyer) || []);
    const uniqueSellers = new Set(sale.sells?.items?.map((s: any) => s.seller) || []);
    return new Set([...uniqueBuyers, ...uniqueSellers]).size;
  }, [sale.purchases?.items, sale.sells?.items]);
  
  return (
    <Link
      to="/c/$coinId"
      params={{
        coinId: String(sale.coinId),
      }}
      className="block"
      onClick={(e) => {
        // Prevent navigation if coinId is invalid
        if (!sale.coinId) {
          e.preventDefault();
          console.error("Invalid coinId:", sale);
        }
      }}
    >
      <div
        className="border border-border hover:border-primary active:border-primary/80 p-3 bg-card text-card-foreground transition-all duration-200 relative overflow-hidden hover:shadow-lg hover:bg-accent/5 active:scale-[0.99] cursor-pointer"
        style={{
          background: sale.status === "FINALIZED" 
            ? `linear-gradient(to right, 
                rgba(245, 158, 11, 0.05) 0%, 
                rgba(245, 158, 11, 0.1) 100%)`
            : `linear-gradient(to right, 
                rgba(34, 197, 94, 0.05) 0%, 
                rgba(34, 197, 94, 0.1) ${fundedPercentage}%, 
                transparent ${fundedPercentage}%)`
        }}
      >
      <div className="flex items-start gap-4 group">
        {/* Coin Image */}
        <div className="flex-shrink-0">
          <CoinImagePopup
            imageUrl={sale.coin?.imageUrl ? formatImageURL(sale.coin.imageUrl) : null}
            coinName={sale.coin?.name || "Unknown"}
            coinSymbol={sale.coin?.symbol || "???"}
            size="sm"
            className="border border-border pointer-events-none"
          />
        </div>

        {/* Sale Info */}
        <div className="flex-1 font-mono text-sm">
          <div className="font-bold group-hover:text-primary transition-colors">
            {sale.coin?.name || "Unknown"} ({sale.coin?.symbol || "???"}) 
          </div>
          <div className="text-gray-600 mt-1">
            {sale.coin?.description || "No description available"}
          </div>
          <div className="mt-2 space-y-2 text-xs">
            {/* Price and funding info */}
            <div className="grid grid-cols-2 gap-x-3 text-[11px]">
              <div>
                <span className="text-muted-foreground">{sale.status === "FINALIZED" ? t("sale.final_price_label") : t("sale.price_label")}</span>
                <div className="font-medium">
                  {formattedPrice}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">{t("sale.funded_label")}</span>
                <div className="font-medium">
                  {fundedPercentage.toFixed(1)}%
                </div>
              </div>
            </div>
            
            {/* Trading activity */}
            <div className="border-t border-border/30 pt-1 text-[11px]">
              <div className="font-medium">
                {t("sale.buys_label")} {sale.purchases?.totalCount || 0} | {t("sale.sells_label")} {sale.sells?.totalCount || 0} | {t("sale.wallets_label")} {uniqueWalletCount}
              </div>
            </div>
            
            {/* Creator */}
            <div className="flex items-center gap-1 border-t border-border/30 pt-1">
              <span>{t("sale.creator_label")}</span>
              <CreatorDisplay 
                address={sale.creator} 
                size="sm"
                showLabel={false}
                className="text-xs"
              />
            </div>
          </div>
        </div>

        {/* Bonding Curve Chart */}
        <div className="flex-shrink-0 w-32">
          <div className="border border-border rounded-sm p-1 bg-muted/20">
            <ZCurveMiniChart 
              sale={sale} 
              className="h-16 w-full pointer-events-none"
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
          <div className="mt-2 text-gray-600 text-[11px]">
            <div>{new Date(sale.createdAt * 1000).toLocaleDateString()}</div>
            <div>
              {(() => {
                const deadline = new Date(Number(sale.deadline) * 1000);
                const created = new Date(sale.createdAt * 1000);
                const durationMs = deadline.getTime() - created.getTime();
                const days = Math.round(durationMs / (1000 * 60 * 60 * 24));
                
                if (days === 14) {
                  return "→ 2 weeks";
                } else if (days === 7) {
                  return "→ 1 week";
                } else if (days === 1) {
                  return "→ 1 day";
                } else {
                  return `→ ${days} days`;
                }
              })()}
            </div>
          </div>
        </div>
      </div>
      
      {/* Progress bar at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-border/20">
        <div 
          className={`h-full transition-all duration-300 ${sale.status === "FINALIZED" ? "bg-amber-500/50" : "bg-green-500/50"}`}
          style={{ 
            width: `${fundedPercentage}%` 
          }}
        />
      </div>
    </div>
  </Link>
  );
});

SaleCard.displayName = 'SaleCard';

export const ZCurveSales = () => {
  const { data: sales, isLoading, error } = useZCurveSales();
  const { theme } = useTheme();
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="border-2 border-border bg-background p-4">
          <div className="font-mono text-sm">&gt; loading sales data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="border-2 border-border bg-background p-4">
          <div className="font-mono text-sm text-destructive">
            &gt; error: {error.message}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="">
      <div className="">
        {/* Header */}
        <div className="border-border text-foreground p-3">
          <h2 className="font-mono text-2xl tracking-widest font-bold uppercase">
            ZCURVE {t("common.sales")} ({sales?.length || 0})
          </h2>
        </div>

        {/* Sales List */}
        <div className="p-4">
          {!sales || sales.length === 0 ? (
            <div className="font-mono text-sm text-secondary-foreground bg-secondary">
              &gt; no sales found
            </div>
          ) : (
            <div className="border-l-4 border-border m-0 p-0">
              {sales.map((sale: any) => (
                <SaleCard key={sale.coinId} sale={sale} />
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Video */}
      <video
        className="fixed bottom-5 right-5 w-40 h-40 pointer-events-none z-50"
        style={{
          clipPath: "polygon(50% 10%, 75% 50%, 50% 90%, 25% 50%)",
        }}
        src={theme === "dark" ? "/zammzamm-bw.mp4" : "/zammzamm.mp4"}
        autoPlay
        loop
        muted
        playsInline
      />
    </div>
  );
};
