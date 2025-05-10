import React, { useRef, useLayoutEffect, useEffect, useState } from "react";
import {
  createChart,
  LineSeries,
  LineSeriesOptions,
  UTCTimestamp,
  ColorType,
  PriceFormatBuiltIn,
  CrosshairMode,
  HistogramSeries,
} from "lightweight-charts";
import { Spinner } from "@/components/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import {
  fetchPoolPricePoints,
  PricePointData,
  TimeInterval,
  TIMEFRAME_OPTIONS
} from "./lib/indexer";
import { calculateSMA } from "./lib/chart-indicators";

interface PriceChartProps {
  poolId: string;
  ticker: string;
  interval?: TimeInterval;
}

const PoolPriceChart: React.FC<PriceChartProps> = ({ poolId, ticker, interval = "1h" }) => {
  const [showMA, setShowMA] = useState<boolean>(false);
  const [maPeriod, setMaPeriod] = useState<number>(20);

  const { data, isLoading, error } = useQuery({
    queryKey: ["poolPricePoints", poolId],
    queryFn: () => fetchPoolPricePoints(poolId),
    staleTime: 30000, // 30 seconds
  });

  if (error) console.error(error);

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap justify-between items-center">
        <div className="text-sm font-medium text-gray-700">
          Price Chart: {ticker}/ETH
        </div>
        <div className="flex items-center space-x-4">
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={showMA}
              onChange={() => setShowMA(!showMA)}
              className="sr-only peer"
            />
            <div className="relative w-10 h-5 bg-gray-200 peer-checked:bg-blue-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
            <span className="ml-2 text-sm text-gray-600">MA</span>
          </label>
          {showMA && (
            <select
              value={maPeriod}
              onChange={(e) => setMaPeriod(Number(e.target.value))}
              className="bg-gray-100 border border-gray-300 text-sm rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value={7}>MA(7)</option>
              <option value={20}>MA(20)</option>
              <option value={50}>MA(50)</option>
              <option value={200}>MA(200)</option>
            </select>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Spinner />
        </div>
      ) : data && data.length > 0 ? (
        <TVPriceChart
          priceData={data}
          ticker={ticker}
          showMA={showMA}
          maPeriod={maPeriod}
        />
      ) : (
        <div className="text-center py-20 text-gray-500">No price data available.</div>
      )}
    </div>
  );
};

const TVPriceChart: React.FC<{
  priceData: PricePointData[];
  ticker: string;
  showMA: boolean;
  maPeriod: number;
}> = ({ priceData, ticker, showMA, maPeriod }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>();
  const priceSeriesRef = useRef<any>();
  const maSeriesRef = useRef<any>();
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipData, setTooltipData] = useState<any>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

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
        autoScale: true,
        scaleMargins: { top: 0.1, bottom: 0.2 },
        mode: 1, // Price scale mode with logarithmic
        borderVisible: false,
      },
      timeScale: {
        timeVisible: true,
        borderVisible: false,
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.05)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.05)' },
      },
    });
    chartRef.current = chart;

    priceSeriesRef.current = chart.addLineSeries({
      color: "#3f51b5", // More vibrant blue
      lineWidth: 2,
      crosshairMarkerVisible: true,
      lastValueVisible: true,
      title: `ETH / ${ticker}`,
      priceFormat: {
        type: "price",
        precision: 8,
        minMove: 0.00000001,
      } as PriceFormatBuiltIn,
    } as LineSeriesOptions);

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

      const dataPoint = priceData.find(
        (d) => Math.floor(d.timestamp) === (param.time as number)
      );

      if (dataPoint) {
        setTooltipData({
          time: new Date(dataPoint.timestamp * 1000).toLocaleString(),
          price: dataPoint.price1.toFixed(8),
        });

        setTooltipPosition({
          x: param.point.x,
          y: param.point.y
        });

        setTooltipVisible(true);
      }
    });

    const handleResize = () => {
      chart.applyOptions({ width: containerRef.current!.clientWidth });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [ticker, priceData]);

  // Update price data
  useEffect(() => {
    if (!priceSeriesRef.current || priceData.length === 0) return;

    const sorted = [...priceData].sort((a, b) => a.timestamp - b.timestamp);

    priceSeriesRef.current.setData(
      sorted.map((d) => ({
        time: Math.floor(d.timestamp) as UTCTimestamp,
        value: d.price1,
      })),
    );

    // Handle MA series
    if (showMA) {
      // Convert price data to candle-like format for the indicator calculation
      const candleData = sorted.map(d => ({
        date: Math.floor(d.timestamp),
        open: d.price1,
        high: d.price1,
        low: d.price1,
        close: d.price1,
        volume: 0
      }));

      // Calculate MA
      const maData = calculateSMA(candleData, maPeriod);

      // Add or update MA series
      if (!maSeriesRef.current) {
        maSeriesRef.current = chartRef.current.addLineSeries({
          color: '#ff9800', // Orange
          lineWidth: 2,
          lineStyle: 1, // Dashed
          title: `MA(${maPeriod})`,
        });
      }

      maSeriesRef.current.applyOptions({
        title: `MA(${maPeriod})`,
      });

      maSeriesRef.current.setData(maData);
    } else if (maSeriesRef.current) {
      // Remove MA series if it exists but showMA is false
      chartRef.current.removeSeries(maSeriesRef.current);
      maSeriesRef.current = null;
    }

    chartRef.current.timeScale().fitContent();
  }, [priceData, showMA, maPeriod]);

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
            <div className="text-gray-600">Price:</div>
            <div>{tooltipData.price}</div>
            {showMA && (
              <>
                <div className="text-gray-600">MA({maPeriod}):</div>
                <div>{tooltipData.ma || 'N/A'}</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PoolPriceChart;
