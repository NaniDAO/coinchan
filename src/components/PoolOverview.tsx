import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CoinHolders } from "@/components/CoinHolders";
import { PoolEvents } from "@/components/PoolEvents";
import PoolPriceChart from "@/components/PoolPriceChart";
import { ErrorBoundary } from "./ErrorBoundary";

export const PoolOverview = ({
  poolId,
  symbol = "TKN",
}: {
  poolId: string;
  symbol?: string;
}) => {
  return (
    <Tabs>
      <TabsList>
        <TabsTrigger value="chart">Chart</TabsTrigger>
        <TabsTrigger value="holders">Holders</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="chart" className="mt-4 sm:mt-6">
        <ErrorBoundary
          fallback={<p className="text-destructive">Pool chart unavailable</p>}
        >
          <PoolPriceChart poolId={poolId} ticker={symbol} />
        </ErrorBoundary>
      </TabsContent>
      <TabsContent value="holders" className="mt-4 sm:mt-6">
        <ErrorBoundary
          fallback={
            <p className="text-destructive">Pool holders unavailable</p>
          }
        >
          <CoinHolders coinId={poolId} symbol={symbol} />
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
