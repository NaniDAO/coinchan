import { createFileRoute } from "@tanstack/react-router";
import PoolPriceChart from "@/components/PoolPriceChart";
import { useEthUsdPrice } from "@/hooks/use-eth-usd-price";
import { useGetPool } from "@/hooks/use-get-pool";
import { useEffect } from "react";
import { LoadingLogo } from "@/components/ui/loading-logo";

type TimeRange = "24h" | "1w" | "1m" | "all";

interface EmbedSearchParams {
  theme?: "light" | "dark";
  range?: TimeRange;
}

export const Route = createFileRoute("/embed/pool/$chainId/$poolId" as any)({
  component: EmbedPoolChart,
  validateSearch: (search: Record<string, unknown>): EmbedSearchParams => ({
    theme: search.theme === "light" || search.theme === "dark" ? search.theme : undefined,
    range: ["24h", "1w", "1m", "all"].includes(search.range as string) ? (search.range as TimeRange) : undefined,
  }),
});

function EmbedPoolChart() {
  const { poolId, chainId } = Route.useParams() as { poolId: string; chainId: string };
  const { theme, range } = Route.useSearch() as EmbedSearchParams;
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
