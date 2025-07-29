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
              {sales.map((sale: any) => {
                // Calculate unique buyers and sellers
                const uniqueBuyers = new Set(sale.purchases?.items?.map((p: any) => p.buyer) || []);
                const uniqueSellers = new Set(sale.sells?.items?.map((s: any) => s.seller) || []);
                const uniqueWallets = new Set([...uniqueBuyers, ...uniqueSellers]);
                
                return (
                  <Link
                    key={sale.coinId}
                    to="/c/$coinId"
                    params={{
                      coinId: sale.coinId,
                    }}
                  >
                    <div
                      className="border border-card hover:border-border active:border-primary p-3 bg-card text-card-foreground transition-all duration-100 relative overflow-hidden hover:shadow-md active:scale-[0.99] touch-manipulation"
                      style={{
                        background: sale.status === "FINALIZED" 
                          ? `linear-gradient(to right, 
                              rgba(245, 158, 11, 0.05) 0%, 
                              rgba(245, 158, 11, 0.1) 100%)`
                          : `linear-gradient(to right, 
                              rgba(34, 197, 94, 0.05) 0%, 
                              rgba(34, 197, 94, 0.1) ${(() => {
                                const ethEscrow = BigInt(sale.ethEscrow);
                                const ethTarget = BigInt(sale.ethTarget);
                                if (ethTarget === 0n) return 0;
                                const percentage = Number((ethEscrow * 10000n) / ethTarget) / 100;
                                return Math.min(percentage, 100);
                              })()}%, 
                              transparent ${(() => {
                                const ethEscrow = BigInt(sale.ethEscrow);
                                const ethTarget = BigInt(sale.ethTarget);
                                if (ethTarget === 0n) return 0;
                                const percentage = Number((ethEscrow * 10000n) / ethTarget) / 100;
                                return Math.min(percentage, 100);
                              })()}%)`
                      }}
                    >
                    <div className="flex items-start gap-4">
                      {/* Coin Image */}
                      <div className="flex-shrink-0">
                        <CoinImagePopup
                          imageUrl={sale.coin.imageUrl ? formatImageURL(sale.coin.imageUrl) : null}
                          coinName={sale.coin.name}
                          coinSymbol={sale.coin.symbol}
                          size="sm"
                          className="border border-border"
                        />
                      </div>

                      {/* Sale Info */}
                      <div className="flex-1 font-mono text-sm">
                        <div className="font-bold">
                          {sale.coin.name} ({sale.coin.symbol})
                        </div>
                        <div className="text-gray-600 mt-1">
                          {sale.coin.description}
                        </div>
                        <div className="mt-2 space-y-2 text-xs">
                          {/* Price and funding info */}
                          <div className="grid grid-cols-2 gap-x-3 text-[11px]">
                            <div>
                              <span className="text-muted-foreground">{sale.status === "FINALIZED" ? t("sale.final_price_label") : t("sale.price_label")}</span>
                              <div className="font-medium">
                                {(() => {
                              // For finalized sales, if currentPrice is 0, calculate from ethTarget or ethEscrow
                              let priceInWei = Number(sale.currentPrice);
                              
                              if (sale.status === "FINALIZED" && priceInWei === 0) {
                                // For finalized sales, calculate average price from what was actually raised
                                const tokensSold = BigInt(sale.netSold);
                                
                                // Check if we have ethEscrow first (amount in escrow before finalization)
                                let ethRaised = BigInt(sale.ethEscrow);
                                
                                // If ethEscrow is 0 (funds transferred), use ethTarget as approximation
                                if (ethRaised === 0n) {
                                  ethRaised = BigInt(sale.ethTarget);
                                }
                                
                                if (tokensSold > 0n && ethRaised > 0n) {
                                  // Average price per token = total ETH raised / tokens sold
                                  priceInWei = Number((ethRaised * BigInt(1e18)) / tokensSold);
                                }
                              }
                              
                              const priceInEth = priceInWei / 1e18;
                              
                              // Handle truly zero price
                              if (priceInEth === 0) {
                                return "0";
                              }
                              
                              // Helper to format small numbers with visual grouping
                              const formatSmallNumber = (num: number): string => {
                                const str = num.toFixed(12).replace(/\.?0+$/, '');
                                const parts = str.split('.');
                                if (parts.length === 2 && parts[1].length > 3) {
                                  // Count leading zeros after decimal
                                  const leadingZeros = parts[1].match(/^0+/)?.[0].length || 0;
                                  if (leadingZeros >= 3) {
                                    // Show as 0.{6}1234 format
                                    const significantPart = parts[1].slice(leadingZeros);
                                    return `0.{${leadingZeros}}${significantPart.slice(0, 4)}`;
                                  }
                                  // Group digits with thin spaces for readability
                                  const grouped = parts[1].replace(/(\d{3})(?=\d)/g, '$1 ');
                                  return `0.${grouped}`;
                                }
                                return str;
                              };
                              
                              // Format based on size
                              if (priceInEth < 1e-15) {
                                const wei = priceInEth * 1e18;
                                if (wei < 1) {
                                  // For sub-wei prices (from integer division)
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
                                // Use visual separators for small ETH amounts
                                return (
                                  <span className="font-mono">
                                    {formatSmallNumber(priceInEth)} ETH
                                  </span>
                                );
                              }
                              return `${priceInEth.toFixed(6)} ETH`;
                            })()}
                              </div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">{t("sale.funded_label")}</span>
                              <div className="font-medium">
                                {(() => {
                              if (sale.status === "FINALIZED") return "100.0";
                              // Use percentFunded from indexer if available (already calculated correctly)
                              if (sale.percentFunded !== undefined && sale.percentFunded !== null) {
                                return (sale.percentFunded / 100).toFixed(1);
                              }
                              // Otherwise calculate funding percentage from ethEscrow and ethTarget
                              const ethEscrow = BigInt(sale.ethEscrow);
                              const ethTarget = BigInt(sale.ethTarget);
                              if (ethTarget === 0n) return "0.0";
                              const percentage = Number((ethEscrow * 10000n) / ethTarget) / 100;
                              return percentage.toFixed(1);
                            })()}%
                              </div>
                            </div>
                          </div>
                          
                          {/* Trading activity */}
                          <div className="border-t border-border/30 pt-1 text-[11px]">
                            <div className="font-medium">
                              {t("sale.buys_label")} {sale.purchases?.totalCount || 0} | {t("sale.sells_label")} {sale.sells?.totalCount || 0} | {t("sale.wallets_label")} {uniqueWallets.size}
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
                          width: sale.status === "FINALIZED" ? '100%' : `${(() => {
                            const ethEscrow = BigInt(sale.ethEscrow);
                            const ethTarget = BigInt(sale.ethTarget);
                            if (ethTarget === 0n) return 0;
                            const percentage = Number((ethEscrow * 10000n) / ethTarget) / 100;
                            return Math.min(percentage, 100);
                          })()}%` 
                        }}
                      />
                    </div>
                  </div>
                </Link>
              );
              })}
            </div>
          )}
        </div>
      </div>
      
      {/* Animated Logo */}
      <video
        className="fixed bottom-5 right-5 w-32 h-32 md:w-40 md:h-40 opacity-80 pointer-events-none"
        style={{
          clipPath: "polygon(50% 10%, 75% 50%, 50% 90%, 25% 50%)",
          zIndex: 10
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
