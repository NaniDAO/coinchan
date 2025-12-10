import { Button } from "@/components/ui/button";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { type PricePointData, fetchPoolPricePoints } from "@/lib/indexer";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
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

interface PriceChartProps {
  poolId: string;
  ticker?: string;
  ethUsdPrice?: number;
  priceImpact?: {
    currentPrice: number;
    projectedPrice: number; // CULT price in ETH after the trade
    impactPercent: number;
    action: "buy" | "sell";
  } | null;
  defaultTimeRange?: "24h" | "1w" | "1m" | "all";
}

const PoolPriceChart: React.FC<PriceChartProps> = ({
  poolId,
  ticker,
  ethUsdPrice,
  priceImpact,
  defaultTimeRange = "24h",
}) => {
  const { t } = useTranslation();
  const [showUsd, setShowUsd] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  // Internal state for time controls
  // Initialize based on defaultTimeRange prop
  const now = Math.floor(Date.now() / 1000);
  const getInitialTimeRange = () => {
    switch (defaultTimeRange) {
      case "1w":
        return {
          startTs: now - 7 * 24 * 60 * 60,
          endTs: now,
          desiredPoints: 168,
          activeButton: "1w",
        };
      case "1m":
        return {
          startTs: now - 30 * 24 * 60 * 60,
          endTs: now,
          desiredPoints: 300,
          activeButton: "1m",
        };
      case "all":
        return {
          startTs: undefined,
          endTs: undefined,
          desiredPoints: 500,
          activeButton: "all",
        };
      case "24h":
      default:
        return {
          startTs: now - 24 * 60 * 60,
          endTs: now,
          desiredPoints: 24,
          activeButton: "24h",
        };
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
    staleTime: 60000, // Consider data fresh for 1 minute
    gcTime: 300000, // Keep in cache for 5 minutes (formerly cacheTime)
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    enabled: !!poolId, // Only fetch when poolId is available
    refetchOnWindowFocus: false, // Prevent unnecessary refetches
  });

  // Time range presets
  const setLast24Hours = () => {
    const now = Math.floor(Date.now() / 1000);
    setTimeRange({
      startTs: now - 24 * 60 * 60,
      endTs: now,
      desiredPoints: 24,
      activeButton: "24h",
    });
  };

  const setLastWeek = () => {
    const now = Math.floor(Date.now() / 1000);
    setTimeRange({
      startTs: now - 7 * 24 * 60 * 60,
      endTs: now,
      desiredPoints: 168,
      activeButton: "1w",
    });
  };

  const setLastMonth = () => {
    const now = Math.floor(Date.now() / 1000);
    setTimeRange({
      startTs: now - 30 * 24 * 60 * 60,
      endTs: now,
      desiredPoints: 300,
      activeButton: "1m",
    });
  };

  const setAllTime = () => {
    setTimeRange({
      startTs: undefined,
      endTs: undefined,
      desiredPoints: 500,
      activeButton: "all",
    });
  };

  // Handle errors gracefully instead of throwing
  useEffect(() => {
    if (error) {
      console.error("Failed to fetch pool price points:", error);
      setChartError("Failed to load price data. Please try again.");
    } else {
      setChartError(null);
    }
  }, [error]);

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex border border-border">
          <button
            onClick={setLast24Hours}
            className={cn(
              "text-xs w-full p-1 hover:bg-muted hover:text-muted-foreground",
              timeRange.activeButton === "24h" && "bg-accent text-accent-foreground",
            )}
          >
            {t("coin.24h")}
          </button>
          <button
            onClick={setLastWeek}
            className={cn(
              "text-xs w-full p-1 hover:bg-muted hover:text-muted-foreground",
              timeRange.activeButton === "1w" && "bg-accent text-accent-foreground",
            )}
          >
            {t("coin.7d")}
          </button>
          <button
            onClick={setLastMonth}
            className={cn(
              "text-xs w-full p-1 hover:bg-muted hover:text-muted-foreground",
              timeRange.activeButton === "1m" && "bg-accent text-accent-foreground",
            )}
          >
            {t("coin.30d")}
          </button>
          <button
            onClick={setAllTime}
            className={cn(
              "text-xs w-full p-1 hover:bg-muted hover:text-muted-foreground",
              timeRange.activeButton === "all" && "bg-accent text-accent-foreground",
            )}
          >
            {t("coin.all")}
          </button>
        </div>
        {ethUsdPrice && (
          <div className="flex flex-row ml-auto">
            <button
              onClick={() => setShowUsd(false)}
              className={cn(
                "text-xs w-full p-1 hover:bg-muted hover:text-muted-foreground",
                !showUsd && "bg-accent text-accent-foreground",
              )}
            >
              ETH
            </button>
            <button
              onClick={() => setShowUsd(true)}
              className={cn(
                "text-xs w-full p-1 hover:bg-muted hover:text-muted-foreground",
                showUsd && "bg-accent text-accent-foreground",
              )}
            >
              USD
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="relative h-[300px]">
          {/* Skeleton chart lines */}
          <div className="absolute inset-0 p-4">
            <div className="h-full w-full flex flex-col justify-end space-y-1">
              <Skeleton className="h-[60%] w-full opacity-10" />
              <Skeleton className="h-[30%] w-full opacity-10" />
              <Skeleton className="h-[20%] w-full opacity-10" />
            </div>
          </div>
          {/* Loading indicator overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <LoadingLogo />
            <p className="text-sm text-muted-foreground animate-pulse mt-3">
              {t("chart.loading_price_data", "Loading price data...")}
            </p>
          </div>
        </div>
      ) : chartError ? (
        <div className="flex flex-col items-center justify-center h-[300px] space-y-4">
          <div className="text-center space-y-2">
            <svg
              className="w-12 h-12 mx-auto text-red-500 opacity-50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-red-500 font-medium">{t("chart.error_title", "Chart data unavailable")}</p>
            <p className="text-sm text-muted-foreground">{chartError}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setChartError(null);
              // Trigger refetch by changing time range slightly
              setTimeRange((prev) => ({
                ...prev,
                endTs: Math.floor(Date.now() / 1000),
              }));
            }}
            className="hover:border-primary"
          >
            {t("common.retry", "Retry")}
          </Button>
        </div>
      ) : data && data.length > 0 ? (
        <MemoizedTVPriceChart
          priceData={data}
          ticker={ticker}
          showUsd={showUsd}
          ethUsdPrice={ethUsdPrice}
          priceImpact={priceImpact}
        />
      ) : (
        <div className="text-center py-20 text-muted-foreground">{t("chart.no_data")}</div>
      )}
    </div>
  );
};

// Custom tooltip component with Apple-style design
const CustomTooltip = ({ active, payload, showUsd }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const date = new Date(data.timestamp * 1000);

    return (
      <div className="bg-background/95 backdrop-blur-sm border border-border/50 rounded-lg px-3 py-2 shadow-lg">
        <p className="text-xs text-muted-foreground mb-1">
          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
        <p className="text-sm font-semibold">
          {formatPriceValue(data.price)} {showUsd ? 'USD' : 'ETH'}
        </p>
      </div>
    );
  }
  return null;
};

// Format price with proper decimal handling
const formatPriceValue = (value: number): string => {
  if (value === 0) return '0';

  // For very small numbers, use scientific notation
  if (value < 0.000001) {
    return value.toExponential(2);
  }

  // For small numbers, show more decimals
  if (value < 0.01) {
    return value.toFixed(8);
  }

  // For regular numbers
  if (value < 1) {
    return value.toFixed(6);
  }

  return value.toFixed(4);
};

const TVPriceChart: React.FC<{
  priceData: PricePointData[];
  ticker?: string;
  showUsd?: boolean;
  ethUsdPrice?: number;
  priceImpact?: {
    currentPrice: number;
    projectedPrice: number;
    impactPercent: number;
    action: "buy" | "sell";
  } | null;
}> = ({ priceData, showUsd = false, ethUsdPrice, priceImpact }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  // Process chart data
  const chartData = useMemo(() => {
    if (!priceData || priceData.length === 0) return [];

    // Deduplicate and sort data
    const uniqueData = new Map<string, PricePointData>();
    priceData.forEach((point) => {
      uniqueData.set(point.timestamp, point);
    });

    const sorted = Array.from(uniqueData.values()).sort(
      (a, b) => Number.parseInt(a.timestamp) - Number.parseInt(b.timestamp)
    );

    // Convert to chart format
    const processed = sorted
      .map((d) => {
        try {
          const timestamp = Number.parseInt(d.timestamp);
          if (isNaN(timestamp)) return null;

          let value = Number(formatEther(BigInt(d.price1)));
          if (value === 0 || !isFinite(value)) return null;

          if (showUsd && ethUsdPrice && ethUsdPrice > 0) {
            value = value * ethUsdPrice;
          }

          return {
            timestamp,
            price: value,
          };
        } catch (err) {
          console.error("Error processing price point:", err);
          return null;
        }
      })
      .filter((d): d is { timestamp: number; price: number } => d !== null);

    // Add projected price impact point if available
    if (priceImpact && priceImpact.projectedPrice > 0 && processed.length > 0) {
      const lastPoint = processed[processed.length - 1];
      let projectedValue = priceImpact.projectedPrice;

      if (showUsd && ethUsdPrice && ethUsdPrice > 0) {
        projectedValue = projectedValue * ethUsdPrice;
      }

      if (isFinite(projectedValue) && projectedValue > 0) {
        processed.push({
          timestamp: lastPoint.timestamp + 60,
          price: projectedValue,
        });
      }
    }

    return processed;
  }, [priceData, showUsd, ethUsdPrice, priceImpact]);

  // Calculate average price for reference line
  const averagePrice = useMemo(() => {
    if (chartData.length === 0) return 0;
    const sum = chartData.reduce((acc, d) => acc + d.price, 0);
    return sum / chartData.length;
  }, [chartData]);

  // Determine if price is going up or down
  const priceChange = useMemo(() => {
    if (chartData.length < 2) return 0;
    const first = chartData[0].price;
    const last = chartData[chartData.length - 1].price;
    return ((last - first) / first) * 100;
  }, [chartData]);

  const isPositive = priceChange >= 0;
  const chartColor = isPositive ? "hsl(var(--chart-1))" : "hsl(var(--chart-2))";

  // Chart theme colors
  const isDark = theme === "dark";
  const gridColor = isDark ? "hsl(var(--border) / 0.15)" : "hsl(var(--border) / 0.25)";
  const textColor = "hsl(var(--muted-foreground))";

  // Theme-specific gradient settings
  const gradientStartOpacity = isDark ? 0.5 : 0.4;
  const gradientEndOpacity = isDark ? 0.05 : 0.05;
  const strokeWidth = isDark ? 2 : 2;

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[320px] text-muted-foreground">
        {t("chart.no_data")}
      </div>
    );
  }

  return (
    <div
      className="flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none h-full w-full"
    >
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart
          data={chartData}
          margin={{ top: 12, right: 12, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={chartColor} stopOpacity={gradientStartOpacity} />
              <stop offset="95%" stopColor={chartColor} stopOpacity={gradientEndOpacity} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="14 10"
            stroke={gridColor}
            strokeWidth={0.5}
            vertical={false}
          />

          <XAxis
            dataKey="timestamp"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(timestamp) => {
              const date = new Date(timestamp * 1000);
              return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
            }}
            stroke={textColor}
            tickLine={false}
            axisLine={false}
            dy={10}
            style={{ fontSize: '11px' }}
            minTickGap={50}
          />

          <YAxis
            dataKey="price"
            type="number"
            domain={['auto', 'auto']}
            tickFormatter={formatPriceValue}
            stroke={textColor}
            tickLine={false}
            axisLine={false}
            dx={-10}
            style={{ fontSize: '11px' }}
            width={80}
          />

          <ReferenceLine
            y={averagePrice}
            stroke={gridColor}
            strokeDasharray="14 10"
            strokeWidth={3}
            strokeOpacity={0.5}
          />

          <Tooltip
            content={<CustomTooltip showUsd={showUsd} />}
            cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1, strokeDasharray: '4 4' }}
          />

          <Area
            type="monotone"
            dataKey="price"
            stroke={chartColor}
            strokeWidth={strokeWidth}
            fill="url(#priceGradient)"
            fillOpacity={1}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

// Memoize the chart component to prevent unnecessary re-renders
const MemoizedTVPriceChart = React.memo(TVPriceChart);

export default PoolPriceChart;
