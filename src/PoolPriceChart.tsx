import React, { useRef, useLayoutEffect, useEffect } from "react";
import {
  createChart,
  LineSeries,
  LineSeriesOptions,
  UTCTimestamp,
  ColorType,
  PriceFormatBuiltIn,
  ISeriesApi,
} from "lightweight-charts";
import { Spinner } from "@/components/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { fetchPoolPricePoints } from "./lib/indexer";

interface PricePointData {
  timestamp: number;
  price1: number;
}

interface PriceChartProps {
  poolId: string;
  ticker: string;
}

const PoolPriceChart: React.FC<PriceChartProps> = ({ poolId, ticker }) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["poolPricePoints", poolId],
    queryFn: () => fetchPoolPricePoints(poolId),
  });

  if (error) {
    throw new Error(
      "Failed to fetch pool price points - " + (error as Error).message,
    );
  }

  return (
    <div className="w-full">
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Spinner />
        </div>
      ) : data && data.length > 0 ? (
        <TVPriceChart priceData={data} ticker={ticker} />
      ) : (
        <div className="text-center py-20 text-gray-500">
          No price data available.
        </div>
      )}
    </div>
  );
};

const TVPriceChart: React.FC<{
  priceData: PricePointData[];
  ticker: string;
}> = ({ priceData, ticker }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart>>();
  const priceSeriesRef = useRef<ISeriesApi<"Line">>();

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Create chart
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#333",
        attributionLogo: false,
      },
      width: container.clientWidth,
      height: 400,
      rightPriceScale: {
        autoScale: true,
        scaleMargins: { top: 0.1, bottom: 0.2 },
        mode: 1,
      },
      timeScale: { timeVisible: true },
    });
    chartRef.current = chart;

    priceSeriesRef.current = chart.addSeries(LineSeries, {
      color: "#8b5cf6",
      lineWidth: 2,
      title: `ETH / ${ticker}`,
      priceFormat: {
        type: "price",
        precision: 8,
        minMove: 0.000001,
      } as PriceFormatBuiltIn,
    } as LineSeriesOptions);

    // ResizeObserver for dynamic container resizing
    const ro = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width } = entry.contentRect;
        chart.applyOptions({ width });
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [ticker]);

  useEffect(() => {
    if (!priceSeriesRef.current || priceData.length === 0) return;

    // Sort ascending by raw timestamp
    const sorted = [...priceData].sort((a, b) => a.timestamp - b.timestamp);

    // Map to fractional-second UTCTimestamp to avoid duplicates
    const points = sorted.map((d) => ({
      time: (d.timestamp / 1000) as UTCTimestamp,
      value: d.price1,
    }));

    // Push data
    priceSeriesRef.current.setData(points);

    // Fit content to series
    chartRef.current?.timeScale().fitContent();
  }, [priceData]);

  return (
    <div
      ref={containerRef}
      style={{ width: "99vw", height: "400px", position: "relative" }}
    />
  );
};

export default PoolPriceChart;
