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
  HistogramSeries,
  type HistogramData,
} from "lightweight-charts";
import { useTheme } from "@/lib/theme";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { cn } from "@/lib/utils";
import { useZCurvePurchases, useZCurveSells } from "@/hooks/use-zcurve-sale";

// Helper function to format price in a readable way
const formatPrice = (price: number, priceWei?: bigint): string => {
  // If we have the exact wei value, use it for very small prices
  if (priceWei !== undefined && priceWei < 1000000n) {
    return `${priceWei.toString()} wei`;
  }
  
  if (price === 0) return "0";

  // For very small prices, show in gwei or wei
  if (price < 1e-15) {
    const wei = Math.round(price * 1e18);
    return `${wei} wei`;
  }
  if (price < 1e-9) {
    const gwei = price * 1e9;
    return `${gwei.toFixed(3)} gwei`;
  }
  if (price < 1e-6) {
    return `${(price * 1e6).toFixed(3)} μETH`;
  }
  if (price < 0.01) {
    return `${price.toFixed(8)} ETH`;
  }
  return `${price.toFixed(6)} ETH`;
};

// Helper function to format tokens per ETH
const formatTokensPerEth = (priceInEth: number, priceWei?: bigint): string => {
  // If price is very small (or provided in wei), calculate from wei
  if (priceWei !== undefined && priceWei > 0n) {
    const oneEthInWei = BigInt(1e18);
    const tokensPerEth = Number(oneEthInWei) / Number(priceWei);
    
    if (tokensPerEth >= 1e9) {
      return `${(tokensPerEth / 1e9).toFixed(2)}B per ETH`;
    } else if (tokensPerEth >= 1e6) {
      return `${(tokensPerEth / 1e6).toFixed(2)}M per ETH`;
    } else if (tokensPerEth >= 1e3) {
      return `${(tokensPerEth / 1e3).toFixed(2)}K per ETH`;
    } else if (tokensPerEth >= 1) {
      return `${tokensPerEth.toFixed(2)} per ETH`;
    } else {
      return `${tokensPerEth.toFixed(6)} per ETH`;
    }
  }
  
  if (priceInEth === 0 || priceInEth < 1e-18) return "∞ per ETH";

  const tokensPerEth = 1 / priceInEth;

  if (tokensPerEth >= 1e9) {
    return `${(tokensPerEth / 1e9).toFixed(2)}B per ETH`;
  } else if (tokensPerEth >= 1e6) {
    return `${(tokensPerEth / 1e6).toFixed(2)}M per ETH`;
  } else if (tokensPerEth >= 1e3) {
    return `${(tokensPerEth / 1e3).toFixed(2)}K per ETH`;
  } else if (tokensPerEth >= 1) {
    return `${tokensPerEth.toFixed(2)} per ETH`;
  } else {
    return `${tokensPerEth.toFixed(6)} per ETH`;
  }
};

interface ZCurvePriceChartProps {
  coinId: string;
  coinSymbol: string;
  currentBondingPrice?: string; // Current price from bonding curve
  isActiveSale?: boolean;
}

type ChartType = "line" | "candle";
type TimeInterval = "5m" | "1h" | "4h" | "1d";

interface PricePoint {
  timestamp: number;
  price: number;
  volume: number;
  type: "buy" | "sell";
}

