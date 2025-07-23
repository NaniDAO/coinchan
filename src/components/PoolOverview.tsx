import PoolCandleChart from "@/PoolCandleChart";
import { CoinHolders } from "@/components/CoinHolders";
import { PoolEvents } from "@/components/PoolEvents";
import PoolPriceChart from "@/components/PoolPriceChart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CandlestickChartIcon, LineChartIcon } from "lucide-react";
import { useState } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { Button } from "./ui/button";
import { useEthUsdPrice } from "@/hooks/use-eth-usd-price";

enum ChartType {
  LINE = "line",
  CANDLE = "candle",
}

export const PoolOverview = ({
  poolId,
  coinId,
  symbol = "TKN",
  priceImpact,
}: {
  poolId: string;
  coinId: string;
  symbol?: string;
  priceImpact?: {
    currentPrice: number;
    projectedPrice: number;
    impactPercent: number;
    action: "buy" | "sell";
  } | null;
}) => {
  const [chartType, setChartType] = useState<ChartType>(ChartType.LINE);
  const { data: ethUsdPrice } = useEthUsdPrice();

  return (
    <Tabs defaultValue="chart">
      <TabsList>
        <TabsTrigger value="chart">Chart</TabsTrigger>
        <TabsTrigger value="holders">Holders</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="chart" className="mt-4 sm:mt-6">
        <ErrorBoundary fallback={<p className="text-destructive">Pool chart unavailable</p>}>
          {chartType === ChartType.CANDLE && <PoolCandleChart poolId={poolId} interval={"1d"} />}
          {chartType === ChartType.LINE && (
            <PoolPriceChart poolId={poolId} ticker={symbol} ethUsdPrice={ethUsdPrice} priceImpact={priceImpact} />
          )}
          <Button onClick={() => setChartType(chartType === ChartType.LINE ? ChartType.CANDLE : ChartType.LINE)}>
            {chartType === ChartType.CANDLE ? <LineChartIcon /> : <CandlestickChartIcon />}
          </Button>
        </ErrorBoundary>
      </TabsContent>
      <TabsContent value="holders" className="mt-4 sm:mt-6">
        <ErrorBoundary fallback={<p className="text-destructive">Pool holders unavailable</p>}>
          <CoinHolders coinId={coinId} symbol={symbol} />
        </ErrorBoundary>
      </TabsContent>
      <TabsContent value="activity" className="mt-4 sm:mt-6">
        <ErrorBoundary fallback={<p className="text-destructive">Pool Activity unavailable</p>}>
          <PoolEvents poolId={poolId} ticker={symbol} />
        </ErrorBoundary>
      </TabsContent>
    </Tabs>
  );
};
