import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEther } from "viem";
import {
  createChart,
  type IChartApi,
  ColorType,
  CrosshairMode,
  type CandlestickData,
  type UTCTimestamp,
  CandlestickSeries,
  AreaSeries,
} from "lightweight-charts";
import { useTheme } from "@/lib/theme";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { cn } from "@/lib/utils";
import { useZCurvePurchases, useZCurveSells } from "@/hooks/use-zcurve-sale";

interface ZCurvePriceChartProps {
  coinId: string;
  coinSymbol: string;
}

type ChartType = "line" | "candle";
type TimeInterval = "5m" | "1h" | "4h" | "1d";

interface PricePoint {
  timestamp: number;
  price: number;
  volume: number;
  type: "buy" | "sell";
}

export function ZCurvePriceChart({ coinId }: ZCurvePriceChartProps) {
  const { t } = useTranslation();
  const { theme: appTheme } = useTheme();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  
  const [chartType, setChartType] = useState<ChartType>("line");
  const [timeInterval, setTimeInterval] = useState<TimeInterval>("1h");
  const [hoveredPrice, setHoveredPrice] = useState<string | null>(null);
  const [hoveredTime, setHoveredTime] = useState<string | null>(null);
  
  // Fetch more data for chart
  const { data: purchases, isLoading: purchasesLoading } = useZCurvePurchases(coinId, 100);
  const { data: sells, isLoading: sellsLoading } = useZCurveSells(coinId, 100);
  
  const isLoading = purchasesLoading || sellsLoading;
  
  // Process data into price points
  const priceData = React.useMemo(() => {
    const points: PricePoint[] = [];
    
    if (purchases) {
      purchases.forEach(p => {
        const price = Number(formatEther(BigInt(p.pricePerToken)));
        points.push({
          timestamp: Number(p.timestamp),
          price,
          volume: Number(formatEther(BigInt(p.ethIn))),
          type: "buy",
        });
      });
    }
    
    if (sells) {
      sells.forEach(s => {
        const price = Number(formatEther(BigInt(s.pricePerToken)));
        points.push({
          timestamp: Number(s.timestamp),
          price,
          volume: Number(formatEther(BigInt(s.ethOut))),
          type: "sell",
        });
      });
    }
    
    // Sort by timestamp
    return points.sort((a, b) => a.timestamp - b.timestamp);
  }, [purchases, sells]);
  
  // Aggregate into candles based on interval
  const candleData = React.useMemo(() => {
    if (priceData.length === 0) return [];
    
    const intervalSeconds = {
      "5m": 300,
      "1h": 3600,
      "4h": 14400,
      "1d": 86400,
    }[timeInterval];
    
    const candles: CandlestickData[] = [];
    let currentCandle: CandlestickData | null = null;
    let currentPeriod = 0;
    
    priceData.forEach(point => {
      const period = Math.floor(point.timestamp / intervalSeconds) * intervalSeconds;
      
      if (period !== currentPeriod || !currentCandle) {
        if (currentCandle) {
          candles.push(currentCandle);
        }
        
        currentCandle = {
          time: period as UTCTimestamp,
          open: point.price,
          high: point.price,
          low: point.price,
          close: point.price,
        };
        currentPeriod = period;
      } else {
        currentCandle.high = Math.max(currentCandle.high, point.price);
        currentCandle.low = Math.min(currentCandle.low, point.price);
        currentCandle.close = point.price;
      }
    });
    
    if (currentCandle) {
      candles.push(currentCandle);
    }
    
    return candles;
  }, [priceData, timeInterval]);
  
  // Line chart data
  const lineData = React.useMemo(() => {
    return priceData.map(point => ({
      time: point.timestamp as UTCTimestamp,
      value: point.price,
    }));
  }, [priceData]);
  
  // Volume data
  const volumeData = React.useMemo(() => {
    const intervalSeconds = {
      "5m": 300,
      "1h": 3600,
      "4h": 14400,
      "1d": 86400,
    }[timeInterval];
    
    const volumes = new Map<number, number>();
    
    priceData.forEach(point => {
      const period = Math.floor(point.timestamp / intervalSeconds) * intervalSeconds;
      volumes.set(period, (volumes.get(period) || 0) + point.volume);
    });
    
    return Array.from(volumes.entries())
      .map(([time, volume]) => ({
        time: time as UTCTimestamp,
        value: volume,
        color: volume > 0 ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)',
      }))
      .sort((a, b) => a.time - b.time);
  }, [priceData, timeInterval]);
  
  // Theme configuration
  const theme = {
    backgroundColor: appTheme === "dark" ? "#0a0a0a" : "#ffffff",
    textColor: appTheme === "dark" ? "#e5e5e5" : "#171717",
    gridColor: appTheme === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)",
    upColor: "#22c55e",
    downColor: "#ef4444",
  };
  
  // Create chart
  useEffect(() => {
    if (!chartContainerRef.current || priceData.length === 0) return;
    
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: theme.backgroundColor },
        textColor: theme.textColor,
      },
      grid: {
        vertLines: { color: theme.gridColor },
        horzLines: { color: theme.gridColor },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: theme.gridColor,
      },
      timeScale: {
        borderColor: theme.gridColor,
        timeVisible: true,
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
    });
    
    chartRef.current = chart;
    
    // Add main series
    if (chartType === "candle" && candleData.length > 0) {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: theme.upColor,
        downColor: theme.downColor,
        borderUpColor: theme.upColor,
        borderDownColor: theme.downColor,
        wickUpColor: theme.upColor,
        wickDownColor: theme.downColor,
      });
      candleSeries.setData(candleData);
    } else if (lineData.length > 0) {
      const areaSeries = chart.addSeries(AreaSeries, {
        topColor: 'rgba(251, 146, 60, 0.4)',
        bottomColor: 'rgba(251, 146, 60, 0.05)',
        lineColor: '#fb923c',
        lineWidth: 2,
      });
      areaSeries.setData(lineData);
    }
    
    // Add volume bars
    if (volumeData.length > 0) {
      const volumeSeries = chart.addSeries(CandlestickSeries, {
        priceScaleId: 'volume',
        upColor: 'rgba(34, 197, 94, 0.5)',
        downColor: 'rgba(239, 68, 68, 0.5)',
      });
      
      // Convert volume to candle format for histogram effect
      const volumeBars = volumeData.map(v => ({
        time: v.time,
        open: 0,
        high: v.value,
        low: 0,
        close: v.value,
      }));
      
      volumeSeries.setData(volumeBars);
      
      chart.priceScale('volume').applyOptions({
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      });
    }
    
    // Subscribe to crosshair move
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setHoveredPrice(null);
        setHoveredTime(null);
        return;
      }
      
      const date = new Date(Number(param.time) * 1000);
      setHoveredTime(date.toLocaleString());
      
      // Find the price at this time
      const dataPoint = priceData.find(p => 
        Math.abs(p.timestamp - Number(param.time)) < 60
      );
      
      if (dataPoint) {
        setHoveredPrice(dataPoint.price.toFixed(8));
      }
    });
    
    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };
    
    window.addEventListener("resize", handleResize);
    
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [priceData, candleData, lineData, volumeData, chartType, theme, timeInterval]);
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <LoadingLogo className="h-8 w-8" />
      </div>
    );
  }
  
  if (priceData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        {t("trade.no_price_data", "No price data available yet")}
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Chart Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <div className="flex border border-border rounded-md">
            <button
              onClick={() => setChartType("line")}
              className={cn(
                "px-3 py-1 text-sm transition-colors",
                chartType === "line" 
                  ? "bg-primary text-primary-foreground" 
                  : "hover:bg-muted"
              )}
            >
              {t("chart.line", "Line")}
            </button>
            <button
              onClick={() => setChartType("candle")}
              className={cn(
                "px-3 py-1 text-sm transition-colors",
                chartType === "candle" 
                  ? "bg-primary text-primary-foreground" 
                  : "hover:bg-muted"
              )}
            >
              {t("chart.candles", "Candles")}
            </button>
          </div>
          
          <div className="flex border border-border rounded-md">
            {(["5m", "1h", "4h", "1d"] as TimeInterval[]).map(interval => (
              <button
                key={interval}
                onClick={() => setTimeInterval(interval)}
                className={cn(
                  "px-3 py-1 text-sm transition-colors",
                  timeInterval === interval 
                    ? "bg-primary text-primary-foreground" 
                    : "hover:bg-muted"
                )}
              >
                {interval}
              </button>
            ))}
          </div>
        </div>
        
        {/* Hover info */}
        {hoveredPrice && (
          <div className="text-sm text-muted-foreground">
            <span className="font-mono">{hoveredPrice} ETH</span>
            {hoveredTime && <span className="ml-2">• {hoveredTime}</span>}
          </div>
        )}
      </div>
      
      {/* Chart */}
      <div 
        ref={chartContainerRef} 
        className="w-full h-[400px] border border-border rounded-md"
      />
      
      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-500 rounded-sm" />
          <span>{t("chart.buy_volume", "Buy Volume")}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-500 rounded-sm" />
          <span>{t("chart.sell_volume", "Sell Volume")}</span>
        </div>
      </div>
    </div>
  );
}