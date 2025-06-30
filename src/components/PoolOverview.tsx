import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CoinHolders } from "@/components/CoinHolders";
import { PoolEvents } from "@/components/PoolEvents";
import PoolPriceChart from "@/components/PoolPriceChart";
import { ErrorBoundary } from "./ErrorBoundary";
import PoolCandleChart from "@/PoolCandleChart";

export const PoolOverview = ({
  poolId,
  coinId,
  symbol = "TKN",
}: {
  poolId: string;
  coinId: string;
  symbol?: string;
}) => {
  return (
    <Tabs defaultValue="chart">
      <TabsList>
        <TabsTrigger value="chart">Chart</TabsTrigger>
        <TabsTrigger value="holders">Holders</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="chart" className="mt-4 sm:mt-6">
        <ErrorBoundary
          fallback={<p className="text-destructive">Pool chart unavailable</p>}
        >
          <PoolCandleChart poolId={poolId} interval={"1d"} />
          <PoolPriceChart poolId={poolId} ticker={symbol} />
        </ErrorBoundary>
      </TabsContent>
      <TabsContent value="holders" className="mt-4 sm:mt-6">
        <ErrorBoundary
          fallback={
            <p className="text-destructive">Pool holders unavailable</p>
          }
        >
          <CoinHolders coinId={coinId} symbol={symbol} />
        </ErrorBoundary>
      </TabsContent>
      <TabsContent value="activity" className="mt-4 sm:mt-6">
        <ErrorBoundary
          fallback={
            <p className="text-destructive">Pool Activity unavailable</p>
          }
        >
          <PoolEvents poolId={poolId} ticker={symbol} />
        </ErrorBoundary>
      </TabsContent>
    </Tabs>
  );
};
