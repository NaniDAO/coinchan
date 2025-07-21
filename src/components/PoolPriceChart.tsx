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
    projectedPrice: number;
    impactPercent: number;
    action: "buy" | "sell";
  } | null;
}

const PoolPriceChart: React.FC<PriceChartProps> = ({ poolId, ticker, ethUsdPrice, priceImpact }) => {
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
            // value = token price in ETH (from pool)
            // ethUsdPrice = ETH price in USD
            // token price in USD = token price in ETH * ETH price in USD
            value = value * ethUsdPrice;
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

  // Update price impact visualization
  useEffect(() => {
    if (!chartRef.current || !priceSeriesRef.current || !isChartReady) {
      // Remove impact series if chart not ready
      if (impactSeriesRef.current && chartRef.current) {
        try {
          chartRef.current.removeSeries(impactSeriesRef.current);
          impactSeriesRef.current = undefined;
        } catch (e) {
          console.error("Failed to remove impact series:", e);
        }
      }
      return;
    }

    // Remove impact series if no price impact data
    if (!priceImpact) {
      if (impactSeriesRef.current) {
        try {
          // Remove price line if it exists
          if ((impactSeriesRef.current as any)._priceLine) {
            impactSeriesRef.current.removePriceLine((impactSeriesRef.current as any)._priceLine);
          }
          chartRef.current.removeSeries(impactSeriesRef.current);
          impactSeriesRef.current = undefined;
        } catch (e) {
          console.error("Failed to remove impact series:", e);
        }
      }
      return;
    }

    try {
      // Get the last data point from the current series
      const lastDataPoint = lastValidDataRef.current?.[lastValidDataRef.current.length - 1];
      if (!lastDataPoint) {
        console.warn("No last data point available for price impact visualization");
        return;
      }

      // Calculate projected value based on display mode
      let projectedValue: number;
      if (showUsd && ethUsdPrice && ethUsdPrice > 0) {
        // Already in USD
        projectedValue = priceImpact.projectedPrice;
      } else {
        // Convert from USD to ETH price
        projectedValue = priceImpact.projectedPrice / (ethUsdPrice || 1);
      }

      // Validate projected value
      if (!isFinite(projectedValue) || projectedValue <= 0) {
        console.error("Invalid projected value:", projectedValue);
        return;
      }

      // Remove existing impact series if it exists
      if (impactSeriesRef.current) {
        try {
          // Remove price line if it exists
          if ((impactSeriesRef.current as any)._priceLine) {
            impactSeriesRef.current.removePriceLine((impactSeriesRef.current as any)._priceLine);
          }
          chartRef.current.removeSeries(impactSeriesRef.current);
        } catch (e) {
          // Series might already be removed
        }
      }

      // Create new impact series with subtle dashed line
      impactSeriesRef.current = chartRef.current.addSeries(LineSeries, {
        color: priceImpact.impactPercent > 0 ? "#4ade80" : "#f87171", // green or red
        lineWidth: 1,
        lineStyle: 2, // Dashed line
        priceLineVisible: true,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        title: "",
        priceFormat: {
          type: "price",
          precision: showUsd ? 8 : 10,
          minMove: showUsd ? 0.00000001 : 0.000000001,
        } as PriceFormatBuiltIn,
      } as LineSeriesOptions);

      // Create impact visualization with a subtle line from current to projected price
      const projectedTime = (lastDataPoint.time + 60) as UTCTimestamp; // 1 minute into the future
      
      // Create a short line from current price to projected price
      const impactData = [
        { 
          time: lastDataPoint.time, 
          value: lastDataPoint.value 
        },
        {
          time: projectedTime,
          value: projectedValue,
        },
      ];
      
      impactSeriesRef.current.setData(impactData);
      
      // Add a price line at the projected value
      const priceLine = impactSeriesRef.current.createPriceLine({
        price: projectedValue,
        color: priceImpact.impactPercent > 0 ? '#4ade80' : '#f87171',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: `${priceImpact.impactPercent > 0 ? '+' : ''}${priceImpact.impactPercent.toFixed(2)}%`,
      });
      
      // Store price line reference for cleanup
      (impactSeriesRef.current as any)._priceLine = priceLine;
      
      // Ensure the chart shows both current and projected points
      chartRef.current.timeScale().fitContent();
    } catch (error) {
      console.error("Error adding price impact visualization:", error);
      // Clean up on error
      if (impactSeriesRef.current && chartRef.current) {
        try {
          // Remove price line if it exists
          if ((impactSeriesRef.current as any)._priceLine) {
            impactSeriesRef.current.removePriceLine((impactSeriesRef.current as any)._priceLine);
          }
          chartRef.current.removeSeries(impactSeriesRef.current);
          impactSeriesRef.current = undefined;
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  }, [priceImpact, showUsd, ethUsdPrice, isChartReady]);

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
