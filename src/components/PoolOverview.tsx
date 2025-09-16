import { useTranslation } from "react-i18next";
import { CoinHolders } from "@/components/CoinHolders";
import { PoolEvents } from "@/components/PoolEvents";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorBoundary } from "./ErrorBoundary";
import { CoinPoolsList } from "./CoinPoolsList";
import { Address } from "viem";

export const PoolOverview = ({
  poolId,
  coinId,
  symbol = "TKN",
  token,
}: {
  poolId: string;
  coinId: string;
  token: Address;
  symbol?: string;
  priceImpact?: {
    currentPrice: number;
    projectedPrice: number;
    impactPercent: number;
    action: "buy" | "sell";
  } | null;
}) => {
  const { t } = useTranslation();

  return (
    <Tabs defaultValue="activity">
      <TabsList>
        <TabsTrigger value="holders">{t("common.holders")}</TabsTrigger>
        <TabsTrigger value="activity">{t("common.activity")}</TabsTrigger>
        <TabsTrigger value="pools">{t("common.pools")}</TabsTrigger>
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
      <TabsContent value="pools" className="mt-4 sm:mt-6">
        <ErrorBoundary fallback={<p className="text-destructive">Pool Activity unavailable</p>}>
          <CoinPoolsList coinId={coinId} token={token} ticker={symbol} />
        </ErrorBoundary>
      </TabsContent>
    </Tabs>
  );
};
