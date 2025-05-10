import React, { useRef, useLayoutEffect, useEffect, useState } from "react";
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
  HistogramSeries,
  HistogramSeriesOptions,
  HistogramData,
} from "lightweight-charts";
import { Spinner } from "@/components/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { fetchPoolCandles, CandleData, TimeInterval, TIMEFRAME_OPTIONS } from "./lib/indexer";

interface CandleChartProps {
  poolId: string;
  interval?: TimeInterval;
}

const PoolCandleChart: React.FC<CandleChartProps> = ({ poolId, interval = "1h" }) => {
  const [selectedInterval, setSelectedInterval] = useState<TimeInterval>(interval);
  const [showVolume, setShowVolume] = useState<boolean>(true);

  const { data, isLoading, error } = useQuery({
    queryKey: ["poolCandles", poolId, selectedInterval],
    queryFn: () => fetchPoolCandles(poolId, selectedInterval),
    staleTime: 30000, // 30 seconds
  });

  if (error) console.error(error);

  const handleIntervalChange = (newInterval: TimeInterval) => {
    setSelectedInterval(newInterval);
  };

  // Filter to show only certain intervals in the UI
  const displayIntervals: TimeInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap justify-between items-center">
        <div className="flex flex-wrap space-x-1">
          {TIMEFRAME_OPTIONS
            .filter(option => displayIntervals.includes(option.value))
            .map((option) => (
              <button
                key={option.value}
                onClick={() => handleIntervalChange(option.value)}
                className={`px-3 py-1 rounded text-sm ${
                  selectedInterval === option.value
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {option.label}
              </button>
            ))}
        </div>
        <div className="flex items-center space-x-2">
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={showVolume}
              onChange={() => setShowVolume(!showVolume)}
              className="sr-only peer"
            />
            <div className="relative w-10 h-5 bg-gray-200 peer-checked:bg-blue-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
            <span className="ml-2 text-sm text-gray-600">Volume</span>
          </label>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Spinner />
        </div>
      ) : data && data.length > 0 ? (
        <TVCandlestick rawData={data} showVolume={showVolume} />
      ) : (
        <div className="text-center py-20 text-gray-500">No candle data available.</div>
      )}
    </div>
  );
};

interface TVChartProps {
  rawData: CandleData[];
  showVolume: boolean;
}

const TVCandlestick: React.FC<TVChartProps> = ({ rawData, showVolume }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi>();
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick">>();
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram">>();
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipData, setTooltipData] = useState<any>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

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
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          labelVisible: false,
        },
        horzLine: {
          labelVisible: false,
        },
      },
      rightPriceScale: {
        scaleMargins: { top: 0.1, bottom: 0.2 },
        borderVisible: false,
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderVisible: false,
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.05)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.05)' },
      },
    });
    chartRef.current = chart;

    // Add candle series
    candleSeriesRef.current = chart.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderUpColor: "#26a69a",
      borderDownColor: "#ef5350",
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
      priceFormat: {
        type: "price",
        precision: 8,
        minMove: 0.00000001,
      } as PriceFormatBuiltIn,
    } as CandlestickSeriesOptions);

    // Add volume series
    if (showVolume) {
      volumeSeriesRef.current = chart.addHistogramSeries({
        color: "#26a69a",
        priceFormat: {
          type: "volume",
        },
        priceScaleId: "volume",
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      } as HistogramSeriesOptions);
    }

    // Add tooltip behavior
    chart.subscribeCrosshairMove((param) => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.y < 0
      ) {
        setTooltipVisible(false);
        return;
      }

      const candle = rawData.find(
        (d) => d.date === (param.time as number)
      );
      if (candle) {
        setTooltipData({
          time: new Date(candle.date * 1000).toLocaleString(),
          open: candle.open.toFixed(8),
          high: candle.high.toFixed(8),
          low: candle.low.toFixed(8),
          close: candle.close.toFixed(8),
          volume: candle.volume?.toFixed(4) || "N/A"
        });

        setTooltipPosition({
          x: param.point.x,
          y: param.point.y
        });

        setTooltipVisible(true);
      }
    });

    // Responsiveness
    const handleResize = () => {
      chart.applyOptions({ width: containerRef.current!.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = undefined;
      candleSeriesRef.current = undefined;
      volumeSeriesRef.current = undefined;
    };
  }, [showVolume]);

  // 2) data updates — runs whenever rawData changes
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    // Filter out invalid candles
    let filtered = rawData.filter((d) => !(d.open === d.high && d.high === d.low && d.low === d.close));

    // Spike‐filtering at 99th percentile (optional)
    const highs = filtered.map((d) => d.high).sort((a, b) => a - b);
    const cutoff = highs[Math.floor(highs.length * 0.99)] ?? Infinity;
    filtered = filtered.filter((d) => d.high <= cutoff);

    // Map to TV's format (seconds‐based UTC timestamp)
    const tvData: TVCandlestickData[] = filtered.map((d) => ({
      time: d.date as UTCTimestamp,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    // Update candle data
    candleSeriesRef.current.setData(tvData);

    // Update volume data if volume series exists
    if (volumeSeriesRef.current && showVolume) {
      const volumeData: HistogramData[] = filtered.map((d) => ({
        time: d.date as UTCTimestamp,
        value: d.volume || 0,
        color: d.close >= d.open
          ? 'rgba(38, 166, 154, 0.5)'  // green for up candles
          : 'rgba(239, 83, 80, 0.5)'   // red for down candles
      }));
      volumeSeriesRef.current.setData(volumeData);
    }

    // Fit content
    chartRef.current?.timeScale().fitContent();
  }, [rawData, showVolume]);

  return (
    <div className="relative">
      <div ref={containerRef} style={{ width: "100%", height: "400px", position: "relative" }} />

      {/* Custom tooltip */}
      {tooltipVisible && tooltipData && (
        <div
          className="absolute z-10 bg-white/90 backdrop-blur-sm p-2 rounded shadow-md border border-gray-200 text-xs"
          style={{
            left: `${tooltipPosition.x + 10}px`,
            top: `${tooltipPosition.y + 10}px`,
            transform: tooltipPosition.x > containerRef.current!.clientWidth - 150
              ? 'translateX(-100%)'
              : 'translateX(0)'
          }}
        >
          <div className="font-medium">{tooltipData.time}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1">
            <div className="text-gray-600">Open:</div>
            <div>{tooltipData.open}</div>
            <div className="text-gray-600">High:</div>
            <div>{tooltipData.high}</div>
            <div className="text-gray-600">Low:</div>
            <div>{tooltipData.low}</div>
            <div className="text-gray-600">Close:</div>
            <div>{tooltipData.close}</div>
            {showVolume && (
              <>
                <div className="text-gray-600">Volume:</div>
                <div>{tooltipData.volume}</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PoolCandleChart;
