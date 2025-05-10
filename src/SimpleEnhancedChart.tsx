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

// Chart type options
type ChartType = 'candle' | 'line';

// Main chart component
export default function SimpleEnhancedChart({
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
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // State
  const [chartType, setChartType] = useState<ChartType>('candle');
  const [interval, setInterval] = useState<TimeInterval>('1h');
  const [showDebug, setShowDebug] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  // Get indexer URL from environment
  const indexerUrl = typeof window !== 'undefined'
    ? (window as any).ENV_INDEXER_URL || import.meta.env.VITE_INDEXER_URL
    : 'unknown';

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
        const data = await fetchPoolCandles(poolId, interval);
        console.log(`Got ${data?.length || 0} candle data points`);
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

  // Initialize and update chart when data changes
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        const { clientWidth, clientHeight } = chartContainerRef.current;
        chartRef.current.resize(clientWidth, clientHeight);
        chartRef.current.timeScale().fitContent();
      }
    };

    // Function to clean up chart resources
    const cleanupChart = () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    };

    // Cleanup previous chart
    cleanupChart();

    // Create chart
    const container = chartContainerRef.current;
    const chart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#333',
      },
      grid: {
        vertLines: { color: '#f3f4f6' },
        horzLines: { color: '#f3f4f6' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // Create resize observer
    resizeObserverRef.current = new ResizeObserver(entries => {
      if (entries.length === 0) return;
      handleResize();
    });
    
    resizeObserverRef.current.observe(container);

    // Render data based on chart type
    try {
      if (chartType === 'candle' && candleData && candleData.length > 0) {
        // Create candlestick series
        const series = chart.addCandlestickSeries({
          upColor: '#26a69a',
          downColor: '#ef5350',
          borderVisible: false,
          wickUpColor: '#26a69a',
          wickDownColor: '#ef5350',
        });

        // Format data for chart
        const formattedData = candleData.map(d => ({
          time: Math.floor(d.date / 1000),
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        }));

        series.setData(formattedData);
        chart.timeScale().fitContent();
      } else if (chartType === 'line' && priceData && priceData.length > 0) {
        // Create line series
        const series = chart.addLineSeries({
          color: '#2962FF',
          lineWidth: 2,
        });

        // Format data for chart
        const formattedData = priceData.map(d => ({
          time: Math.floor(d.timestamp / 1000),
          value: d.price1,
        }));

        series.setData(formattedData);
        chart.timeScale().fitContent();
      }
    } catch (error) {
      console.error('Error rendering chart:', error);
    }

    // Cleanup on unmount
    return () => {
      cleanupChart();
    };
  }, [chartType, candleData, priceData]);

  // Show loading state if data is loading
  const isLoading = (chartType === 'candle' && isLoadingCandles) ||
                    (chartType === 'line' && isLoadingPrices);

  // Check for errors
  const hasError = Boolean(candleError || priceError);

  // Determine if we have valid data for the selected chart type
  const hasData = (chartType === 'candle' && candleData && candleData.length > 0) ||
                  (chartType === 'line' && priceData && priceData.length > 0);

  // Display available timeframes
  const displayIntervals = TIMEFRAME_OPTIONS
    .filter(option => ["1m", "5m", "15m", "1h", "4h", "1d"].includes(option.value))
    .sort((a, b) => {
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
                  onClick={() => setInterval(option.value)}
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
            <div className="flex items-center justify-center h-64 text-gray-500">
              No data available for the selected time interval.
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg h-[350px] p-0">
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
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}