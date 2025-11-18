import { Button } from "@/components/ui/button";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { useChartTheme } from "@/hooks/use-chart-theme";
import { formatWithSubscriptZeros } from "@/lib/chart";
import { type PricePointData, fetchPoolPricePoints } from "@/lib/indexer";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  ColorType,
  type ISeriesApi,
  LineSeries,
  type LineSeriesOptions,
  PriceScaleMode,
  type UTCTimestamp,
  createChart,
} from "lightweight-charts";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEther } from "viem";

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
}> = ({ priceData, ticker, showUsd = false, ethUsdPrice, priceImpact }) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart>>();
  const priceSeriesRef = useRef<ISeriesApi<"Line">>();
  const impactSeriesRef = useRef<ISeriesApi<"Line">>();
  const chartTheme = useChartTheme();
  const [isChartReady, setIsChartReady] = useState(false);
  const lastValidDataRef = useRef<Array<{ time: UTCTimestamp; value: number }>>();

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    try {
      // Clean up any existing chart first
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch (e: any) {
          // Chart was already disposed, which is fine
          if (!e?.message?.includes("disposed")) {
            console.error("Error removing existing chart:", e);
          }
        }
        chartRef.current = undefined;
        priceSeriesRef.current = undefined;
        impactSeriesRef.current = undefined;
      }

      // Create chart
      const chart = createChart(container, {
        layout: {
          background: { type: ColorType.Solid, color: chartTheme.background },
          textColor: chartTheme.textColor,
          attributionLogo: false,
        },
        autoSize: true,
        height: 300,
        crosshair: {
          horzLine: {
            visible: false,
          },
          vertLine: {
            visible: false,
          },
        },
        rightPriceScale: {
          autoScale: true,
          mode: PriceScaleMode.Logarithmic,
          scaleMargins: { top: 0.1, bottom: 0.2 },
          borderVisible: false,
        },
        timeScale: {
          timeVisible: true,
          borderVisible: false,
          rightOffset: 5,
          barSpacing: 6,
        },
        grid: {
          vertLines: {
            color: chartTheme.gridColor,
            style: 1,
          },
          horzLines: {
            color: chartTheme.gridColor,
            style: 1,
          },
        },
        handleScroll: {
          vertTouchDrag: false,
          horzTouchDrag: true,
          mouseWheel: true,
          pressedMouseMove: true,
        },
        handleScale: {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true,
        },
      });
      chartRef.current = chart;

      priceSeriesRef.current = chart.addSeries(LineSeries, {
        color: chartTheme.lineColor || "#10b981",
        lineWidth: 2,
        lineStyle: 0, // Solid line
        title: `ETH / ${ticker}`, // Default title, will be updated dynamically
        priceFormat: {
          type: "custom",
          formatter: formatWithSubscriptZeros, // Use custom formatter
          minMove: 0.000000001,
        },
        crosshairMarkerVisible: false,
        crosshairMarkerRadius: 5,
        lastValueVisible: true,
        priceLineVisible: true,
        priceLineWidth: 1,
        priceLineColor: chartTheme.lineColor || "#10b981",
        priceLineStyle: 2, // Dashed
      });

      // Add impact series for projected price (dotted line)
      impactSeriesRef.current = chart.addSeries(LineSeries, {
        color: chartTheme.lineColor, // Will be updated based on buy/sell
        lineWidth: 3, // Make it slightly thicker for visibility
        lineStyle: 2, // Dotted line
        priceLineVisible: false,
        lastValueVisible: true, // Show the last value
        priceFormat: {
          type: "custom",
          formatter: formatWithSubscriptZeros, // Use custom formatter
          minMove: 0.000000001,
        },
        crosshairMarkerVisible: false,
        crosshairMarkerRadius: 4,
      } as LineSeriesOptions);

      setIsChartReady(true);

      // Handle window resize
      const handleResize = () => {
        if (chartRef.current && container) {
          try {
            chartRef.current.applyOptions({
              width: container.clientWidth,
            });
          } catch (e) {
            console.error("Error resizing chart:", e);
          }
        }
      };

      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        setIsChartReady(false);
        try {
          if (chartRef.current) {
            chartRef.current.remove();
            chartRef.current = undefined;
            priceSeriesRef.current = undefined;
            impactSeriesRef.current = undefined;
          }
        } catch (e: any) {
          // Chart was already disposed, which is fine
          if (!e?.message?.includes("disposed")) {
            console.error("Error cleaning up chart:", e);
          }
        }
      };
    } catch (error) {
      console.error("Failed to create chart:", error);
      setIsChartReady(false);
    }
  }, [ticker, chartTheme]); // Remove showUsd and ethUsdPrice to prevent chart recreation

  // Update chart options when showUsd or ethUsdPrice changes
  useEffect(() => {
    if (!priceSeriesRef.current) return;

    // Update series options based on USD mode
    priceSeriesRef.current.applyOptions({
      title: showUsd && ethUsdPrice ? `${ticker} / USD` : `ETH / ${ticker}`,
      priceFormat: {
        type: "custom",
        formatter: formatWithSubscriptZeros, // Maintain custom formatter
        minMove: 0.000000001,
      },
    } as LineSeriesOptions);
  }, [showUsd, ethUsdPrice, ticker]);

  // Simple effect to process and display data with price impact
  useEffect(() => {
    if (!priceSeriesRef.current || !impactSeriesRef.current || !isChartReady) return;

    if (!priceData || priceData.length === 0) {
      if (lastValidDataRef.current && lastValidDataRef.current.length > 0) {
        priceSeriesRef.current.setData(lastValidDataRef.current);
      }
      return;
    }

    try {
      // Process the raw data
      const uniqueData = new Map<string, PricePointData>();
      priceData.forEach((point) => {
        uniqueData.set(point.timestamp, point);
      });

      const sorted = Array.from(uniqueData.values()).sort(
        (a, b) => Number.parseInt(a.timestamp) - Number.parseInt(b.timestamp),
      );

      const timestampMap = new Map<number, number>();

      sorted.forEach((d) => {
        try {
          const timestamp = Number.parseInt(d.timestamp);
          if (isNaN(timestamp)) return;

          let value: number;
          try {
            value = Number(formatEther(BigInt(d.price1)));
          } catch (e) {
            return;
          }

          if (value === 0 || !isFinite(value)) return;

          if (showUsd && ethUsdPrice && ethUsdPrice > 0) {
            value = value * ethUsdPrice;
          }

          timestampMap.set(timestamp, value);
        } catch (err) {
          console.error("Error processing price point:", err);
        }
      });

      const points = Array.from(timestampMap.entries())
        .map(([time, value]) => ({
          time: time as UTCTimestamp,
          value,
        }))
        .sort((a, b) => a.time - b.time);

      if (points.length > 0) {
        // Store the base data
        lastValidDataRef.current = points;

        // Build the data to display
        let displayData = [...points];

        // Add price impact point if available
        if (priceImpact && priceImpact.projectedPrice > 0) {
          const lastPoint = points[points.length - 1];
          if (lastPoint) {
            let projectedValue: number;

            if (showUsd && ethUsdPrice && ethUsdPrice > 0) {
              // Convert ETH price to USD
              projectedValue = priceImpact.projectedPrice * ethUsdPrice;
            } else {
              // Use ETH price directly
              projectedValue = priceImpact.projectedPrice;
            }

            if (isFinite(projectedValue) && projectedValue > 0) {
              // Create impact line data: from last point to projected point
              const projectedTime = lastPoint.time + 1; // Just 1 second after
              const impactData = [
                { time: lastPoint.time, value: lastPoint.value },
                { time: projectedTime as UTCTimestamp, value: projectedValue },
              ];

              // Update impact series color based on buy/sell action
              const impactColor = priceImpact.action === "buy" ? "#10b981" : "#ef4444"; // green for buy, red for sell
              impactSeriesRef.current.applyOptions({
                color: impactColor,
              });

              // Set the impact line data
              impactSeriesRef.current.setData(impactData);
            } else {
              // Clear impact series if invalid
              impactSeriesRef.current.setData([]);
            }
          } else {
            // Clear impact series when no price impact
            impactSeriesRef.current.setData([]);
          }
        } else {
          // Clear impact series when no price impact
          impactSeriesRef.current.setData([]);
        }

        // Update the main chart with historical data only
        priceSeriesRef.current.setData(displayData);

        // Make sure we see all the data
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
      }
    } catch (error) {
      console.error("Error updating chart:", error);
      // Fallback to last valid data
      if (lastValidDataRef.current && lastValidDataRef.current.length > 0) {
        priceSeriesRef.current.setData(lastValidDataRef.current);
      }
    }
  }, [priceData, showUsd, ethUsdPrice, priceImpact, isChartReady, t]);

  return (
    <div className="relative transition-opacity duration-300">
      <div
        ref={containerRef}
        className={cn("w-full transition-opacity duration-500", isChartReady ? "opacity-100" : "opacity-0")}
        style={{ height: "300px", position: "relative", zIndex: 1 }}
      />
      {!isChartReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm transition-opacity duration-300">
          <LoadingLogo size="sm" />
          <p className="text-xs text-muted-foreground mt-2">{t("chart.rendering", "Rendering chart...")}</p>
        </div>
      )}
    </div>
  );
};

// Memoize the chart component to prevent unnecessary re-renders
const MemoizedTVPriceChart = React.memo(TVPriceChart);

export default PoolPriceChart;
