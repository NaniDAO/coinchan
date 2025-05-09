import React, { useRef, useLayoutEffect, useEffect } from "react";
import {
  createChart,
  CrosshairMode,
  UTCTimestamp,
  CandlestickSeriesOptions,
  CandlestickData as TVCandlestickData,
  CandlestickSeries,
  IChartApi,
  ISeriesApi,
  ColorType,
} from "lightweight-charts";
import { Spinner } from "@/components/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { fetchPoolCandles, CandleData } from "./lib/indexer";

interface CandleChartProps {
  poolId: string;
  interval?: "1m" | "1h" | "1d";
}

const PoolCandleChart: React.FC<CandleChartProps> = ({
  poolId,
  interval = "1h",
}) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["poolCandles", poolId, interval],
    queryFn: () => fetchPoolCandles(poolId, interval),
  });

  if (error) console.error(error);

  return (
    <div className="w-full">
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Spinner />
        </div>
      ) : data && data.length > 0 ? (
        <TVCandlestick rawData={data} />
      ) : (
        <div className="text-center py-20 text-gray-500">
          No candle data available.
        </div>
      )}
    </div>
  );
};

interface TVChartProps {
  rawData: CandleData[];
}

const TVCandlestick: React.FC<TVChartProps> = ({ rawData }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi>();
  const seriesRef = useRef<ISeriesApi<"Candlestick">>();

  // 1) chart creation — only once
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
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { scaleMargins: { top: 0.2, bottom: 0.2 } },
      timeScale: { timeVisible: true, secondsVisible: false },
    });
    chartRef.current = chart;

    seriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: "#34d399",
      downColor: "#f87171",
      wickUpColor: "#34d399",
      wickDownColor: "#f87171",
      borderVisible: false,
      wickVisible: true,
    } as CandlestickSeriesOptions);

    // responsiveness
    const handleResize = () => {
      chart.applyOptions({ width: containerRef.current!.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = undefined;
      seriesRef.current = undefined;
    };
  }, []);

  // 2) data updates — runs whenever rawData changes
  useEffect(() => {
    if (!seriesRef.current) return;

    // your existing cleaning steps:
    let filtered = rawData.filter(
      (d) => !(d.open === d.high && d.high === d.low && d.low === d.close),
    );
    // spike‐filtering at 99th percentile (optional)
    const highs = filtered.map((d) => d.high).sort((a, b) => a - b);
    const cutoff = highs[Math.floor(highs.length * 0.99)] ?? Infinity;
    filtered = filtered.filter((d) => d.high <= cutoff);

    // map to TV's format (seconds‐based UTC timestamp)
    const tvData: TVCandlestickData[] = filtered.map((d) => ({
      time: Math.floor(d.date / 1000) as UTCTimestamp,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    seriesRef.current.setData(tvData);
    chartRef.current?.timeScale().fitContent();
  }, [rawData]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "400px", position: "relative" }}
    />
  );
};

export default PoolCandleChart;
