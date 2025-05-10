import React, { useRef, useLayoutEffect, useEffect, useState, useMemo } from "react";
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
  LineSeriesOptions,
  LineSeries,
  HistogramSeries,
  HistogramSeriesOptions,
  Time,
  ChartOptions,
  LogicalRangeChangeEventHandler,
  MouseEventHandler,
  SeriesType,
  TimeRange,
  BarPrice,
  LineStyle,
  PriceLineOptions,
  DeepPartial
} from "lightweight-charts";
import { Spinner } from "@/components/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { 
  fetchPoolCandles, 
  fetchPoolPricePoints, 
  fetchPoolStatistics, 
  CandleData,
  PricePointData,
  TimeInterval,
  TIMEFRAME_OPTIONS,
  MarketStatistics
} from "./lib/indexer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Chart type options
type ChartType = 'candle' | 'line';

// Indicator options
interface IndicatorOption {
  id: string;
  name: string;
  enabled: boolean;
  settings: Record<string, any>;
}

// Chart controls props
interface ChartControlsProps {
  interval: TimeInterval;
  setInterval: (interval: TimeInterval) => void;
  chartType: ChartType;
  setChartType: (type: ChartType) => void;
  indicators: IndicatorOption[];
  toggleIndicator: (id: string) => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
}

