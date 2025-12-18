import { Button } from "@/components/ui/button";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { type PricePointData, fetchPoolPricePoints } from "@/lib/indexer";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, memo } from "react";
import { useTranslation } from "react-i18next";
import { formatEther } from "viem";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "@/lib/theme";

interface PredictionMarketOddsChartProps {
  poolId: string;
  yesIsId0: boolean; // Whether YES token is id0 (affects price interpretation)
  defaultTimeRange?: "24h" | "1w" | "1m" | "all";
}

/**
 * Converts pool price to YES probability percentage.
 *
 * In a constant product AMM:
 * - price1 = reserve0 / reserve1
 *
 * If YES is id0: price1 = rYes / rNo, so YES% = rNo/(rYes+rNo) = 1/(1+price1)
 * If NO is id0: price1 = rNo / rYes, so YES% = rNo/(rYes+rNo) = price1/(1+price1)
 */
function priceToYesProbability(price: number, yesIsId0: boolean): number {
  if (price <= 0) return 50;

  if (yesIsId0) {
    // price1 = rYes / rNo
    // YES% = rNo / (rYes + rNo) = 1 / (1 + rYes/rNo) = 1 / (1 + price1)
    return (1 / (1 + price)) * 100;
  } else {
    // price1 = rNo / rYes
    // YES% = rNo / (rYes + rNo) = (rNo/rYes) / (1 + rNo/rYes) = price1 / (1 + price1)
    return (price / (1 + price)) * 100;
  }
}

