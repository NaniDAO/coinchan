import { Suspense, useState, lazy } from "react";
import { CandlestickChartIcon, LineChartIcon } from "lucide-react";
import { LoadingLogo } from "./ui/loading-logo";
import { cn } from "@/lib/utils";

const PoolPriceChart = lazy(() => import("@/components/PoolPriceChart"));
const PoolCandleChart = lazy(() => import("@/PoolCandleChart"));

interface PoolChartProps {
  poolId: string;
  coinSymbol: string;
  ethPrice?: {
    priceUSD: number;
  };
}

export const PoolChart = ({ poolId, coinSymbol, ethPrice }: PoolChartProps) => {
  const [chartType, setChartType] = useState<"line" | "candle">("line");

  return (
    <div className="bg-card p-4 rounded-lg col-span-1 lg:col-span-7">
      <Suspense
        fallback={
          <div className="flex items-center justify-center">
            <LoadingLogo />
          </div>
        }
      >
        {chartType === "line" ? (
          <PoolPriceChart
            poolId={poolId}
            ticker={coinSymbol}
            ethUsdPrice={ethPrice?.priceUSD}
          />
        ) : (
          <PoolCandleChart
            poolId={poolId}
            interval="1d"
            ticker={coinSymbol}
            ethUsdPrice={ethPrice?.priceUSD}
          />
        )}
      </Suspense>
      <div className="w-fit border border-border flex flex-row items-center mt-2">
        <button
          onClick={() => setChartType("candle")}
          className={cn(
            "h-8 px-2 sm:px-3 flex items-center justify-center",
            chartType === "candle"
              ? "bg-primary !text-primary-foreground"
              : "bg-transparent",
          )}
        >
          <CandlestickChartIcon className="h-4 w-4" />
        </button>
        <button
          onClick={() => setChartType("line")}
          className={cn(
            "h-8 px-2 sm:px-3 flex items-center justify-center",
            chartType === "line"
              ? "bg-primary !text-primary-foreground"
              : "bg-transparent",
          )}
        >
          <LineChartIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
