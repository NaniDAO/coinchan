import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { formatEther } from "viem";
import {
  createChart,
  type IChartApi,
  ColorType,
  type UTCTimestamp,
  type CandlestickData,
  CandlestickSeries,
  HistogramSeries,
} from "lightweight-charts";
import { useTheme } from "@/lib/theme";
import type { ZCurveSale, ZCurvePurchase, ZCurveSell } from "@/hooks/use-zcurve-sale";
import { useZCurvePurchases, useZCurveSells } from "@/hooks/use-zcurve-sale";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ZCurveCandlestickChartProps {
  sale: ZCurveSale;
  onIntervalChange?: (interval: string) => void;
}

type TimeInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

interface TradeEvent {
  timestamp: number;
  price: number;
  volume: number;
  isBuy: boolean;
  ethAmount: number;
  tokenAmount: number;
}

interface OHLCVData {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
}

// Helper to calculate price from trade event
const calculatePriceFromTrade = (ethAmount: string, tokenAmount: string): number => {
  const eth = BigInt(ethAmount);
  const tokens = BigInt(tokenAmount);
  if (tokens === 0n) return 0;
  // Price in ETH per token
  return Number(formatEther((eth * BigInt(1e18)) / tokens));
};

// Helper to aggregate trades into OHLCV candles
const aggregateTradesToCandles = (trades: TradeEvent[], interval: TimeInterval, startTime?: number): OHLCVData[] => {
  if (trades.length === 0) return [];

  const intervalMs = {
    "1m": 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
  }[interval];

  // Sort trades by timestamp
  const sortedTrades = [...trades].sort((a, b) => a.timestamp - b.timestamp);

  // Find the earliest trade time or use startTime
  const firstTradeTime = startTime || sortedTrades[0].timestamp;
  const currentTime = Date.now();

  // Generate candle buckets
  const candles = new Map<number, OHLCVData>();

  // Initialize empty candles from first trade to current time
  for (let time = Math.floor(firstTradeTime / intervalMs) * intervalMs; time <= currentTime; time += intervalMs) {
    const candleTime = Math.floor(time / 1000) as UTCTimestamp;
    candles.set(time, {
      time: candleTime,
      open: 0,
      high: 0,
      low: 0,
      close: 0,
      volume: 0,
      buyVolume: 0,
      sellVolume: 0,
    });
  }

  // Aggregate trades into candles
  sortedTrades.forEach((trade) => {
    const bucketTime = Math.floor(trade.timestamp / intervalMs) * intervalMs;
    const candle = candles.get(bucketTime);

    if (!candle) return;

    // Update OHLC
    if (candle.open === 0) {
      candle.open = trade.price;
      candle.high = trade.price;
      candle.low = trade.price;
    } else {
      candle.high = Math.max(candle.high, trade.price);
      candle.low = Math.min(candle.low, trade.price);
    }
    candle.close = trade.price;

    // Update volume
    candle.volume += trade.volume;
    if (trade.isBuy) {
      candle.buyVolume += trade.volume;
    } else {
      candle.sellVolume += trade.volume;
    }
  });

  // Convert to array and fill empty candles with previous close
  const candleArray = Array.from(candles.values()).sort((a, b) => a.time - b.time);

  let lastClose = 0;
  candleArray.forEach((candle) => {
    if (candle.open === 0 && lastClose > 0) {
      candle.open = lastClose;
      candle.high = lastClose;
      candle.low = lastClose;
      candle.close = lastClose;
    }
    if (candle.close > 0) {
      lastClose = candle.close;
    }
  });

  return candleArray;
};

