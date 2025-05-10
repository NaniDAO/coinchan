import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { fetchPoolCandles, fetchPoolPricePoints, TimeInterval } from "./lib/indexer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Chart type options
type ChartType = 'candle' | 'line';

// Main chart component - temporary minimal version without actual chart rendering
export default function MinimalChart({ 
  poolId, 
  symbol
}: { 
  poolId: string;
  symbol: string;
  className?: string;
}) {
  // State
  const [chartType, setChartType] = useState<ChartType>('candle');
  const [interval, setInterval] = useState<TimeInterval>('1h');

  // Fetch candle data
  const { 
    data: candleData, 
    isLoading: isLoadingCandles 
  } = useQuery({
    queryKey: ['poolCandles', poolId, interval],
    queryFn: () => fetchPoolCandles(poolId, interval),
    staleTime: 30000, // 30 seconds
  });

  // Fetch price data (for line chart)
  const {
    data: priceData,
    isLoading: isLoadingPrices
  } = useQuery({
    queryKey: ['poolPricePoints', poolId],
    queryFn: () => fetchPoolPricePoints(poolId),
    staleTime: 30000, // 30 seconds
  });

  // Show loading state if both data sources are loading
  const isLoading = (chartType === 'candle' && isLoadingCandles) || 
                    (chartType === 'line' && isLoadingPrices);

  // Determine if we have valid data for the selected chart type
  const hasData = (chartType === 'candle' && candleData && candleData.length > 0) ||
                  (chartType === 'line' && priceData && priceData.length > 0);
  
  // Display available timeframes
  const displayIntervals: TimeInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
  
  return (
    <div className="w-full">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg font-medium">{symbol}/ETH Chart</CardTitle>
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
            
            <div className="flex bg-gray-100 rounded-md p-0.5 space-x-0.5">
              {displayIntervals.map((option) => (
                <button
                  key={option}
                  onClick={() => setInterval(option)}
                  className={`px-2 py-0.5 text-xs rounded ${
                    interval === option
                      ? 'bg-white shadow-sm text-black'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-4 relative">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Spinner />
            </div>
          ) : !hasData ? (
            <div className="flex items-center justify-center h-48 text-gray-500">
              No data available for the selected time interval.
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg h-48 p-4 flex items-center justify-center">
              {chartType === 'candle' ? (
                <div className="text-center">
                  <p className="text-gray-600 font-medium">Chart data available: {candleData?.length || 0} points</p>
                  <p className="text-sm text-gray-500">See enhanced charts coming soon</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-gray-600 font-medium">Price data available: {priceData?.length || 0} points</p>
                  <p className="text-sm text-gray-500">See enhanced charts coming soon</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}