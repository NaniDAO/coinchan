import React, { useRef, useLayoutEffect, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  PriceFormatBuiltIn,
} from "lightweight-charts";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchPoolCandles, CandleData } from "./lib/indexer";
import { useChartTheme } from "./hooks/use-chart-theme";
import { Button } from "./components/ui/button";

const ONE_MONTH = 30 * 24 * 60 * 60;
const RANGE = 7 * 24 * 60 * 60;

interface CandleChartProps {
  poolId: string;
  interval?: "1m" | "1h" | "1d";
}

const PoolCandleChart: React.FC<CandleChartProps> = ({ poolId, interval = "1h" }) => {
  const { t } = useTranslation();
  const [selectedInterval, setSelectedInterval] = useState<"1m" | "1h" | "1d">(interval);

  const { data, isLoading, error, isFetchingNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ["poolCandles", poolId, selectedInterval],
    initialPageParam: {
      to: Math.floor(Date.now() / 1000),
      from: Math.floor(Date.now() / 1000) - ONE_MONTH,
    },
    queryFn: ({ pageParam }) => fetchPoolCandles(poolId, selectedInterval, pageParam.from, pageParam.to),
    getNextPageParam: (lastPage) => {
      const oldest = lastPage[0]?.date ?? 0;
      return oldest ? { from: oldest - RANGE, to: oldest } : undefined;
    },
  });

  if (error) console.error(error);

  const handleIntervalChange = (newInterval: "1m" | "1h" | "1d") => {
    setSelectedInterval(newInterval);
  };

  const allCandles = data?.pages.flatMap((page) => page) ?? [];

  return (
    <div className="w-full">
      <div className="mb-4 flex space-x-2">
        <Button
          variant="outline"
          onClick={() => handleIntervalChange("1h")}
          className={`px-3 py-1 rounded ${
            selectedInterval === "1h" ? "bg-primary text-background" : "bg-secondary text-foreground"
          }`}
        >
          1h
        </Button>
        <Button
          variant="outline"
          onClick={() => handleIntervalChange("1d")}
          className={`px-3 py-1 rounded ${
            selectedInterval === "1d" ? "bg-primary text-background" : "bg-secondary text-foreground"
          }`}
        >
          1d
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <LoadingLogo />
        </div>
      ) : allCandles.length > 0 ? (
        <TVCandlestick
          rawData={allCandles}
          onVisibleTimeRangeChange={() => {
            if (!isFetchingNextPage) {
              fetchNextPage();
            }
          }}
        />
      ) : (
        <div className="text-center py-20 text-muted-foreground">{t("chart.no_candle_data")}</div>
      )}
    </div>
  );
};

interface TVChartProps {
  rawData: CandleData[];
  onVisibleTimeRangeChange: () => void;
}

const TVCandlestick: React.FC<TVChartProps> = ({ rawData, onVisibleTimeRangeChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi>();
  const seriesRef = useRef<ISeriesApi<"Candlestick">>();
  const chartTheme = useChartTheme();
  const initialLoadRef = useRef(true);

  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: chartTheme.background },
        textColor: chartTheme.textColor,
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
      upColor: chartTheme.upColor,
      downColor: chartTheme.downColor,
      wickUpColor: chartTheme.wickUpColor,
      wickDownColor: chartTheme.wickDownColor,
      borderVisible: false,
      wickVisible: true,
      priceFormat: {
        type: "price",
        precision: 8,
        minMove: 0.000001,
      } as PriceFormatBuiltIn,
    } as CandlestickSeriesOptions);

    const handleResize = () => {
      requestAnimationFrame(() => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: containerRef.current.clientWidth,
          });
        }
      });
    };

    chart.timeScale().subscribeVisibleTimeRangeChange(onVisibleTimeRangeChange);
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = undefined;
      seriesRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current) return;

    let filtered = rawData.filter((d) => !(d.open === d.high && d.high === d.low && d.low === d.close));
    const highs = filtered.map((d) => d.high).sort((a, b) => a - b);
    const cutoff = highs[Math.floor(highs.length * 0.99)] ?? Infinity;
    filtered = filtered.filter((d) => d.high <= cutoff);

    const tvData: TVCandlestickData[] = filtered
      .map((d) => ({
        time: d.date as UTCTimestamp,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))
      .sort((a, b) => a.time - b.time)
      .filter((item, index, arr) => index === 0 || item.time !== arr[index - 1].time);

    seriesRef.current.setData(tvData);

    if (initialLoadRef.current) {
      chartRef.current?.timeScale().fitContent();
      initialLoadRef.current = false;
    }
  }, [rawData]);

  return <div ref={containerRef} style={{ width: "100%", height: "400px", position: "relative" }} />;
};

export default PoolCandleChart;
