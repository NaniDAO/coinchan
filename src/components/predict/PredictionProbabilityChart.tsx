import { useEffect, useRef } from "react";
import {
  createChart,
  type IChartApi,
  ColorType,
  PriceScaleMode,
  LineSeries,
  type UTCTimestamp,
} from "lightweight-charts";
import { useTheme } from "@/lib/theme";
import { usePredictionChart } from "@/hooks/use-prediction-chart";
import { LoadingLogo } from "@/components/ui/loading-logo";

interface PredictionProbabilityChartProps {
  marketId: bigint;
}

export function PredictionProbabilityChart({ marketId }: PredictionProbabilityChartProps) {
  const { theme: appTheme } = useTheme();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { data, isLoading, error } = usePredictionChart(marketId, true);

  // Theme configuration
  const theme = {
    backgroundColor: appTheme === "dark" ? "#0a0a0a" : "#ffffff",
    textColor: appTheme === "dark" ? "#e5e5e5" : "#171717",
    gridColor: appTheme === "dark" ? "#262626" : "#f5f5f5",
    borderColor: appTheme === "dark" ? "#404040" : "#e5e5e5",
  };

  useEffect(() => {
    if (!chartContainerRef.current || !data || data.data.length === 0) return;

    // Cleanup existing chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 300,
      layout: {
        background: { type: ColorType.Solid, color: theme.backgroundColor },
        textColor: theme.textColor,
        attributionLogo: false,
      },
      localization: {
        priceFormatter: (price: number) => `${price.toFixed(1)}%`,
      },
      grid: {
        vertLines: { color: theme.gridColor },
        horzLines: { color: theme.gridColor },
      },
      leftPriceScale: {
        mode: PriceScaleMode.Normal,
        borderColor: theme.borderColor,
        borderVisible: false,
        visible: true,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      rightPriceScale: {
        visible: false,
      },
      timeScale: {
        visible: true,
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 1, // Magnet mode
        horzLine: {
          visible: true,
          labelBackgroundColor: appTheme === "dark" ? "#262626" : "#e5e5e5",
        },
        vertLine: {
          visible: true,
          labelBackgroundColor: appTheme === "dark" ? "#262626" : "#e5e5e5",
        },
      },
    });

    chartRef.current = chart;

    // Create line series for YES probability
    const yesSeries = chart.addSeries(LineSeries, {
      color: "#10b981", // Emerald for YES
      lineWidth: 3,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 6,
      lastValueVisible: true,
      priceLineVisible: true,
    });

    // Convert data to chart format (probabilities as percentages)
    // Filter duplicate timestamps and ensure strictly ascending order
    const yesData = data.data
      .map((point) => ({
        time: point.timestamp as UTCTimestamp,
        value: point.yesChance * 100, // Convert to percentage
      }))
      .reduce((acc, point) => {
        // Only add if timestamp is strictly greater than the last one
        if (acc.length === 0 || point.time > acc[acc.length - 1].time) {
          acc.push(point);
        }
        return acc;
      }, [] as Array<{ time: UTCTimestamp; value: number }>);

    yesSeries.setData(yesData);

    // Fit content to show all data
    chart.timeScale().fitContent();

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [data, appTheme, theme.backgroundColor, theme.textColor, theme.gridColor, theme.borderColor]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingLogo />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Failed to load chart data
        </p>
      </div>
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No trading history yet
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4 px-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500" />
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            YES Probability
          </span>
        </div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {data.count} event{data.count !== 1 ? "s" : ""}
        </div>
      </div>
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}