const PredictionMarketOddsChart = ({
  poolId,
  yesIsId0,
  defaultTimeRange = "1w",
}: PredictionMarketOddsChartProps) => {
  const { t } = useTranslation();
  const [chartError, setChartError] = useState<string | null>(null);

  // Time range state
  const now = Math.floor(Date.now() / 1000);
  const getInitialTimeRange = () => {
    switch (defaultTimeRange) {
      case "1w":
        return { startTs: now - 7 * 24 * 60 * 60, endTs: now, desiredPoints: 168, activeButton: "1w" };
      case "1m":
        return { startTs: now - 30 * 24 * 60 * 60, endTs: now, desiredPoints: 300, activeButton: "1m" };
      case "all":
        return { startTs: undefined, endTs: undefined, desiredPoints: 500, activeButton: "all" };
      case "24h":
      default:
        return { startTs: now - 24 * 60 * 60, endTs: now, desiredPoints: 24, activeButton: "24h" };
    }
  };

  const [timeRange, setTimeRange] = useState<{
    startTs: number | undefined;
    endTs: number | undefined;
    desiredPoints: number;
    activeButton: string;
  }>(getInitialTimeRange());

  const { data, isLoading, error } = useQuery({
    queryKey: ["poolPricePoints", poolId, timeRange.startTs, timeRange.endTs, timeRange.desiredPoints],
    queryFn: () => fetchPoolPricePoints(poolId, timeRange.startTs, timeRange.endTs, timeRange.desiredPoints),
    staleTime: 60000,
    gcTime: 300000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    enabled: !!poolId,
    refetchOnWindowFocus: false,
  });

  const setLast24Hours = () => {
    const now = Math.floor(Date.now() / 1000);
    setTimeRange({ startTs: now - 24 * 60 * 60, endTs: now, desiredPoints: 24, activeButton: "24h" });
  };

  const setLastWeek = () => {
    const now = Math.floor(Date.now() / 1000);
    setTimeRange({ startTs: now - 7 * 24 * 60 * 60, endTs: now, desiredPoints: 168, activeButton: "1w" });
  };

  const setLastMonth = () => {
    const now = Math.floor(Date.now() / 1000);
    setTimeRange({ startTs: now - 30 * 24 * 60 * 60, endTs: now, desiredPoints: 300, activeButton: "1m" });
  };

  const setAllTime = () => {
    setTimeRange({ startTs: undefined, endTs: undefined, desiredPoints: 500, activeButton: "all" });
  };

  useEffect(() => {
    if (error) {
      console.error("Failed to fetch pool price points:", error);
      setChartError("Failed to load odds history. Please try again.");
    } else {
      setChartError(null);
    }
  }, [error]);

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex bg-muted/30 rounded-xl p-1 gap-1">
          <button
            onClick={setLast24Hours}
            className={cn(
              "text-xs px-3 py-1.5 rounded-lg transition-all duration-200",
              timeRange.activeButton === "24h"
                ? "bg-background text-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {t("coin.24h")}
          </button>
          <button
            onClick={setLastWeek}
            className={cn(
              "text-xs px-3 py-1.5 rounded-lg transition-all duration-200",
              timeRange.activeButton === "1w"
                ? "bg-background text-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {t("coin.7d")}
          </button>
          <button
            onClick={setLastMonth}
            className={cn(
              "text-xs px-3 py-1.5 rounded-lg transition-all duration-200",
              timeRange.activeButton === "1m"
                ? "bg-background text-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {t("coin.30d")}
          </button>
          <button
            onClick={setAllTime}
            className={cn(
              "text-xs px-3 py-1.5 rounded-lg transition-all duration-200",
              timeRange.activeButton === "all"
                ? "bg-background text-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {t("coin.all")}
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 ml-auto text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-muted-foreground">YES %</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-muted-foreground/50" style={{ borderTop: '2px dashed' }} />
            <span className="text-muted-foreground">50%</span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="relative h-[400px]">
          <div className="absolute inset-0 p-4">
            <div className="h-full w-full flex flex-col justify-end space-y-1">
              <Skeleton className="h-[60%] w-full opacity-10" />
              <Skeleton className="h-[30%] w-full opacity-10" />
              <Skeleton className="h-[20%] w-full opacity-10" />
            </div>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <LoadingLogo />
            <p className="text-sm text-muted-foreground animate-pulse mt-3">
              Loading odds history...
            </p>
          </div>
        </div>
      ) : chartError ? (
        <div className="flex flex-col items-center justify-center h-[400px] space-y-4">
          <div className="text-center space-y-2">
            <svg className="w-12 h-12 mx-auto text-red-500 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-500 font-medium">Chart data unavailable</p>
            <p className="text-sm text-muted-foreground">{chartError}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setChartError(null);
              setTimeRange((prev) => ({ ...prev, endTs: Math.floor(Date.now() / 1000) }));
            }}
            className="hover:border-primary"
          >
            Retry
          </Button>
        </div>
      ) : data && data.length > 0 ? (
        <MemoizedOddsChart priceData={data} yesIsId0={yesIsId0} />
      ) : (
        <div className="text-center py-20 text-muted-foreground">No odds history available</div>
      )}
    </div>
  );
};

interface OddsChartProps {
  priceData: PricePointData[];
  yesIsId0: boolean;
}

const OddsChart = ({ priceData, yesIsId0 }: OddsChartProps) => {
  const { theme } = useTheme();

  // Process chart data - convert prices to YES probability
  const chartData = useMemo(() => {
    if (!priceData || priceData.length === 0) return [];

    const uniqueData = new Map<string, PricePointData>();
    priceData.forEach((point) => {
      uniqueData.set(point.timestamp, point);
    });

    const sorted = Array.from(uniqueData.values()).sort(
      (a, b) => Number.parseInt(a.timestamp) - Number.parseInt(b.timestamp)
    );

    return sorted
      .map((d) => {
        try {
          const timestamp = Number.parseInt(d.timestamp);
          if (isNaN(timestamp)) return null;

          const price = Number(formatEther(BigInt(d.price1)));
          if (price === 0 || !isFinite(price)) return null;

          const yesPercent = priceToYesProbability(price, yesIsId0);

          return {
            timestamp,
            yesPercent,
            noPercent: 100 - yesPercent,
          };
        } catch (err) {
          console.error("Error processing price point:", err);
          return null;
        }
      })
      .filter((d): d is { timestamp: number; yesPercent: number; noPercent: number } => d !== null);
  }, [priceData, yesIsId0]);

  // Chart colors
  const isDark = theme === "dark";
  const gridColor = isDark ? "hsl(var(--border) / 0.15)" : "hsl(var(--border) / 0.25)";
  const textColor = "hsl(var(--muted-foreground))";

  // Use emerald for YES (positive trend or stable), purple gradient
  const chartColor = "hsl(142, 71%, 45%)"; // emerald-500
  const gradientStartOpacity = isDark ? 0.5 : 0.4;
  const gradientEndOpacity = isDark ? 0.05 : 0.05;

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        No odds history available
      </div>
    );
  }

  return (
    <div className="flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none h-full w-full">
      <ResponsiveContainer width="100%" height={400}>
        <AreaChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="oddsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={chartColor} stopOpacity={gradientStartOpacity} />
              <stop offset="95%" stopColor={chartColor} stopOpacity={gradientEndOpacity} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="14 10" stroke={gridColor} strokeWidth={0.5} vertical={false} />

          <XAxis
            dataKey="timestamp"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(timestamp) => {
              const date = new Date(timestamp * 1000);
              return date.toLocaleDateString([], { month: "short", day: "numeric" });
            }}
            stroke={textColor}
            tickLine={false}
            axisLine={false}
            dy={10}
            style={{ fontSize: "11px" }}
            minTickGap={50}
          />

          <YAxis
            dataKey="yesPercent"
            type="number"
            domain={[0, 100]}
            tickFormatter={(value) => `${value.toFixed(0)}%`}
            stroke={textColor}
            tickLine={false}
            axisLine={false}
            dx={-10}
            style={{ fontSize: "11px" }}
            width={50}
            ticks={[0, 25, 50, 75, 100]}
          />

          {/* 50% reference line */}
          <ReferenceLine
            y={50}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="8 8"
            strokeWidth={2}
            strokeOpacity={0.4}
            label={{
              value: "50%",
              position: "right",
              fill: textColor,
              fontSize: 10,
              offset: 5,
            }}
          />

          <Tooltip content={<OddsTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1, strokeDasharray: "4 4" }} />

          <Area
            type="monotone"
            dataKey="yesPercent"
            stroke={chartColor}
            strokeWidth={2}
            fill="url(#oddsGradient)"
            fillOpacity={1}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: chartColor }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const MemoizedOddsChart = memo(OddsChart);

// Custom tooltip
const OddsTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const date = new Date(data.timestamp * 1000);

    return (
      <div className="bg-background/95 backdrop-blur-sm border border-border/50 rounded-lg px-4 py-3 shadow-lg">
        <p className="text-xs text-muted-foreground mb-2">
          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-sm font-medium">YES</span>
            </div>
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {data.yesPercent.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span className="text-sm font-medium">NO</span>
            </div>
            <span className="text-sm font-bold text-rose-600 dark:text-rose-400 tabular-nums">
              {data.noPercent.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default PredictionMarketOddsChart;
