import React, {
  useRef,
  useLayoutEffect,
  useEffect,
  useState,
  useMemo,
} from "react";
import { useTranslation } from "react-i18next";
import {
  createChart,
  CrosshairMode,
  UTCTimestamp,
  IChartApi,
  ISeriesApi,
  ColorType,
} from "lightweight-charts";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchPoolCandles, CandleData } from "./lib/indexer";
import { useChartTheme } from "./hooks/use-chart-theme";
import { Button } from "./components/ui/button";
import { usePrice } from "./hooks/use-price";
import { cn } from "./lib/utils";
import { SlashIcon } from "lucide-react";

const ONE_MONTH = 30 * 24 * 60 * 60;
const RANGE = 7 * 24 * 60 * 60;

interface CandleChartProps {
  poolId: string;
  interval?: "1m" | "1h" | "1d";
}

const PoolCandleChart: React.FC<CandleChartProps> = ({
  poolId,
  interval = "1h",
}) => {
  const { t } = useTranslation();
  const [selectedInterval, setSelectedInterval] = useState<"1m" | "1h" | "1d">(
    interval,
  );
  const [showUSD, setShowUSD] = useState(false);

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

  // ── live ETH‑USD price ────────────────────────────────────────────────────
  const { data: ethPriceData } = usePrice({ ticker: "WETH" });
  const ethPrice = useMemo(
    () => Number(ethPriceData?.[1] ?? 0),
    [ethPriceData],
  );

  if (error) console.error(error);

  const handleIntervalChange = (newInterval: "1m" | "1h" | "1d") => {
    setSelectedInterval(newInterval);
  };

  const allCandles = data?.pages.flatMap((page) => page) ?? [];

  return (
    <div className="w-full">
      <div className="mb-4 flex justify-between space-x-2">
        <div>
          <Button
            variant="outline"
            onClick={() => handleIntervalChange("1h")}
            className={`px-3 py-1 rounded ${
              selectedInterval === "1h"
                ? "bg-primary text-background"
                : "bg-secondary text-foreground"
            }`}
          >
            1h
          </Button>
          <Button
            variant="outline"
            onClick={() => handleIntervalChange("1d")}
            className={`px-3 py-1 rounded ${
              selectedInterval === "1d"
                ? "bg-primary text-background"
                : "bg-secondary text-foreground"
            }`}
          >
            1d
          </Button>
        </div>
        <div className="flex items-center justify-center">
          <button
            onClick={() => setShowUSD(true)}
            className={cn(
              "px-1 py-1 rounded",
              showUSD ? "text-blue-500" : "text-foreground",
            )}
          >
            USD
          </button>
          <span className="mx-2">/</span>
          <button
            onClick={() => setShowUSD(false)}
            className={cn(
              "px-1 py-1 rounded",
              !showUSD ? "text-blue-500" : "text-foreground",
            )}
          >
            WETH
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <LoadingLogo />
        </div>
      ) : allCandles.length > 0 ? (
        <TVCandlestick
          rawData={allCandles}
          showUSD={showUSD}
          ethPrice={ethPrice}
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

// ── utility: dynamic formatter (DexScreener‑style) ─────────────────────────
const makePriceFormat = (isUSD: boolean) => {
  const formatter = (v: number): string => {
    // super‑tiny values → scientific notation
    if (v < 0.000001) return v.toExponential(2);

    // tiny (sub‑unit) values retain precision
    if (v < 1) return v.toFixed(isUSD ? 6 : 8);

    // mid‑range values
    if (v < 100) return v.toFixed(isUSD ? 4 : 6);

    // large values
    return v.toFixed(isUSD ? 2 : 5);
  };

  return {
    type: "custom" as const,
    minMove: 0.00000001, // keeps the scale smooth
    formatter,
  };
};

interface TVChartProps {
  rawData: CandleData[];
  onVisibleTimeRangeChange: () => void;
  showUSD: boolean;
  ethPrice: number;
}

const TVCandlestick: React.FC<TVChartProps> = ({
  rawData,
  onVisibleTimeRangeChange,
  showUSD,
  ethPrice,
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
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { scaleMargins: { top: 0.2, bottom: 0.2 } },
      timeScale: { timeVisible: true, secondsVisible: false },
    });
    chartRef.current = chart;

    seriesRef.current = chart.addCandlestickSeries({
      upColor: chartTheme.upColor,
      downColor: chartTheme.downColor,
      wickUpColor: chartTheme.wickUpColor,
      wickDownColor: chartTheme.wickDownColor,
      borderVisible: false,
      wickVisible: true,
      priceFormat: makePriceFormat(showUSD), // initial format
    });

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

    // ── filter + convert + sort ────────────────────────────────────────────
    let filtered = rawData.filter(
      (d) => !(d.open === d.high && d.high === d.low && d.low === d.close),
    );
    const highs = filtered.map((d) => d.high).sort((a, b) => a - b);
    const cutoff = highs[Math.floor(highs.length * 0.99)] ?? Infinity;
    filtered = filtered.filter((d) => d.high <= cutoff);

    const tvData = filtered
      .map((d) => {
        const m = showUSD && ethPrice ? ethPrice : 1;
        return {
          time: d.date as UTCTimestamp,
          open: d.open * m,
          high: d.high * m,
          low: d.low * m,
          close: d.close * m,
        };
      })
      .sort((a, b) => a.time - b.time)
      .filter(
        (item, index, arr) => index === 0 || item.time !== arr[index - 1].time,
      );

    // ── update formatter & data ───────────────────────────────────────────
    seriesRef.current.applyOptions({ priceFormat: makePriceFormat(showUSD) });
    seriesRef.current.setData(tvData);

    if (initialLoadRef.current) {
      chartRef.current?.timeScale().fitContent();
      initialLoadRef.current = false;
    }
  }, [rawData, showUSD, ethPrice]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "400px", position: "relative" }}
    />
  );
};

export default PoolCandleChart;
