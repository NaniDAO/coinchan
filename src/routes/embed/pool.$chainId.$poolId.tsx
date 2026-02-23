import { createFileRoute } from "@tanstack/react-router";
import PoolPriceChart from "@/components/PoolPriceChart";
import { useEthUsdPrice } from "@/hooks/use-eth-usd-price";
import { useGetPool } from "@/hooks/use-get-pool";
import { Suspense, lazy, useEffect, useMemo } from "react";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { PAMMSingletonAddress, identifyYesNoIds } from "@/constants/PAMMSingleton";
import { isAddressEqual } from "viem";
import PredictionOddsChart from "@/components/PredictionOddsChart";

const PoolCandleChart = lazy(() => import("@/PoolCandleChart"));

type TimeRange = "24h" | "1w" | "1m" | "all";
type ChartType = "line" | "candle";
type CandleInterval = "1m" | "1h" | "1d";

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
    interval: search.interval === "1m" || search.interval === "1h" || search.interval === "1d" ? search.interval : undefined,
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

  // Detect PAMM prediction market pool
  const marketId = useMemo(() => {
    if (!pool?.token0 || !pool?.token1 || !pool?.coin0Id || !pool?.coin1Id) return null;
    try {
      const isPAMM =
        isAddressEqual(pool.token0 as `0x${string}`, PAMMSingletonAddress) &&
        isAddressEqual(pool.token1 as `0x${string}`, PAMMSingletonAddress);
      if (!isPAMM) return null;
      const ids = identifyYesNoIds(BigInt(pool.coin0Id), BigInt(pool.coin1Id));
      return ids ? ids.marketId.toString() : null;
    } catch {
      return null;
    }
  }, [pool]);

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

  // PAMM prediction market pool — render odds chart
  if (marketId) {
    return (
      <div className="h-screen w-full bg-background p-4">
        <PredictionOddsChart marketId={marketId} />
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
