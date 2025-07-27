import { Button } from "@/components/ui/button";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { useChartTheme } from "@/hooks/use-chart-theme";
import { type PricePointData, fetchPoolPricePoints } from "@/lib/indexer";
import { useQuery } from "@tanstack/react-query";
import {
  ColorType,
  type ISeriesApi,
  LineSeries,
  type LineSeriesOptions,
  type PriceFormatBuiltIn,
  PriceScaleMode,
  type UTCTimestamp,
  createChart,
} from "lightweight-charts";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEther } from "viem";

interface PriceChartProps {
  poolId: string;
  ticker: string;
  ethUsdPrice?: number;
  priceImpact?: {
    currentPrice: number;
    projectedPrice: number; // CULT price in ETH after the trade
    impactPercent: number;
    action: "buy" | "sell";
  } | null;
}

const PoolPriceChart: React.FC<PriceChartProps> = ({ poolId, ticker, ethUsdPrice, priceImpact }) => {
  const { t } = useTranslation();
  const [showUsd, setShowUsd] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  
  console.log("PoolPriceChart - poolId:", poolId, "ticker:", ticker);

  // Internal state for time controls
  const [timeRange, setTimeRange] = useState<{
    startTs: number | undefined;
    endTs: number | undefined;
    desiredPoints: number;
    activeButton: string;
  }>({
    startTs: undefined,
    endTs: undefined,
    desiredPoints: 100, // Default value
    activeButton: "1w", // Default active button
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["poolPricePoints", poolId, timeRange.startTs, timeRange.endTs, timeRange.desiredPoints],
    queryFn: () => fetchPoolPricePoints(poolId, timeRange.startTs, timeRange.endTs, timeRange.desiredPoints),
    staleTime: 60000, // Consider data fresh for 1 minute
    gcTime: 300000, // Keep in cache for 5 minutes (formerly cacheTime)
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
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
        <div className="flex space-x-2">
          <Button
            variant={timeRange.activeButton === "24h" ? "default" : "outline"}
            size="sm"
            onClick={setLast24Hours}
            className="text-xs"
          >
            {t("coin.24h")}
          </Button>
          <Button
            variant={timeRange.activeButton === "1w" ? "default" : "outline"}
            size="sm"
            onClick={setLastWeek}
            className="text-xs"
          >
            {t("coin.7d")}
          </Button>
          <Button
            variant={timeRange.activeButton === "1m" ? "default" : "outline"}
            size="sm"
            onClick={setLastMonth}
            className="text-xs"
          >
            {t("coin.30d")}
          </Button>
          <Button
            variant={timeRange.activeButton === "all" ? "default" : "outline"}
            size="sm"
            onClick={setAllTime}
            className="text-xs"
          >
            {t("coin.all")}
          </Button>
        </div>
        {ethUsdPrice && (
          <div className="ml-auto">
            <Button
              variant={showUsd ? "default" : "outline"}
              size="sm"
              onClick={() => setShowUsd(!showUsd)}
              className="text-xs"
            >
              {showUsd ? "USD" : "ETH"}
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <LoadingLogo />
        </div>
      ) : chartError ? (
        <div className="text-center py-20">
          <p className="text-red-400 mb-4">{chartError}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setChartError(null);
              // Trigger refetch by changing time range slightly
              setTimeRange((prev) => ({ ...prev, endTs: Math.floor(Date.now() / 1000) }));
            }}
          >
            {t("common.retry")}
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
  ticker: string;
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
        } catch (e) {
          console.error("Error removing existing chart:", e);
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
        height: 400,
        rightPriceScale: {
          autoScale: true,
          mode: PriceScaleMode.Logarithmic,
          scaleMargins: { top: 0.1, bottom: 0.2 },
        },
        timeScale: { timeVisible: true },
        handleScroll: {
          vertTouchDrag: false,
        },
      });
      chartRef.current = chart;

      priceSeriesRef.current = chart.addSeries(LineSeries, {
        color: chartTheme.lineColor,
        lineWidth: 2,
        title: `ETH / ${ticker}`, // Default title, will be updated dynamically
        priceFormat: {
          type: "price",
          precision: 10, // Default precision, will be updated dynamically
          minMove: 0.000000001,
        } as PriceFormatBuiltIn,
      } as LineSeriesOptions);

      // Add impact series for projected price (dotted line)
      impactSeriesRef.current = chart.addSeries(LineSeries, {
        color: chartTheme.lineColor, // Will be updated based on buy/sell
        lineWidth: 3, // Make it slightly thicker for visibility
        lineStyle: 2, // Dotted line
        priceLineVisible: false,
        lastValueVisible: true, // Show the last value
        priceFormat: {
          type: "price",
          precision: 10,
          minMove: 0.000000001,
        } as PriceFormatBuiltIn,
        crosshairMarkerVisible: true,
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
          chart.remove();
        } catch (e) {
          console.error("Error cleaning up chart:", e);
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
        type: "price",
        precision: showUsd ? 8 : 10,
        minMove: showUsd ? 0.00000001 : 0.000000001,
      } as PriceFormatBuiltIn,
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
    <div className="relative">
      <div ref={containerRef} className="w-full" style={{ height: "400px", position: "relative", zIndex: 1 }} />
      {!isChartReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
          <LoadingLogo size="sm" />
        </div>
      )}
    </div>
  );
};

// Memoize the chart component to prevent unnecessary re-renders
const MemoizedTVPriceChart = React.memo(TVPriceChart);

export default PoolPriceChart;