// Chart statistics display
const ChartStatistics: React.FC<{ 
  stats: MarketStatistics | undefined, 
  isLoading: boolean,
  symbol: string 
}> = ({ stats, isLoading, symbol }) => {
  if (isLoading || !stats) {
    return <div className="flex items-center h-10 gap-2 text-sm text-gray-500">
      <Spinner size="sm" /> Loading statistics...
    </div>;
  }

  return (
    <div className="flex flex-wrap items-center gap-4 text-sm">
      <div>
        <span className="text-gray-500">Volume (24h):</span>
        <span className="ml-1 font-medium">{stats.volume24h.toFixed(4)} ETH</span>
        <span className={`ml-1 text-xs ${stats.volumeChange24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {stats.volumeChange24h >= 0 ? '↑' : '↓'} 
          {Math.abs(stats.volumeChange24h).toFixed(2)}%
        </span>
      </div>
      <div>
        <span className="text-gray-500">Liquidity:</span>
        <span className="ml-1 font-medium">{stats.liquidity.toFixed(4)} ETH</span>
      </div>
      <div>
        <span className="text-gray-500">Price Change (24h):</span>
        <span className={`ml-1 font-medium ${stats.priceChange24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {stats.priceChange24h >= 0 ? '+' : ''}
          {stats.priceChange24h.toFixed(2)}%
        </span>
      </div>
    </div>
  );
};

// Chart controls component
const ChartControls: React.FC<ChartControlsProps> = ({ 
  interval, 
  setInterval, 
  chartType, 
  setChartType, 
  indicators,
  toggleIndicator,
  isFullscreen,
  toggleFullscreen
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between mb-3 gap-2">
      {/* Left-side controls */}
      <div className="flex items-center gap-2">
        {/* Chart type toggle */}
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

        {/* Indicators dropdown (simplified for now) */}
        <div className="relative inline-block">
          <Button variant="outline" size="sm" className="h-7">
            Indicators
          </Button>
          {/* We'll add a dropdown menu here later */}
        </div>
      </div>

      {/* Right-side controls */}
      <div className="flex items-center gap-2">
        {/* Time interval selector */}
        <div className="flex bg-gray-100 rounded-md p-0.5">
          {TIMEFRAME_OPTIONS.map((option) => (
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

        {/* Fullscreen toggle */}
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-7 px-2" 
          onClick={toggleFullscreen}
        >
          {isFullscreen ? '⊖' : '⊕'}
        </Button>
      </div>
    </div>
  );
};

// Tooltip component
const Tooltip: React.FC<{ data?: any }> = ({ data }) => {
  if (!data) return null;
  
  return (
    <div className="absolute z-10 p-2 bg-white border rounded shadow-md">
      <div>
        <span className="text-gray-500">Open:</span>
        <span className="ml-1 font-medium">{data.open?.toFixed(8)}</span>
      </div>
      <div>
        <span className="text-gray-500">High:</span>
        <span className="ml-1 font-medium">{data.high?.toFixed(8)}</span>
      </div>
      <div>
        <span className="text-gray-500">Low:</span>
        <span className="ml-1 font-medium">{data.low?.toFixed(8)}</span>
      </div>
      <div>
        <span className="text-gray-500">Close:</span>
        <span className="ml-1 font-medium">{data.close?.toFixed(8)}</span>
      </div>
      {data.volume !== undefined && (
        <div>
          <span className="text-gray-500">Volume:</span>
          <span className="ml-1 font-medium">{data.volume?.toFixed(4)}</span>
        </div>
      )}
    </div>
  );
};

// Main chart component
interface UnifiedChartProps {
  poolId: string;
  symbol: string;
  className?: string;
}

const UnifiedChartComponent: React.FC<UnifiedChartProps> = ({ poolId, symbol, className }) => {
  // State
  const [chartType, setChartType] = useState<ChartType>('candle');
  const [interval, setInterval] = useState<TimeInterval>('1h');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredData, setHoveredData] = useState<any>(null);

  // Default indicators
  const defaultIndicators: IndicatorOption[] = [
    { id: 'ma20', name: 'MA (20)', enabled: false, settings: { period: 20, color: '#2962FF' } },
    { id: 'ma50', name: 'MA (50)', enabled: false, settings: { period: 50, color: '#FF6D00' } },
    { id: 'ma200', name: 'MA (200)', enabled: false, settings: { period: 200, color: '#8C1BFF' } },
    { id: 'rsi', name: 'RSI (14)', enabled: false, settings: { period: 14, overbought: 70, oversold: 30 } },
  ];
  
  const [indicators, setIndicators] = useState<IndicatorOption[]>(defaultIndicators);
  
  // Toggle indicator state
  const toggleIndicator = (id: string) => {
    setIndicators(prevIndicators => 
      prevIndicators.map(indicator => 
        indicator.id === id 
          ? { ...indicator, enabled: !indicator.enabled } 
          : indicator
      )
    );
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Fetch candle data
  const { 
    data: candleData, 
    isLoading: isLoadingCandles, 
    error: candleError 
  } = useQuery({
    queryKey: ['poolCandles', poolId, interval],
    queryFn: () => fetchPoolCandles(poolId, interval),
    staleTime: 30000, // 30 seconds
  });

  // Fetch price data (for line chart)
  const {
    data: priceData,
    isLoading: isLoadingPrices,
    error: priceError
  } = useQuery({
    queryKey: ['poolPricePoints', poolId],
    queryFn: () => fetchPoolPricePoints(poolId),
    staleTime: 30000, // 30 seconds
  });

  // Fetch pool statistics
  const {
    data: statsData,
    isLoading: isLoadingStats,
    error: statsError
  } = useQuery({
    queryKey: ['poolStatistics', poolId],
    queryFn: () => fetchPoolStatistics(poolId),
    staleTime: 60000, // 1 minute
  });

  // Check for errors
  useEffect(() => {
    if (candleError) console.error('Error fetching candle data:', candleError);
    if (priceError) console.error('Error fetching price data:', priceError);
    if (statsError) console.error('Error fetching stats data:', statsError);
  }, [candleError, priceError, statsError]);

  // Show loading state if both data sources are loading
  const isLoading = (chartType === 'candle' && isLoadingCandles) || 
                    (chartType === 'line' && isLoadingPrices);

  // Determine if we have valid data for the selected chart type
  const hasData = (chartType === 'candle' && candleData && candleData.length > 0) ||
                   (chartType === 'line' && priceData && priceData.length > 0);

  // Calculate height based on fullscreen state
  const chartHeight = isFullscreen ? 600 : 400;
  
  return (
    <div className={`w-full ${className || ''} ${isFullscreen ? 'fixed inset-0 z-50 bg-white p-4' : ''}`}>
      <Card className={`${isFullscreen ? 'h-full' : ''}`}>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-medium">{symbol}/ETH Chart</CardTitle>
            <ChartStatistics 
              stats={statsData} 
              isLoading={isLoadingStats} 
              symbol={symbol}
            />
          </div>
          <ChartControls 
            interval={interval}
            setInterval={setInterval}
            chartType={chartType}
            setChartType={setChartType}
            indicators={indicators}
            toggleIndicator={toggleIndicator}
            isFullscreen={isFullscreen}
            toggleFullscreen={toggleFullscreen}
          />
        </CardHeader>
        <CardContent className="p-0 relative">
          {isLoading ? (
            <div className="flex items-center justify-center" style={{ height: `${chartHeight}px` }}>
              <Spinner />
            </div>
          ) : !hasData ? (
            <div className="flex items-center justify-center text-gray-500" style={{ height: `${chartHeight}px` }}>
              No data available for the selected time interval.
            </div>
          ) : (
            <>
              {chartType === 'candle' && candleData && (
                <TVCandlestickChart 
                  data={candleData} 
                  indicators={indicators.filter(i => i.enabled)} 
                  height={chartHeight}
                  onHover={setHoveredData}
                />
              )}
              {chartType === 'line' && priceData && (
                <TVLineChart 
                  data={priceData} 
                  indicators={indicators.filter(i => i.enabled)} 
                  height={chartHeight}
                  ticker={symbol}
                  onHover={setHoveredData}
                />
              )}
              {hoveredData && <Tooltip data={hoveredData} />}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Calculate Moving Average
const calculateMA = (data: CandleData[], period: number): { time: number; value: number }[] => {
  const result: { time: number; value: number }[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      // Not enough data for this period yet
      continue;
    }
    
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    
    result.push({
      time: data[i].date,
      value: sum / period,
    });
  }
  
  return result;
};

// Calculate RSI (Relative Strength Index)
const calculateRSI = (data: CandleData[], period: number): { time: number; value: number }[] => {
  const result: { time: number; value: number }[] = [];
  if (data.length <= period) return result;
  
  // Calculate price changes
  const changes: number[] = [];
  for (let i = 1; i < data.length; i++) {
    changes.push(data[i].close - data[i-1].close);
  }
  
  // Calculate average gains and losses over the period
  for (let i = period; i < changes.length; i++) {
    let avgGain = 0;
    let avgLoss = 0;
    
    // Calculate first average gain and loss
    if (i === period) {
      for (let j = 0; j < period; j++) {
        if (changes[j] >= 0) avgGain += changes[j];
        else avgLoss += Math.abs(changes[j]);
      }
      avgGain /= period;
      avgLoss /= period;
    } 
    // Use smoothed method for subsequent calculations
    else {
      const previousGain = result[result.length - 1].value >= 50 
        ? (100 - result[result.length - 1].value) / result[result.length - 1].value 
        : 0;
      const previousLoss = result[result.length - 1].value < 50 
        ? result[result.length - 1].value / (100 - result[result.length - 1].value) 
        : 0;
      
      avgGain = (previousGain * (period - 1) + (changes[i-1] > 0 ? changes[i-1] : 0)) / period;
      avgLoss = (previousLoss * (period - 1) + (changes[i-1] < 0 ? Math.abs(changes[i-1]) : 0)) / period;
    }
    
    // Calculate RSI
    const rs = avgGain / (avgLoss || 1); // Avoid division by zero
    const rsi = 100 - (100 / (1 + rs));
    
    result.push({
      time: data[i].date,
      value: rsi,
    });
  }
  
  return result;
};

// Candlestick Chart Component
interface TVCandleChartProps {
  data: CandleData[];
  indicators: IndicatorOption[];
  height: number;
  onHover?: (data: any) => void;
}

const TVCandlestickChart: React.FC<TVCandleChartProps> = ({ data, indicators, height, onHover }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi>();
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'>>();
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'>>();
  const indicatorSeriesRefs = useRef<Record<string, ISeriesApi<'Line'>>>({});
  
  // Convert data for Trading View
  const chartData = useMemo(() => {
    return data.map(d => ({
      time: d.date as UTCTimestamp,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      value: d.close,
    }));
  }, [data]);
  
  // Volume data
  const volumeData = useMemo(() => {
    return data.map(d => ({
      time: d.date as UTCTimestamp,
      value: d.volume,
      color: d.close >= d.open ? 'rgba(76, 175, 80, 0.5)' : 'rgba(255, 82, 82, 0.5)',
    }));
  }, [data]);
  
  // Create and setup chart
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    
    // Create chart
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#333',
        attributionLogo: false,
      },
      width: containerRef.current.clientWidth,
      height,
      crosshair: { mode: CrosshairMode.Normal },
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
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      priceFormat: {
        type: 'price',
        precision: 8,
        minMove: 0.00000001,
      },
    });
    
    // Add volume series in a separate pane
    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume',
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });
    
    volumeSeriesRef.current = volumeSeries;
    
    // Add event listener for crosshair moves to update tooltip
    chart.subscribeCrosshairMove((param) => {
      if (param.point === undefined || !param.time || param.point.x < 0 || param.point.y < 0) {
        // Pointer is outside chart
        onHover && onHover(null);
        return;
      }
      
      // Get data under crosshair
      const dataAtTime = data.find(d => d.date === param.time);
      if (dataAtTime) {
        onHover && onHover(dataAtTime);
      }
    });
    
    // Responsive handling
    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = undefined;
      }
    };
  }, [height, onHover]);
  
  // Update data
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current || !volumeSeriesRef.current) return;
    
    candleSeriesRef.current.setData(chartData);
    volumeSeriesRef.current.setData(volumeData);
    
    // Auto-scale and fit content
    chartRef.current.timeScale().fitContent();
  }, [chartData, volumeData]);
  
  // Add/update indicators
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;
    
    // Create or update indicators
    indicators.forEach(indicator => {
      let series = indicatorSeriesRefs.current[indicator.id];
      
      if (!series) {
        // Create new indicator series
        series = chartRef.current!.addLineSeries({
          color: indicator.settings.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: indicator.name,
        });
        indicatorSeriesRefs.current[indicator.id] = series;
      }
      
      // Calculate and set indicator data
      if (indicator.id.startsWith('ma')) {
        const period = indicator.settings.period;
        const maData = calculateMA(data, period);
        series.setData(maData);
      } else if (indicator.id === 'rsi') {
        const period = indicator.settings.period;
        const rsiData = calculateRSI(data, period);
        
        // For RSI, use a separate price scale
        series.applyOptions({
          priceScaleId: 'rsi',
          scaleMargins: {
            top: 0.8,
            bottom: 0,
          },
        });
        
        series.setData(rsiData);
        
        // Add price lines for overbought/oversold levels
        series.createPriceLine({
          price: indicator.settings.overbought,
          color: 'red',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'Overbought',
        });
        
        series.createPriceLine({
          price: indicator.settings.oversold,
          color: 'green',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'Oversold',
        });
      }
    });
    
    // Remove indicators that are no longer enabled
    Object.keys(indicatorSeriesRefs.current).forEach(id => {
      if (!indicators.some(i => i.id === id)) {
        chartRef.current!.removeSeries(indicatorSeriesRefs.current[id]);
        delete indicatorSeriesRefs.current[id];
      }
    });
  }, [indicators, data]);
  
  return (
    <div 
      ref={containerRef} 
      className="w-full" 
      style={{ height: `${height}px` }}
    />
  );
};

