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
}

const PoolPriceChart: React.FC<PriceChartProps> = ({ poolId, ticker, ethUsdPrice }) => {
  const { t } = useTranslation();
  const [showUsd, setShowUsd] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

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
              setTimeRange(prev => ({ ...prev, endTs: Math.floor(Date.now() / 1000) }));
            }}
          >
            {t("common.retry")}
          </Button>
        </div>
      ) : data && data.length > 0 ? (
        <MemoizedTVPriceChart priceData={data} ticker={ticker} showUsd={showUsd} ethUsdPrice={ethUsdPrice} />
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
}> = ({ priceData, ticker, showUsd = false, ethUsdPrice }) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart>>();
  const priceSeriesRef = useRef<ISeriesApi<"Line">>();
  const chartTheme = useChartTheme();
  const [isChartReady, setIsChartReady] = useState(false);
  const lastValidDataRef = useRef<Array<{ time: UTCTimestamp; value: number }>>();

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    try {
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

      setIsChartReady(true);

      return () => {
        setIsChartReady(false);
        chart.remove();
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

  useEffect(() => {
    if (!priceSeriesRef.current || !isChartReady) return;
    
    // If no data, show last valid data if available
    if (priceData.length === 0) {
      if (lastValidDataRef.current && lastValidDataRef.current.length > 0) {
        priceSeriesRef.current.setData(lastValidDataRef.current);
      }
      return;
    }

    try {
      // Sort ascending by timestamp
      // Create a map to ensure uniqueness by timestamp
      const uniqueData = new Map<string, PricePointData>();
      priceData.forEach((point) => {
        uniqueData.set(point.timestamp, point);
      });

      // Convert back to array and sort
      const sorted = Array.from(uniqueData.values()).sort(
        (a, b) => Number.parseInt(a.timestamp) - Number.parseInt(b.timestamp),
      );

      // Map to chart-compatible format and ensure uniqueness of timestamps
      const timestampMap = new Map<number, number>(); // Map to store unique timestamps with their values

      sorted.forEach((d) => {
        try {
          // Parse timestamp as Unix timestamp (seconds since epoch)
          const timestamp = Number.parseInt(d.timestamp);

          // Check if timestamp is valid
          if (isNaN(timestamp)) {
            console.warn("Invalid timestamp:", d.timestamp);
            return;
          }

          // price1 is a string representing the price in wei format (18 decimals)
          // Convert it to a number properly
          let value: number;
          try {
            value = Number(formatEther(BigInt(d.price1)));
          } catch (e) {
            console.warn("Invalid price format:", d.price1, e);
            return;
          }
          
          // Validate value
          if (value === 0 || !isFinite(value)) {
            console.warn("Invalid calculated value:", value);
            return;
          }
          
          // Convert to USD if needed
          if (showUsd && ethUsdPrice && ethUsdPrice > 0) {
            // value is ETH/TOKEN ratio (how many TOKEN per 1 ETH)
            // To get TOKEN/USD: ETH/USD / (ETH/TOKEN)
            value = ethUsdPrice / value;
          }

          // If we already have a value for this timestamp, we'll use the more recent data point
          // (which is the current one since we're iterating through sorted data)
          timestampMap.set(timestamp, value);
        } catch (err) {
          console.error("Error processing price point:", err, d);
        }
      });

      // Convert the map to an array of points
      const points = Array.from(timestampMap.entries())
        .map(([time, value]) => ({
          time: time as UTCTimestamp,
          value,
        }))
        .sort((a, b) => a.time - b.time); // Ensure they're sorted by time

      // Push data
      if (points.length > 0) {
        priceSeriesRef.current.setData(points);
        // Store last valid data
        lastValidDataRef.current = points;
        // Fit content to series
        chartRef.current?.timeScale().fitContent();
      } else if (lastValidDataRef.current && lastValidDataRef.current.length > 0) {
        // Use last valid data if current data is empty
        console.warn("No valid points in current data, using last valid data");
        priceSeriesRef.current.setData(lastValidDataRef.current);
      } else {
        console.warn(t("chart.no_data"));
      }
    } catch (error) {
      console.error("Error updating price chart:", error);
      // Try to use last valid data on error
      if (lastValidDataRef.current && lastValidDataRef.current.length > 0) {
        try {
          priceSeriesRef.current.setData(lastValidDataRef.current);
        } catch (e) {
          console.error("Failed to restore last valid data:", e);
        }
      }
    }
  }, [priceData, showUsd, ethUsdPrice, t, isChartReady]);

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
