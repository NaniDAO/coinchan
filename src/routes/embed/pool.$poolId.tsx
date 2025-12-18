import { createFileRoute } from "@tanstack/react-router";
import PoolPriceChart from "@/components/PoolPriceChart";
import PredictionMarketOddsChart from "@/components/pools/PredictionMarketOddsChart";
import { useEthUsdPrice } from "@/hooks/use-eth-usd-price";
import { useGetPool } from "@/hooks/use-get-pool";
import { usePAMMMarket } from "@/hooks/use-pamm-market";
import { useEffect } from "react";
import { LoadingLogo } from "@/components/ui/loading-logo";

type TimeRange = "24h" | "1w" | "1m" | "all";

interface EmbedSearchParams {
  theme?: "light" | "dark";
  range?: TimeRange;
}

export const Route = createFileRoute("/embed/pool/$poolId" as any)({
  component: EmbedPoolChart,
  validateSearch: (search: Record<string, unknown>): EmbedSearchParams => ({
    theme: search.theme === "light" || search.theme === "dark" ? search.theme : undefined,
    range: ["24h", "1w", "1m", "all"].includes(search.range as string)
      ? (search.range as TimeRange)
      : undefined,
  }),
});

function EmbedPoolChart() {
  const { poolId } = Route.useParams() as { poolId: string };
  const { theme, range } = Route.useSearch() as EmbedSearchParams;
  const { data: ethUsdPrice } = useEthUsdPrice();

  // Fetch pool to get ticker and check if it's a prediction market
  const { data: cookbookPool, isLoading: cookbookLoading } = useGetPool(poolId, "COOKBOOK");
  const { data: zammPool, isLoading: zammLoading } = useGetPool(poolId, "ZAMM");
  const pool = cookbookPool || zammPool;
  const isLoading = cookbookLoading && zammLoading;

  // Check if this is a PAMM prediction market pool
  const { data: pammData } = usePAMMMarket(pool ?? null);
  const isPredictionMarket = pammData?.isPAMMPool && pammData?.marketId !== null;

  // Apply theme from query param
  useEffect(() => {
    if (theme) {
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(theme);
    }
  }, [theme]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <LoadingLogo />
      </div>
    );
  }

  if (!pool) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-muted-foreground">
        Pool not found
      </div>
    );
  }

  // Render prediction market odds chart for PAMM pools
  if (isPredictionMarket && pammData) {
    return (
      <div className="h-screen w-full bg-background p-4">
        <PredictionMarketOddsChart
          poolId={poolId}
          yesIsId0={pammData.yesIsId0}
          defaultTimeRange={range || "1w"}
        />
      </div>
    );
  }

  // Render standard price chart for regular pools
  return (
    <div className="h-screen w-full bg-background p-4">
      <PoolPriceChart
        poolId={poolId}
        ticker={pool.coin1?.symbol || "TOKEN"}
        ethUsdPrice={ethUsdPrice}
        defaultTimeRange={range || "1w"}
      />
    </div>
  );
}
