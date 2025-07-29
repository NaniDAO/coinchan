import { formatImageURL } from "@/hooks/metadata";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "./ui/badge";
import { CreatorDisplay } from "./CreatorDisplay";
import { ZCurveMiniChart } from "./ZCurveMiniChart";

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
  });
};

export const ZCurveSales = () => {
  const { data: sales, isLoading, error } = useZCurveSales();

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
            ZCURVE SALES ({sales?.length || 0})
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
                <Link
                  to="/c/$coinId"
                  params={{
                    coinId: sale.coinId,
                  }}
                >
                  <div
                    key={sale.coinId}
                    className="border border-card hover:border-border p-3 bg-card text-card-foreground transition-all duration-100"
                  >
                    <div className="flex items-start gap-4">
                      {/* Coin Image */}
                      <div className="flex-shrink-0">
                        {sale.coin.imageUrl ? (
                          <img
                            src={formatImageURL(sale.coin.imageUrl)}
                            alt={sale.coin.name}
                            className="w-8 h-8 border border-black"
                          />
                        ) : (
                          <div className="w-8 h-8 border border-black bg-gray-200 flex items-center justify-center">
                            <span className="text-xs font-mono">?</span>
                          </div>
                        )}
                      </div>

                      {/* Sale Info */}
                      <div className="flex-1 font-mono text-sm">
                        <div className="font-bold">
                          {sale.coin.name} ({sale.coin.symbol})
                        </div>
                        <div className="text-gray-600 mt-1">
                          {sale.coin.description}
                        </div>
                        <div className="mt-2 space-y-1 text-xs">
                          <div>
                            price: {(() => {
                              // currentPrice is in wei, need to convert to ETH
                              const priceInEth = Number(sale.currentPrice) / 1e18;
                              if (priceInEth === 0) return "0";
                              if (priceInEth < 1e-15) {
                                const wei = priceInEth * 1e18;
                                return `${wei.toExponential(2)} wei`;
                              }
                              if (priceInEth < 1e-9) {
                                const gwei = priceInEth * 1e9;
                                return `${gwei.toFixed(3)} gwei`;
                              }
                              if (priceInEth < 1e-6) {
                                return `${(priceInEth * 1e6).toFixed(3)} μETH`;
                              }
                              if (priceInEth < 0.001) {
                                return `${(priceInEth * 1000).toFixed(4)} mETH`;
                              }
                              return `${priceInEth.toFixed(6)} ETH`;
                            })()}
                          </div>
                          <div>
                            funded: {(() => {
                              // Calculate funding percentage from ethEscrow and ethTarget
                              const ethEscrow = BigInt(sale.ethEscrow);
                              const ethTarget = BigInt(sale.ethTarget);
                              if (ethTarget === 0n) return "0.0";
                              const percentage = Number((ethEscrow * 10000n) / ethTarget) / 100;
                              return percentage.toFixed(1);
                            })()}%
                          </div>
                          <div>purchases: {sale.purchases.totalCount}</div>
                          <div className="flex items-center gap-1">
                            <span>creator:</span>
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
                              : "bg-gray-200 text-gray-600",
                          )}
                        >
                          {sale.status}
                        </Badge>
                        <div className="mt-2 text-gray-600">
                          {new Date(sale.createdAt * 1000).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