// Line Chart Component
interface TVLineChartProps {
  data: PricePointData[];
  indicators: IndicatorOption[];
  height: number;
  ticker: string;
  onHover?: (data: any) => void;
}

const TVLineChart: React.FC<TVLineChartProps> = ({ data, indicators, height, ticker, onHover }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi>();
  const priceSeriesRef = useRef<ISeriesApi<'Line'>>();
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'>>();
  const indicatorSeriesRefs = useRef<Record<string, ISeriesApi<'Line'>>>({});
  
  // Convert data for Trading View
  const chartData = useMemo(() => {
    return data.map(d => ({
      time: d.timestamp as UTCTimestamp,
      value: d.price1,
    }));
  }, [data]);
  
  // Create and setup chart
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    
    // Create chart
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#333',
        attributionLogo: false,
      },
      width: containerRef.current.clientWidth,
      height,
      crosshair: { mode: CrosshairMode.Normal },
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
    
    // Add price series
    priceSeriesRef.current = chart.addLineSeries({
      color: '#2962FF',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      title: `ETH / ${ticker}`,
      priceFormat: {
        type: 'price',
        precision: 8,
        minMove: 0.00000001,
      },
    });
    
    // Add event listener for crosshair moves to update tooltip
    chart.subscribeCrosshairMove((param) => {
      if (param.point === undefined || !param.time || param.point.x < 0 || param.point.y < 0) {
        // Pointer is outside chart
        onHover && onHover(null);
        return;
      }
      
      // Find closest data point
      const timeStr = param.time.toString();
      const dataPoint = data.find(d => d.timestamp.toString() === timeStr);
      
      if (dataPoint) {
        // Convert line data to format compatible with tooltip
        onHover && onHover({
          open: dataPoint.price1,
          high: dataPoint.price1,
          low: dataPoint.price1,
          close: dataPoint.price1,
        });
      }
    });
    
    // Responsive handling
    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = undefined;
      }
    };
  }, [height, ticker, onHover]);
  
  // Update data
  useEffect(() => {
    if (!chartRef.current || !priceSeriesRef.current) return;
    
    // Sort data by timestamp (ascending)
    const sortedData = [...chartData].sort((a, b) => 
      (a.time as number) - (b.time as number)
    );
    
    priceSeriesRef.current.setData(sortedData);
    
    // Auto-scale and fit content
    chartRef.current.timeScale().fitContent();
  }, [chartData]);
  
  return (
    <div 
      ref={containerRef} 
      className="w-full" 
      style={{ height: `${height}px` }}
    />
  );
};

export default UnifiedChartComponent;