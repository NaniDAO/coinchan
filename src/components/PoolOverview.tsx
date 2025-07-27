import { CoinHolders } from "@/components/CoinHolders";
import { PoolEvents } from "@/components/PoolEvents";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorBoundary } from "./ErrorBoundary";

export const PoolOverview = ({
  poolId,
  coinId,
  symbol = "TKN",
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
  return (
    <Tabs defaultValue="holders">
      <TabsList>
        <TabsTrigger value="holders">Holders</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
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
