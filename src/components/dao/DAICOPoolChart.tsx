import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Droplet, ArrowLeftRight } from "lucide-react";
import { EnhancedPoolChart } from "@/components/EnhancedPoolChart";
import { Link } from "@tanstack/react-router";

interface DAICOPoolChartProps {
  poolId?: string;
  coinSymbol?: string;
  ethUsdPrice?: number;
  swapLink?: string; // Link to swap page with pre-filled token
  hasSwaps?: boolean; // Whether any swaps have occurred
}

export function DAICOPoolChart({ poolId, coinSymbol, ethUsdPrice, swapLink, hasSwaps }: DAICOPoolChartProps) {
  // Pool exists but no swaps yet - show placeholder with swap CTA
  if (poolId && !hasSwaps) {
    return (
      <Card className="p-12 backdrop-blur-xl bg-gradient-to-br from-background/60 via-primary/5 to-background/40 border-primary/20 shadow-lg w-full flex items-center justify-center">
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          <div className="p-4 rounded-full bg-muted/50 backdrop-blur-sm">
            <TrendingUp className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold text-lg mb-1">No Trading Activity Yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-4">
              Price data will converge to the DAICO sale price. Start trading to see the price chart.
            </p>
            {swapLink && (
              <Link to={swapLink}>
                <Button variant="default" size="sm" className="gap-2">
                  <ArrowLeftRight className="w-4 h-4" />
                  Start Trading
                </Button>
              </Link>
            )}
          </div>
        </div>
      </Card>
    );
  }

  // Pool exists and has swaps - show chart
  if (poolId) {
    return (
      <Card className="p-6 backdrop-blur-xl bg-background/60 border-primary/10 shadow-lg w-full flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Liquidity Pool Chart
          </h3>
          {swapLink && (
            <Link to={swapLink}>
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowLeftRight className="w-4 h-4" />
                Swap
              </Button>
            </Link>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <EnhancedPoolChart
            poolId={poolId}
            coinSymbol={coinSymbol || "TOKEN"}
            ethPrice={ethUsdPrice ? { priceUSD: ethUsdPrice } : undefined}
          />
        </div>
      </Card>
    );
  }

  // Pool not initialized yet
  return (
    <Card className="p-12 backdrop-blur-xl bg-gradient-to-br from-background/60 via-primary/5 to-background/40 border-primary/20 shadow-lg w-full flex items-center justify-center">
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <div className="p-4 rounded-full bg-muted/50 backdrop-blur-sm">
          <Droplet className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-semibold text-lg mb-1">Pool Not Initialized</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            The liquidity pool hasn't been created yet. Once the sale concludes and LP is initialized, the price chart
            will appear here.
          </p>
        </div>
      </div>
    </Card>
  );
}