export function ZCurveCandlestickChart({ sale, onIntervalChange }: ZCurveCandlestickChartProps) {
  const { t } = useTranslation();
  const { theme: appTheme } = useTheme();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [interval, setInterval] = useState<TimeInterval>("5m");
  const [hoveredCandle, setHoveredCandle] = useState<CandlestickData | null>(null);

  // Fetch trade data - increase limit for better candle generation
  const { data: purchases } = useZCurvePurchases(sale.coinId, 1000);
  const { data: sells } = useZCurveSells(sale.coinId, 1000);

  // Combine and process trade events
  const tradeEvents = useMemo((): TradeEvent[] => {
    const events: TradeEvent[] = [];

    // Process purchases
    if (purchases) {
      purchases.forEach((purchase: ZCurvePurchase) => {
        events.push({
          timestamp: Number(purchase.timestamp) * 1000,
          price: calculatePriceFromTrade(purchase.ethIn, purchase.coinsOut),
          volume: Number(formatEther(BigInt(purchase.ethIn))),
          isBuy: true,
          ethAmount: Number(formatEther(BigInt(purchase.ethIn))),
          tokenAmount: Number(formatEther(BigInt(purchase.coinsOut))),
        });
      });
    }

    // Process sells
    if (sells) {
      sells.forEach((sell: ZCurveSell) => {
        events.push({
          timestamp: Number(sell.timestamp) * 1000,
          price: calculatePriceFromTrade(sell.ethOut, sell.coinsIn),
          volume: Number(formatEther(BigInt(sell.ethOut))),
          isBuy: false,
          ethAmount: Number(formatEther(BigInt(sell.ethOut))),
          tokenAmount: Number(formatEther(BigInt(sell.coinsIn))),
        });
      });
    }

    return events.sort((a, b) => a.timestamp - b.timestamp);
  }, [purchases, sells]);

  // Generate OHLCV data
  const ohlcvData = useMemo(() => {
    // Use sale creation time as start if available
    const startTime = sale.createdAt ? Number(sale.createdAt) * 1000 : undefined;
    return aggregateTradesToCandles(tradeEvents, interval, startTime);
  }, [tradeEvents, interval, sale.createdAt]);

  // Calculate current stats
  const currentStats = useMemo(() => {
    if (ohlcvData.length === 0) return null;

    const lastCandle = ohlcvData[ohlcvData.length - 1];

    // Find first candle with actual trades
    const firstNonEmptyCandle = ohlcvData.find((c) => c.volume > 0);
    const openPrice = firstNonEmptyCandle?.open || 0;
    const currentPrice = lastCandle.close || lastCandle.open;

    const priceChange = openPrice > 0 ? ((currentPrice - openPrice) / openPrice) * 100 : 0;
    const totalVolume = ohlcvData.reduce((sum, candle) => sum + candle.volume, 0);

    // 24h stats
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const last24hCandles = ohlcvData.filter((c) => c.time * 1000 >= oneDayAgo);
    const volume24h = last24hCandles.reduce((sum, candle) => sum + candle.volume, 0);

    return {
      currentPrice,
      priceChange,
      totalVolume,
      volume24h,
      high24h: Math.max(...last24hCandles.map((c) => c.high).filter((h) => h > 0), 0),
      low24h: Math.min(...last24hCandles.map((c) => c.low).filter((l) => l > 0), currentPrice),
    };
  }, [ohlcvData]);

  // Theme configuration
  const theme = {
    backgroundColor: appTheme === "dark" ? "#0a0a0a" : "#ffffff",
    textColor: appTheme === "dark" ? "#e5e5e5" : "#171717",
    gridColor: appTheme === "dark" ? "#262626" : "#f5f5f5",
    borderColor: appTheme === "dark" ? "#404040" : "#e5e5e5",
    upColor: "#10b981",
    downColor: "#ef4444",
    volumeUpColor: "rgba(16, 185, 129, 0.5)",
    volumeDownColor: "rgba(239, 68, 68, 0.5)",
  };

  useEffect(() => {
    if (!chartContainerRef.current || ohlcvData.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 500,
      layout: {
        background: { type: ColorType.Solid, color: theme.backgroundColor },
        textColor: theme.textColor,
        fontSize: 12,
        fontFamily: "'Inter', system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: theme.gridColor, style: 1 },
        horzLines: { color: theme.gridColor, style: 1 },
      },
      rightPriceScale: {
        borderColor: theme.borderColor,
        borderVisible: false,
        scaleMargins: {
          top: 0.1,
          bottom: 0.25,
        },
      },
      timeScale: {
        borderColor: theme.borderColor,
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 1,
        horzLine: {
          visible: true,
          labelBackgroundColor: appTheme === "dark" ? "#1a1a1a" : "#f5f5f5",
          style: 3,
          width: 1,
          color: theme.gridColor,
        },
        vertLine: {
          visible: true,
          labelBackgroundColor: appTheme === "dark" ? "#1a1a1a" : "#f5f5f5",
          style: 3,
          width: 1,
          color: theme.gridColor,
        },
      },
    });

    chartRef.current = chart;

    // Add candlestick series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: theme.upColor,
      downColor: theme.downColor,
      borderDownColor: theme.downColor,
      borderUpColor: theme.upColor,
      wickDownColor: theme.downColor,
      wickUpColor: theme.upColor,
    });

    // Filter out empty candles for display
    const candleData = ohlcvData
      .filter((candle) => candle.volume > 0 || candle.close > 0)
      .map((candle) => ({
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      }));

    candlestickSeries.setData(candleData);

    // Add volume series using histogram
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "",
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    const volumeData = ohlcvData.map((candle) => ({
      time: candle.time,
      value: candle.volume,
      color: candle.close >= candle.open ? theme.volumeUpColor : theme.volumeDownColor,
    }));

    volumeSeries.setData(volumeData);

    // Subscribe to crosshair move
    chart.subscribeCrosshairMove((param) => {
      if (param.time && param.seriesData.has(candlestickSeries)) {
        const data = param.seriesData.get(candlestickSeries) as CandlestickData;
        setHoveredCandle(data);
      } else {
        setHoveredCandle(null);
      }
    });

    chart.timeScale().fitContent();

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chart) {
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
  }, [ohlcvData, appTheme, theme]);

  const handleIntervalChange = useCallback(
    (newInterval: TimeInterval) => {
      setInterval(newInterval);
      onIntervalChange?.(newInterval);
    },
    [onIntervalChange],
  );

  const formatPrice = (price: number): string => {
    if (price === 0) return "0";
    if (price < 0.0001) return price.toExponential(2);
    if (price < 1) return price.toFixed(6);
    return price.toFixed(4);
  };

  const formatVolume = (volume: number): string => {
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(2)}M`;
    if (volume >= 1000) return `${(volume / 1000).toFixed(2)}K`;
    return volume.toFixed(2);
  };

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-2xl font-bold">
                {currentStats ? formatPrice(currentStats.currentPrice) : "—"} ETH
              </div>
              <div
                className={cn(
                  "flex items-center gap-1 text-sm",
                  currentStats && currentStats.priceChange >= 0 ? "text-green-500" : "text-red-500",
                )}
              >
                {currentStats && currentStats.priceChange >= 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : currentStats && currentStats.priceChange < 0 ? (
                  <TrendingDown className="h-4 w-4" />
                ) : (
                  <Minus className="h-4 w-4" />
                )}
                <span>
                  {currentStats
                    ? `${currentStats.priceChange >= 0 ? "+" : ""}${currentStats.priceChange.toFixed(2)}%`
                    : "—"}
                </span>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div>
                <span className="text-xs">24h Vol</span>
                <div className="font-medium text-foreground">
                  {currentStats ? `${formatVolume(currentStats.volume24h)} ETH` : "—"}
                </div>
              </div>
              <div>
                <span className="text-xs">24h High</span>
                <div className="font-medium text-foreground">
                  {currentStats && currentStats.high24h > 0 ? formatPrice(currentStats.high24h) : "—"}
                </div>
              </div>
              <div>
                <span className="text-xs">24h Low</span>
                <div className="font-medium text-foreground">
                  {currentStats && currentStats.low24h > 0 ? formatPrice(currentStats.low24h) : "—"}
                </div>
              </div>
            </div>
          </div>

          {/* Interval selector */}
          <div className="flex items-center gap-1 border border-border rounded-md p-1">
            {(["1m", "5m", "15m", "1h", "4h", "1d"] as TimeInterval[]).map((int) => (
              <Button
                key={int}
                variant={interval === int ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleIntervalChange(int)}
              >
                {int}
              </Button>
            ))}
          </div>
        </div>

        {/* Hovered candle info */}
        {hoveredCandle && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              O: <span className="text-foreground">{formatPrice(hoveredCandle.open)}</span>
            </span>
            <span>
              H: <span className="text-foreground">{formatPrice(hoveredCandle.high)}</span>
            </span>
            <span>
              L: <span className="text-foreground">{formatPrice(hoveredCandle.low)}</span>
            </span>
            <span>
              C: <span className="text-foreground">{formatPrice(hoveredCandle.close)}</span>
            </span>
            {ohlcvData.find((c) => c.time === hoveredCandle.time) && (
              <span>
                V:{" "}
                <span className="text-foreground">
                  {formatVolume(ohlcvData.find((c) => c.time === hoveredCandle.time)!.volume)} ETH
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Chart */}
      <div
        ref={chartContainerRef}
        className="w-full h-[500px] bg-background border border-border rounded-lg"
        style={{ position: "relative" }}
      >
        {tradeEvents.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            {t("chart.no_trades", "No trades yet")}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500 rounded-sm" />
            <span>{t("chart.price_up", "Price Up")}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500 rounded-sm" />
            <span>{t("chart.price_down", "Price Down")}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-12 h-2 bg-gradient-to-r from-green-500/50 to-red-500/50 rounded-sm" />
            <span>{t("chart.volume", "Volume")}</span>
          </div>
        </div>
        <div className="text-muted-foreground">
          {t("chart.trades_count", "{{count}} trades", { count: tradeEvents.length })}
        </div>
      </div>
    </div>
  );
}
