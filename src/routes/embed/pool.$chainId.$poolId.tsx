import { createFileRoute } from "@tanstack/react-router";
import PoolPriceChart from "@/components/PoolPriceChart";
import { useEthUsdPrice } from "@/hooks/use-eth-usd-price";
import { useGetPool } from "@/hooks/use-get-pool";
import { Suspense, lazy, useEffect } from "react";
import { LoadingLogo } from "@/components/ui/loading-logo";

const PoolCandleChart = lazy(() => import("@/PoolCandleChart"));

type TimeRange = "24h" | "1w" | "1m" | "all";
type ChartType = "line" | "candle";
type CandleInterval = "1h" | "1d";

interface EmbedSearchParams {
  theme?: "light" | "dark";
  range?: TimeRange;
  type?: ChartType;
  interval?: CandleInterval;
}

export const Route = createFileRoute("/embed/pool/$chainId/$poolId" as any)({
  component: EmbedPoolChart,
  validateSearch: (search: Record<string, unknown>): EmbedSearchParams => ({
    theme: search.theme === "light" || search.theme === "dark" ? search.theme : undefined,
    range: ["24h", "1w", "1m", "all"].includes(search.range as string) ? (search.range as TimeRange) : undefined,
    type: search.type === "candle" ? "candle" : "line",
    interval: search.interval === "1h" || search.interval === "1d" ? search.interval : undefined,
  }),
});

function EmbedPoolChart() {
  const { poolId, chainId } = Route.useParams() as { poolId: string; chainId: string };
  const { theme, range, type, interval } = Route.useSearch() as EmbedSearchParams;
  const { data: ethUsdPrice } = useEthUsdPrice();

  // Fetch pool to get ticker
  const { data: cookbookPool, isLoading: cookbookLoading } = useGetPool(poolId, "COOKBOOK", chainId);
  const { data: zammPool, isLoading: zammLoading } = useGetPool(poolId, "ZAMM", chainId);
  const pool = cookbookPool || zammPool;
  const isLoading = cookbookLoading && zammLoading;

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

  const ticker = pool.coin1?.symbol || "TOKEN";

  return (
    <div className="h-screen w-full bg-background p-4">
      {type === "candle" ? (
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full">
              <LoadingLogo />
            </div>
          }
        >
          <PoolCandleChart poolId={poolId} interval={interval || "1h"} ticker={ticker} ethUsdPrice={ethUsdPrice} />
        </Suspense>
      ) : (
        <PoolPriceChart
          poolId={poolId}
          ticker={ticker}
          ethUsdPrice={ethUsdPrice}
          defaultTimeRange={range || "1w"}
        />
      )}
    </div>
  );
}
