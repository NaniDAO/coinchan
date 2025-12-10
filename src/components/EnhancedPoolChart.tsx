import { Suspense, useState, useEffect, useRef, lazy, useCallback } from "react";
import { CandlestickChartIcon, LineChartIcon } from "lucide-react";
import { LoadingLogo } from "./ui/loading-logo";
import { cn, formatEthAmount } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

const PoolPriceChart = lazy(() => import("@/components/PoolPriceChart"));
const PoolCandleChart = lazy(() => import("@/PoolCandleChart"));

interface EnhancedPoolChartProps {
  poolId: string;
  coinSymbol?: string;
  ethPrice?: {
    priceUSD: number;
  };
  priceImpact?: {
    currentPrice: number;
    projectedPrice: number;
    impactPercent: number;
    action: "buy" | "sell";
  } | null;
  onTransactionSuccess?: () => void;
}

export const EnhancedPoolChart = ({
  poolId,
  coinSymbol,
  ethPrice,
  priceImpact,
  onTransactionSuccess,
}: EnhancedPoolChartProps) => {
  const [chartType, setChartType] = useState<"line" | "candle">("line");
  const [chartKey, setChartKey] = useState(0);
  const queryClient = useQueryClient();
  const chartRef = useRef<HTMLDivElement>(null);
  const [isStable, setIsStable] = useState(false);
  const mountedRef = useRef(true);

  // Ensure chart stability
  useEffect(() => {
    mountedRef.current = true;
    // Add a small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      if (mountedRef.current) {
        setIsStable(true);
      }
    }, 100);

    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
    };
  }, []);

  // Handle transaction success - refresh chart data
  useEffect(() => {
    if (onTransactionSuccess) {
      // Placeholder for future use
      // onTransactionSuccess will be called from parent component
    }
  }, [onTransactionSuccess]);

  // Force refresh chart data
  const refreshChartData = useCallback(() => {
    // Invalidate pool price points query
    queryClient.invalidateQueries({ queryKey: ["poolPricePoints", poolId] });
    // Force re-render of chart by updating key
    setChartKey((prev) => prev + 1);
  }, [poolId, queryClient]);

  // Handle chart type change with stability
  const handleChartTypeChange = useCallback((type: "line" | "candle") => {
    setIsStable(false);
    setChartType(type);
    setTimeout(() => {
      if (mountedRef.current) {
        setIsStable(true);
      }
    }, 50);
  }, []);

  // Prevent chart flashing by maintaining minimum height
  // Increased minHeight to accommodate candlestick chart with controls
  const chartContainerStyle = {
    minHeight: "480px",
    position: "relative" as const,
  };

  if (!isStable) {
    return (
      <div className="bg-card p-4 rounded-lg col-span-1 lg:col-span-7" style={chartContainerStyle}>
        <div className="flex items-center justify-center h-[400px]">
          <LoadingLogo />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card p-4 rounded-lg col-span-1 lg:col-span-7" ref={chartRef}>
      <div style={chartContainerStyle}>
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-[400px]">
              <LoadingLogo />
            </div>
          }
        >
          <div key={chartKey} className="chart-wrapper">
            {chartType === "line" ? (
              <PoolPriceChart
                poolId={poolId}
                ticker={coinSymbol}
                ethUsdPrice={ethPrice?.priceUSD}
                priceImpact={priceImpact}
              />
            ) : (
              <PoolCandleChart poolId={poolId} interval="1d" ticker={coinSymbol} ethUsdPrice={ethPrice?.priceUSD} />
            )}
          </div>
        </Suspense>
      </div>

      <div className="w-fit border border-border flex flex-row items-center mt-2">
        <button
          onClick={() => handleChartTypeChange("candle")}
          className={cn(
            "h-8 px-2 sm:px-3 flex items-center justify-center transition-all",
            chartType === "candle" ? "bg-primary !text-primary-foreground" : "bg-transparent hover:bg-muted",
          )}
          disabled={!isStable}
        >
          <CandlestickChartIcon className="h-4 w-4" />
        </button>
        <button
          onClick={() => handleChartTypeChange("line")}
          className={cn(
            "h-8 px-2 sm:px-3 flex items-center justify-center transition-all",
            chartType === "line" ? "bg-primary !text-primary-foreground" : "bg-transparent hover:bg-muted",
          )}
          disabled={!isStable}
        >
          <LineChartIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Price Impact Indicator */}
      {priceImpact && priceImpact.impactPercent > 0 && (
        <div
          className={cn(
            "mt-3 p-3 rounded-md text-sm",
            // Color based on price movement direction and magnitude
            // Green for price going up (buying), Red for price going down (selling)
            // Yellow/Orange for high impact warnings regardless of direction
            priceImpact.impactPercent > 15
              ? "bg-orange-500/10 text-orange-600 dark:text-orange-400" // Very high impact warning
              : priceImpact.impactPercent > 10
                ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" // High impact warning
                : priceImpact.action === "buy"
                  ? "bg-green-500/10 text-green-600 dark:text-green-400" // Price going up (positive)
                  : "bg-red-500/10 text-red-600 dark:text-red-400", // Price going down (negative)
          )}
        >
          <div className="flex items-center justify-between">
            <span className="font-medium">Price Impact: {priceImpact.impactPercent.toFixed(2)}%</span>
            <span className="text-xs">
              {priceImpact.action === "buy" ? "Buying" : "Selling"} will move price{" "}
              {priceImpact.action === "buy" ? "up" : "down"}
            </span>
          </div>
          <div className="text-xs mt-1 opacity-80">
            Current: {formatEthAmount(priceImpact.currentPrice)} ETH → After trade:{" "}
            {formatEthAmount(priceImpact.projectedPrice)} ETH
          </div>
        </div>
      )}

      {/* Auto-refresh indicator */}
      {onTransactionSuccess && (
        <button
          onClick={refreshChartData}
          className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ↻ Refresh chart data
        </button>
      )}
    </div>
  );
};

// Add some global styles for chart stability
const style = document.createElement("style");
style.textContent = `
  .chart-wrapper {
    position: relative;
    width: 100%;
  }

  /* Prevent layout shift during chart loading */
  .tv-lightweight-charts {
    min-height: 300px;
  }
`;
document.head.appendChild(style);
