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
import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEther } from "viem";

interface PriceChartProps {
  poolId: string;
  ticker: string;
}

const PoolPriceChart: React.FC<PriceChartProps> = ({ poolId, ticker }) => {
  const { t } = useTranslation();

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

  if (error) {
    throw new Error("Failed to fetch pool price points - " + (error as Error).message);
  }

  return (
    <div className="w-full">
      <div className="mb-4 flex space-x-2">
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

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <LoadingLogo />
        </div>
      ) : data && data.length > 0 ? (
        <TVPriceChart priceData={data} ticker={ticker} />
      ) : (
        <div className="text-center py-20 text-muted-foreground">{t("chart.no_data")}</div>
      )}
    </div>
  );
};

const TVPriceChart: React.FC<{
  priceData: PricePointData[];
  ticker: string;
}> = ({ priceData, ticker }) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart>>();
  const priceSeriesRef = useRef<ISeriesApi<"Line">>();
  const chartTheme = useChartTheme();

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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
    });
    chartRef.current = chart;

    priceSeriesRef.current = chart.addSeries(LineSeries, {
      color: chartTheme.lineColor,
      lineWidth: 2,
      title: `ETH / ${ticker}`,
      priceFormat: {
        type: "price",
        precision: 10,
        minMove: 0.000000001,
      } as PriceFormatBuiltIn,
    } as LineSeriesOptions);

    return () => {
      chart.remove();
    };
  }, [ticker]);

  useEffect(() => {
    if (!priceSeriesRef.current || priceData.length === 0) return;

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

          const price = Number.parseFloat(d.price1);
          // Check if price is valid
          if (isNaN(price)) {
            console.warn("Invalid price:", d.price1);
            return;
          }

          const value = Number(formatEther(BigInt(price)));

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
        // Fit content to series
        chartRef.current?.timeScale().fitContent();
      } else {
        console.warn(t("chart.no_data"));
      }
    } catch (error) {
      console.error("Error updating price chart:", error);
    }
  }, [priceData]);

  return <div ref={containerRef} className="w-full" style={{ height: "400px", position: "relative", zIndex: 1 }} />;
};

export default PoolPriceChart;
