import { useState, useEffect, useRef } from "react";
import { Spinner } from "@/components/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { 
  fetchPoolCandles, 
  fetchPoolPricePoints, 
  TimeInterval, 
  TIMEFRAME_OPTIONS
} from "./lib/indexer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import * as LightweightCharts from "lightweight-charts";
import { calculateSMA, calculateEMA } from "./lib/chart-indicators";

// Chart type options
type ChartType = 'candle' | 'line';

// State for technical indicators
interface IndicatorSettings {
  showSMA: boolean;
  smaPeriod: number;
  showEMA: boolean;
  emaPeriod: number;
}

// Main chart component
export default function EnhancedChart({
  poolId,
  symbol,
  className = ""
}: {
  poolId: string;
  symbol: string;
  className?: string;
}) {
  // DOM references
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any[]>([]);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // State
  const [chartType, setChartType] = useState<ChartType>('candle');
  const [interval, setInterval] = useState<TimeInterval>('1h');
  const [showDebug, setShowDebug] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [indicators, setIndicators] = useState<IndicatorSettings>({
    showSMA: false,
    smaPeriod: 20,
    showEMA: false,
    emaPeriod: 9
  });

  // Get indexer URL from environment
  const indexerUrl = typeof window !== 'undefined'
    ? (window as any).ENV_INDEXER_URL || import.meta.env.VITE_INDEXER_URL
    : 'unknown';

  // State for fallback interval
  const [usingFallbackInterval, setUsingFallbackInterval] = useState<TimeInterval | null>(null);

  // Fetch candle data
  const {
    data: candleData,
    isLoading: isLoadingCandles,
    error: candleError,
    refetch: refetchCandles,
  } = useQuery({
    queryKey: ['poolCandles', poolId, interval],
    queryFn: async () => {
      try {
        console.log(`Fetching candles for pool ${poolId} with interval ${interval}`);
        let data = await fetchPoolCandles(poolId, interval);
        console.log(`Got ${data?.length || 0} candle data points for interval ${interval}`);

        // If no data for the selected interval, try a different one
        if (data.length === 0) {
          // Fallback intervals in order of preference
          const fallbackIntervals: TimeInterval[] = ['1d', '4h', '1h', '15m'];

          for (const fallbackInterval of fallbackIntervals) {
            if (fallbackInterval !== interval) {
              console.log(`Trying fallback interval ${fallbackInterval}`);
              data = await fetchPoolCandles(poolId, fallbackInterval);
              if (data.length > 0) {
                console.log(`Found ${data.length} candles with fallback interval ${fallbackInterval}`);
                setUsingFallbackInterval(fallbackInterval);
                break;
              }
            }
          }
        }

        return data;
      } catch (error) {
        console.error('Error fetching candle data:', error);
        setErrorDetails(JSON.stringify(error, null, 2));
        throw error;
      }
    },
    staleTime: 30000, // 30 seconds
    retry: 1,
  });

  // Fetch price data (for line chart)
  const {
    data: priceData,
    isLoading: isLoadingPrices,
    error: priceError,
    refetch: refetchPrices,
  } = useQuery({
    queryKey: ['poolPricePoints', poolId],
    queryFn: async () => {
      try {
        console.log(`Fetching price points for pool ${poolId}`);
        const data = await fetchPoolPricePoints(poolId);
        console.log(`Got ${data?.length || 0} price data points`);
        return data;
      } catch (error) {
        console.error('Error fetching price data:', error);
        setErrorDetails(JSON.stringify(error, null, 2));
        throw error;
      }
    },
    staleTime: 30000, // 30 seconds
    retry: 1,
  });

  // Track error state
  useEffect(() => {
    if (candleError || priceError) {
      const error = candleError || priceError;
      console.error('Chart data fetching error:', error);
      setErrorDetails(error instanceof Error
        ? error.message
        : JSON.stringify(error, null, 2));
    } else {
      setErrorDetails(null);
    }
  }, [candleError, priceError]);

  // Initialize and clean up chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Clean up previous chart instance if it exists
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = chartContainerRef.current;
    const chart = LightweightCharts.createChart(container, {
      layout: {
        background: { color: '#ffffff' },
        textColor: '#333',
      },
      width: container.clientWidth,
      height: 350,
      crosshair: {
        mode: 1, // CrosshairMode.Normal
      },
      timeScale: {
        borderColor: '#d1d5db',
        timeVisible: true,
        secondsVisible: false,
      },
      grid: {
        vertLines: {
          color: '#f3f4f6',
        },
        horzLines: {
          color: '#f3f4f6',
        },
      },
      rightPriceScale: {
        borderColor: '#d1d5db',
        scaleMargins: {
          top: 0.1,
          bottom: 0.2, // Leave space for volume bars
        },
      },
    });

    chartRef.current = chart;

    // Create a resize observer to handle container resizing
    resizeObserverRef.current = new ResizeObserver(entries => {
      if (entries.length === 0 || !chartRef.current) return;
      
      const { width, height } = entries[0].contentRect;
      chartRef.current.resize(width, height > 100 ? height : 350);
      chartRef.current.timeScale().fitContent();
    });

    resizeObserverRef.current.observe(container);

    return () => {
      // Clean up resources
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  // Update chart data when it changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Clear previous series
    seriesRef.current.forEach(series => {
      chart.removeSeries(series);
    });
    seriesRef.current = [];

    // Update chart with appropriate data
    if (chartType === 'candle' && candleData && candleData.length > 0) {
      try {
        // Create main candle series
        const candleSeries = chart.addCandlestickSeries({
          upColor: '#26a69a',
          downColor: '#ef5350',
          borderVisible: false,
          wickUpColor: '#26a69a',
          wickDownColor: '#ef5350',
        });
        
        seriesRef.current.push(candleSeries);
        
        // Map to the format expected by lightweight-charts
        const mappedData = candleData.map((d) => ({
          time: Math.floor(d.date / 1000),
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        }));
        
        candleSeries.setData(mappedData);

        // Try to add volume series if possible
        try {
          const volumeSeries = chart.addHistogramSeries({
            color: '#26a69a',
            priceScaleId: 'volume',
            scaleMargins: {
              top: 0.8, // Place it at the bottom
              bottom: 0,
            },
          });
          
          seriesRef.current.push(volumeSeries);
          
          // Map volume data
          const volumeData = candleData.map((d) => ({
            time: Math.floor(d.date / 1000),
            value: d.volume,
            color: d.close >= d.open ? '#26a69a80' : '#ef535080', // Semi-transparent colors based on price direction
          }));
          
          volumeSeries.setData(volumeData);
        } catch (e) {
          console.error('Failed to add volume series:', e);
        }

        // Add indicators if enabled
        if (indicators.showSMA) {
          try {
            const smaData = calculateSMA(candleData, indicators.smaPeriod);
            const smaSeries = chart.addLineSeries({
              color: '#2962FF',
              lineWidth: 2,
              title: `SMA(${indicators.smaPeriod})`,
            });
            
            seriesRef.current.push(smaSeries);
            
            smaSeries.setData(smaData.map(d => ({
              time: Math.floor(d.time / 1000),
              value: d.value,
            })));
          } catch (e) {
            console.error('Failed to add SMA:', e);
          }
        }
        
        if (indicators.showEMA) {
          try {
            const emaData = calculateEMA(candleData, indicators.emaPeriod);
            const emaSeries = chart.addLineSeries({
              color: '#FF6D00',
              lineWidth: 2,
              title: `EMA(${indicators.emaPeriod})`,
            });
            
            seriesRef.current.push(emaSeries);
            
            emaSeries.setData(emaData.map(d => ({
              time: Math.floor(d.time / 1000),
              value: d.value,
            })));
          } catch (e) {
            console.error('Failed to add EMA:', e);
          }
        }

        // Fit to view all data
        chart.timeScale().fitContent();
      } catch (e) {
        console.error('Error updating chart:', e);
      }
    } else if (chartType === 'line' && priceData && priceData.length > 0) {
      try {
        // Create line series for price data
        const lineSeries = chart.addLineSeries({
          color: '#2962FF',
          lineWidth: 2,
        });
        
        seriesRef.current.push(lineSeries);
        
        // Map to the format expected by lightweight-charts
        const mappedData = priceData.map((d) => ({
          time: Math.floor(d.timestamp / 1000),
          value: d.price1,
        }));
        
        lineSeries.setData(mappedData);
        
        // Fit to view all data
        chart.timeScale().fitContent();
      } catch (e) {
        console.error('Error updating chart:', e);
      }
    }
  }, [chartType, candleData, priceData, indicators]);

  // Show loading state if both data sources are loading
  const isLoading = (chartType === 'candle' && isLoadingCandles) ||
                    (chartType === 'line' && isLoadingPrices);

  // Check for errors
  const hasError = Boolean(candleError || priceError);

  // Determine if we have valid data for the selected chart type
  const hasData = (chartType === 'candle' && candleData && candleData.length > 0) ||
                  (chartType === 'line' && priceData && priceData.length > 0);

  // Display available timeframes - filter from available options
  const displayIntervals = TIMEFRAME_OPTIONS
    .filter(option => ["1m", "5m", "15m", "1h", "4h", "1d"].includes(option.value))
    .sort((a, b) => {
      // Custom sort to ensure proper ordering
      const order: Record<string, number> = {
        "1m": 1, "5m": 2, "15m": 3, "30m": 4, "1h": 5, "4h": 6, "12h": 7, "1d": 8, "1w": 9
      };
      return order[a.value] - order[b.value];
    });

  // Handle retry
  const handleRetry = () => {
    if (chartType === 'candle') {
      refetchCandles();
    } else {
      refetchPrices();
    }
    setErrorDetails(null);
  };

  // Toggle SMA indicator
  const toggleSMA = () => {
    setIndicators(prev => ({
      ...prev,
      showSMA: !prev.showSMA
    }));
  };

  // Toggle EMA indicator
  const toggleEMA = () => {
    setIndicators(prev => ({
      ...prev,
      showEMA: !prev.showEMA
    }));
  };

  return (
    <div className={`w-full ${className}`}>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg font-medium">{symbol}/ETH Chart</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDebug(!showDebug)}
              className="h-7 px-2 text-xs"
            >
              {showDebug ? 'Hide Debug' : 'Debug'}
            </Button>
          </div>

          {/* Chart controls */}
          <div className="flex flex-wrap items-center justify-between gap-y-2">
            <Tabs
              value={chartType}
              onValueChange={(value) => setChartType(value as ChartType)}
              className="h-8"
            >
              <TabsList className="h-8">
                <TabsTrigger value="candle" className="h-7 px-3 py-1">Candle</TabsTrigger>
                <TabsTrigger value="line" className="h-7 px-3 py-1">Line</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap bg-gray-100 rounded-md p-0.5 space-x-0.5">
              {displayIntervals.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setInterval(option.value);
                    setUsingFallbackInterval(null); // Reset fallback when changing interval
                  }}
                  className={`px-2 py-0.5 text-xs rounded ${
                    interval === option.value
                      ? 'bg-white shadow-sm text-black'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Indicator controls - visible only when we have data */}
          {(hasData && chartType === 'candle') && (
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={toggleSMA}
                  className={`px-2 py-0.5 text-xs rounded ${
                    indicators.showSMA
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  SMA({indicators.smaPeriod})
                </button>
                <button
                  onClick={toggleEMA}
                  className={`px-2 py-0.5 text-xs rounded ${
                    indicators.showEMA
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  EMA({indicators.emaPeriod})
                </button>
              </div>
              {usingFallbackInterval && (
                <div className="text-xs text-amber-600">
                  <span className="font-medium">Note:</span> Using {usingFallbackInterval} interval data (no data available for {interval})
                </div>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className="p-4 relative">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Spinner className="mr-2" />
              <span>Loading {chartType === 'candle' ? 'candle' : 'price'} data...</span>
            </div>
          ) : hasError ? (
            <div className="flex flex-col items-center justify-center h-64 text-red-500 p-4">
              <p className="mb-4">Error loading chart data</p>
              <Button variant="outline" onClick={handleRetry}>
                Retry
              </Button>
              {showDebug && errorDetails && (
                <div className="mt-4 p-2 bg-gray-100 rounded-md text-xs max-h-40 overflow-auto w-full">
                  <pre>{errorDetails}</pre>
                </div>
              )}
            </div>
          ) : !hasData ? (
            <div className="flex flex-col items-center justify-center h-64 bg-gray-50 rounded-lg">
              <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4 rounded shadow-sm">
                <p className="font-bold">No data available from API</p>
                <p>The indexing service is not returning data for this token. Please try again later or contact support if this persists.</p>
              </div>
              <Button variant="outline" onClick={handleRetry} className="mt-2">
                Retry
              </Button>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg h-[350px] p-0">
              {/* The actual chart container */}
              <div ref={chartContainerRef} className="w-full h-full" />
            </div>
          )}

          {showDebug && (
            <div className="mt-4 bg-gray-50 p-4 rounded-lg text-xs">
              <p className="font-medium mb-2">Debug Information:</p>
              <dl className="grid grid-cols-2 gap-1">
                <dt className="text-gray-600">Pool ID:</dt>
                <dd>{poolId}</dd>
                <dt className="text-gray-600">Symbol:</dt>
                <dd>{symbol}</dd>
                <dt className="text-gray-600">Chart Type:</dt>
                <dd>{chartType}</dd>
                <dt className="text-gray-600">Interval:</dt>
                <dd>{interval}</dd>
                <dt className="text-gray-600">Indexer URL:</dt>
                <dd className="break-all">{indexerUrl || 'Not defined'}</dd>
                <dt className="text-gray-600">Data Points:</dt>
                <dd>
                  {chartType === 'candle' 
                    ? `${candleData?.length || 0} candles` 
                    : `${priceData?.length || 0} prices`}
                </dd>
              </dl>

              {/* Display data sample if available */}
              {chartType === 'candle' && candleData && candleData.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium">Latest Candle:</p>
                  <div className="bg-white p-2 rounded mt-1 overflow-auto max-h-28">
                    <pre>{JSON.stringify(candleData[candleData.length - 1], null, 2)}</pre>
                  </div>
                </div>
              )}
              
              {chartType === 'line' && priceData && priceData.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium">Latest Price Point:</p>
                  <div className="bg-white p-2 rounded mt-1 overflow-auto max-h-28">
                    <pre>{JSON.stringify(priceData[0], null, 2)}</pre>
                  </div>
                  <p className="text-sm text-blue-600 mt-2">
                    Note: price1 = {priceData[0].price1.toFixed(8)} ETH (${(priceData[0].price1 * 3000).toFixed(2)} at $3000/ETH)
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}