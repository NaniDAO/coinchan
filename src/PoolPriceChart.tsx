import React, { useRef, useLayoutEffect, useEffect } from "react";
import {
  createChart,
  LineSeries,
  LineSeriesOptions,
  UTCTimestamp,
  ColorType,
  PriceFormatBuiltIn,
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

  if (error) console.error(error);

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
  const chartRef = useRef<any>();
  const priceSeriesRef = useRef<any>();

  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#333",
        attributionLogo: false,
      },
      width: containerRef.current.clientWidth,
      height: 400,
      rightPriceScale: {
        autoScale: true,
        scaleMargins: { top: 0.1, bottom: 0.2 },
        mode: 1, // Price scale mode with logarithmic
      },
      timeScale: { timeVisible: true },
    });
    chartRef.current = chart;

    priceSeriesRef.current = chart.addSeries(LineSeries, {
      color: "#8b5cf6",
      lineWidth: 2,
      title: `ETH / ${ticker}`,
      priceFormat: {
        type: "price", // use the regular price formatter
        precision: 8, // force 6 decimal places
        minMove: 0.000001, // smallest tick size
      } as PriceFormatBuiltIn,
    } as LineSeriesOptions);

    const handleResize = () => {
      chart.applyOptions({ width: containerRef.current!.clientWidth });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [ticker]);

  useEffect(() => {
    if (!priceSeriesRef.current || priceData.length === 0) return;

    const sorted = [...priceData].sort((a, b) => a.timestamp - b.timestamp);

    priceSeriesRef.current.setData(
      sorted.map((d) => ({
        time: Math.floor(d.timestamp) as UTCTimestamp,
        value: d.price1,
      })),
    );

    chartRef.current.timeScale().fitContent();
  }, [priceData]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "400px", position: "relative" }}
    />
  );
};

export default PoolPriceChart;
