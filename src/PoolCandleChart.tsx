import { LoadingLogo } from "@/components/ui/loading-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  CandlestickSeries,
  type CandlestickSeriesOptions,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData as TVCandlestickData,
  type UTCTimestamp,
  createChart,
} from "lightweight-charts";
import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useChartTheme } from "./hooks/use-chart-theme";
import { type CandleData, fetchPoolCandles } from "./lib/indexer";
import { cn } from "./lib/utils";
import { formatWithSubscriptZeros } from "./lib/chart";

const ONE_MONTH = 30 * 24 * 60 * 60;
const RANGE = 7 * 24 * 60 * 60;

interface CandleChartProps {
  poolId: string;
  interval?: "1m" | "1h" | "1d";
  ticker: string;
  ethUsdPrice?: number;
}

const PoolCandleChart: React.FC<CandleChartProps> = ({
  poolId,
  interval = "1h",
  ticker,
  ethUsdPrice,
}) => {
  const { t } = useTranslation();
  const [selectedInterval, setSelectedInterval] = useState<"1m" | "1h" | "1d">(
    interval,
  );
  const [showUsd, setShowUsd] = useState(false);

  const { data, isLoading, error, isFetchingNextPage, fetchNextPage } =
    useInfiniteQuery({
      queryKey: ["poolCandles", poolId, selectedInterval],
      initialPageParam: {
        to: Math.floor(Date.now() / 1000),
        from: Math.floor(Date.now() / 1000) - ONE_MONTH,
      },
      queryFn: ({ pageParam }) =>
        fetchPoolCandles(
          poolId,
          selectedInterval,
          pageParam.from,
          pageParam.to,
        ),
      getNextPageParam: (lastPage) => {
        const oldest = lastPage[0]?.date ?? 0;
        return oldest ? { from: oldest - RANGE, to: oldest } : undefined;
      },
    });

  if (error) console.error(error);

  const handleIntervalChange = (newInterval: "1m" | "1h" | "1d") => {
    setSelectedInterval(newInterval);
  };

  const allCandles = data?.pages.flat() ?? [];

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex border border-border">
          <button
            onClick={() => handleIntervalChange("1h")}
            className={cn(
              "text-xs w-full p-1 hover:bg-muted hover:text-muted-foreground",
              selectedInterval === "1h" && "bg-accent text-accent-foreground",
            )}
          >
            1h
          </button>
          <button
            onClick={() => handleIntervalChange("1d")}
            className={cn(
              "text-xs w-full p-1 hover:bg-muted hover:text-muted-foreground",
              selectedInterval === "1d" && "bg-accent text-accent-foreground",
            )}
          >
            1d
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
        <div className="relative h-[400px]">
          {/* Skeleton candles */}
          <div className="absolute inset-0 p-4">
            <div className="h-full w-full flex items-end justify-around gap-1">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="flex-1 flex flex-col justify-end">
                  <Skeleton 
                    className="w-full opacity-10" 
                    style={{ 
                      height: `${Math.random() * 60 + 20}%`,
                      animationDelay: `${i * 50}ms`
                    }} 
                  />
                </div>
              ))}
            </div>
          </div>
          {/* Loading indicator overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <LoadingLogo />
            <p className="text-sm text-muted-foreground animate-pulse mt-3">
              {t("chart.loading_candle_data", "Loading market data...")}
            </p>
          </div>
        </div>
      ) : allCandles.length > 0 ? (
        <TVCandlestick
          rawData={allCandles}
          ticker={ticker}
          showUsd={showUsd}
          ethUsdPrice={ethUsdPrice}
          onVisibleTimeRangeChange={() => {
            if (!isFetchingNextPage) {
              fetchNextPage();
            }
          }}
        />
      ) : (
        <div className="text-center py-20 text-muted-foreground">
          {t("chart.no_candle_data")}
        </div>
      )}
    </div>
  );
};

interface TVChartProps {
  rawData: CandleData[];
  ticker: string;
  showUsd?: boolean;
  ethUsdPrice?: number;
  onVisibleTimeRangeChange: () => void;
}

const TVCandlestick: React.FC<TVChartProps> = ({
  rawData,
  ticker,
  showUsd = false,
  ethUsdPrice,
  onVisibleTimeRangeChange,
}) => {
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
      crosshair: { 
        mode: CrosshairMode.Normal,
        horzLine: {
          color: chartTheme.crosshairColor,
          width: 1,
          style: 2,
          labelBackgroundColor: chartTheme.background || '#ffffff',
        },
        vertLine: {
          color: chartTheme.crosshairColor,
          width: 1,
          style: 2,
          labelBackgroundColor: chartTheme.background || '#ffffff',
        },
      },
      rightPriceScale: { 
        scaleMargins: { top: 0.2, bottom: 0.2 },
        borderVisible: false,
        entireTextOnly: true,
      },
      timeScale: { 
        timeVisible: true, 
        secondsVisible: false,
        borderVisible: false,
        rightOffset: 5,
        barSpacing: 8,
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

    seriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: chartTheme.upColor || '#10b981',
      downColor: chartTheme.downColor || '#ef4444',
      wickUpColor: chartTheme.wickUpColor || '#10b981',
      wickDownColor: chartTheme.wickDownColor || '#ef4444',
      borderVisible: true,
      borderUpColor: chartTheme.upColor || '#10b981',
      borderDownColor: chartTheme.downColor || '#ef4444',
      wickVisible: true,
      title: showUsd && ethUsdPrice ? `${ticker} / USD` : `ETH / ${ticker}`,
      priceFormat: {
        type: "custom",
        formatter: formatWithSubscriptZeros,
        minMove: 0.000000001,
      },
      lastValueVisible: true,
      priceLineVisible: true,
      priceLineWidth: 1,
      priceLineColor: chartTheme.textColor || '#333333',
      priceLineStyle: 2,
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

  // Update series title when showUsd or ethUsdPrice changes
  useEffect(() => {
    if (!seriesRef.current) return;

    seriesRef.current.applyOptions({
      title: showUsd && ethUsdPrice ? `${ticker} / USD` : `ETH / ${ticker}`,
      priceFormat: {
        type: "custom",
        formatter: formatWithSubscriptZeros,
        minMove: 0.000000001,
      },
    } as CandlestickSeriesOptions);
  }, [showUsd, ethUsdPrice, ticker]);

  useEffect(() => {
    if (!seriesRef.current) return;

    let filtered = rawData.filter(
      (d) => !(d.open === d.high && d.high === d.low && d.low === d.close),
    );

    const highs = filtered.map((d) => d.high).sort((a, b) => a - b);
    const cutoff =
      highs[Math.floor(highs.length * 0.99)] ?? Number.POSITIVE_INFINITY;
    filtered = filtered.filter((d) => d.high <= cutoff);

    const tvData: TVCandlestickData[] = filtered
      .map((d) => {
        // Apply USD conversion if enabled
        const multiplier = showUsd && ethUsdPrice ? ethUsdPrice : 1;

        return {
          time: d.date as UTCTimestamp,
          open: d.open * multiplier,
          high: d.high * multiplier,
          low: d.low * multiplier,
          close: d.close * multiplier,
        };
      })
      .sort((a, b) => a.time - b.time)
      .filter(
        (item, index, arr) => index === 0 || item.time !== arr[index - 1].time,
      );

    seriesRef.current.setData(tvData);

    if (initialLoadRef.current) {
      chartRef.current?.timeScale().fitContent();
      initialLoadRef.current = false;
    }
  }, [rawData, showUsd, ethUsdPrice]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "400px", position: "relative" }}
    />
  );
};

export default PoolCandleChart;