export function ZCurvePriceChart({ coinId, currentBondingPrice, isActiveSale }: ZCurvePriceChartProps) {
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
      purchases.forEach((p) => {
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
      sells.forEach((s) => {
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

    const candles = new Map<
      number,
      {
        open: number;
        high: number;
        low: number;
        close: number;
        openTime: number;
        closeTime: number;
        prices: { time: number; price: number }[];
      }
    >();

    // Group price points by period
    priceData.forEach((point) => {
      const period = Math.floor(point.timestamp / intervalSeconds) * intervalSeconds;

      if (!candles.has(period)) {
        candles.set(period, {
          open: point.price,
          high: point.price,
          low: point.price,
          close: point.price,
          openTime: point.timestamp,
          closeTime: point.timestamp,
          prices: [],
        });
      }

      const candle = candles.get(period)!;
      candle.prices.push({ time: point.timestamp, price: point.price });
      candle.high = Math.max(candle.high, point.price);
      candle.low = Math.min(candle.low, point.price);

      // Update open/close based on actual timestamps
      if (point.timestamp < candle.openTime) {
        candle.open = point.price;
        candle.openTime = point.timestamp;
      }
      if (point.timestamp > candle.closeTime) {
        candle.close = point.price;
        candle.closeTime = point.timestamp;
      }
    });

    // Convert to array and sort prices within each candle by time
    const candleArray: CandlestickData[] = Array.from(candles.entries())
      .map(([period, data]) => {
        // Sort prices by time to get proper open/close
        data.prices.sort((a, b) => a.time - b.time);
        return {
          time: period as UTCTimestamp,
          open: data.prices[0]?.price || data.open,
          high: data.high,
          low: data.low,
          close: data.prices[data.prices.length - 1]?.price || data.close,
        };
      })
      .sort((a, b) => a.time - b.time);

    return candleArray;
  }, [priceData, timeInterval]);

  // Line chart data
  const lineData = React.useMemo(() => {
    return priceData.map((point) => ({
      time: point.timestamp as UTCTimestamp,
      value: point.price,
    }));
  }, [priceData]);

  // Volume data with buy/sell differentiation
  const volumeData = React.useMemo(() => {
    const intervalSeconds = {
      "5m": 300,
      "1h": 3600,
      "4h": 14400,
      "1d": 86400,
    }[timeInterval];

    const volumes = new Map<number, { buy: number; sell: number; total: number }>();

    priceData.forEach((point) => {
      const period = Math.floor(point.timestamp / intervalSeconds) * intervalSeconds;
      const current = volumes.get(period) || { buy: 0, sell: 0, total: 0 };

      if (point.type === "buy") {
        current.buy += point.volume;
      } else {
        current.sell += point.volume;
      }
      current.total += point.volume;

      volumes.set(period, current);
    });

    return Array.from(volumes.entries())
      .map(([time, vol]) => ({
        time: time as UTCTimestamp,
        value: vol.total,
        color: vol.buy > vol.sell ? "#22c55e" : "#ef4444",
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
        attributionLogo: false,
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
        topColor: "rgba(251, 146, 60, 0.4)",
        bottomColor: "rgba(251, 146, 60, 0.05)",
        lineColor: "#fb923c",
        lineWidth: 2,
      });
      areaSeries.setData(lineData);
    }

    // Add volume histogram
    if (volumeData.length > 0) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceScaleId: "volume",
        priceFormat: {
          type: "volume",
        },
      });

      volumeSeries.setData(volumeData as HistogramData[]);

      chart.priceScale("volume").applyOptions({
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
      const dataPoint = priceData.find((p) => Math.abs(p.timestamp - Number(param.time)) < 60);

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

  // Calculate summary statistics - must be called before any returns
  const stats = React.useMemo(() => {
    // For active sales with no trading data, use bonding curve price
    if (priceData.length === 0 && isActiveSale && currentBondingPrice) {
      // Keep the price in wei to avoid precision loss
      const bondingPriceWei = BigInt(currentBondingPrice);
      const bondingPriceNum = Number(formatEther(bondingPriceWei));
      
      return {
        currentPrice: bondingPriceNum,
        currentPriceWei: bondingPriceWei, // Store wei value for accurate display
        openPrice: bondingPriceNum,
        highPrice: bondingPriceNum,
        lowPrice: bondingPriceNum,
        priceChange: 0,
        priceChangePercent: 0,
        totalVolume: 0,
        buyVolume: 0,
        sellVolume: 0,
      };
    }

    if (priceData.length === 0) return null;

    const prices = priceData.map((p) => p.price);
    const currentPrice = prices[prices.length - 1];
    const openPrice = prices[0];
    const highPrice = Math.max(...prices);
    const lowPrice = Math.min(...prices);
    const priceChange = currentPrice - openPrice;
    const priceChangePercent = openPrice > 0 ? (priceChange / openPrice) * 100 : 0;
    const totalVolume = priceData.reduce((sum, p) => sum + p.volume, 0);
    const buyVolume = priceData.filter((p) => p.type === "buy").reduce((sum, p) => sum + p.volume, 0);
    const sellVolume = totalVolume - buyVolume;

    return {
      currentPrice,
      openPrice,
      highPrice,
      lowPrice,
      priceChange,
      priceChangePercent,
      totalVolume,
      buyVolume,
      sellVolume,
    };
  }, [priceData, isActiveSale, currentBondingPrice]);

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
      {/* Summary Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("chart.current_price", "Current Price")}</p>
            <p
              className={cn(
                "text-sm font-mono font-medium",
                stats.priceChange >= 0 ? "text-green-600" : "text-red-600",
              )}
            >
              {formatPrice(stats.currentPrice, stats.currentPriceWei)}
            </p>
            <p className="text-xs font-mono text-muted-foreground">{formatTokensPerEth(stats.currentPrice, stats.currentPriceWei)}</p>
            <p className={cn("text-xs", stats.priceChange >= 0 ? "text-green-600" : "text-red-600")}>
              {stats.priceChange >= 0 ? "+" : ""}
              {stats.priceChangePercent.toFixed(2)}%
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("chart.24h_high_low", "24h High/Low")}</p>
            <p className="text-sm font-mono">{formatPrice(stats.highPrice)}</p>
            <p className="text-sm font-mono text-muted-foreground">{formatPrice(stats.lowPrice)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("chart.volume_24h", "24h Volume")}</p>
            <p className="text-sm font-mono">{stats.totalVolume.toFixed(4)} ETH</p>
            <div className="flex gap-2 text-xs">
              <span className="text-green-600">
                Buy: {stats.totalVolume > 0 ? ((stats.buyVolume / stats.totalVolume) * 100).toFixed(0) : 0}%
              </span>
              <span className="text-red-600">
                Sell: {stats.totalVolume > 0 ? ((stats.sellVolume / stats.totalVolume) * 100).toFixed(0) : 0}%
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("chart.trades", "Trades")}</p>
            <p className="text-sm font-mono">{priceData.length}</p>
            <div className="flex gap-2 text-xs">
              <span className="text-green-600">Buys: {priceData.filter((p) => p.type === "buy").length}</span>
              <span className="text-red-600">Sells: {priceData.filter((p) => p.type === "sell").length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Chart Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <div className="flex border border-border rounded-md">
            <button
              onClick={() => setChartType("line")}
              className={cn(
                "px-3 py-1 text-sm transition-colors",
                chartType === "line" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {t("chart.line", "Line")}
            </button>
            <button
              onClick={() => setChartType("candle")}
              className={cn(
                "px-3 py-1 text-sm transition-colors",
                chartType === "candle" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {t("chart.candles", "Candles")}
            </button>
          </div>

          <div className="flex border border-border rounded-md">
            {(["5m", "1h", "4h", "1d"] as TimeInterval[]).map((interval) => (
              <button
                key={interval}
                onClick={() => setTimeInterval(interval)}
                className={cn(
                  "px-3 py-1 text-sm transition-colors",
                  timeInterval === interval ? "bg-primary text-primary-foreground" : "hover:bg-muted",
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
      <div ref={chartContainerRef} className="w-full h-[400px] border border-border rounded-md" />

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-500 rounded-sm" />
          <span>{t("chart.buy_dominant", "Buy Dominant")}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-500 rounded-sm" />
          <span>{t("chart.sell_dominant", "Sell Dominant")}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-[2px] bg-orange-500" />
          <span>{t("chart.price_trend", "Price Trend")}</span>
        </div>
      </div>
    </div>
  );
}
