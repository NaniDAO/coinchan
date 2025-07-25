import { useChartTheme } from "@/hooks/use-chart-theme";
import {
  ColorType,
  createChart,
  AreaSeries,
  type ISeriesApi,
  type LineData,
  PriceScaleMode,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, parseEther } from "viem";

interface ZCurveBondingChartProps {
  saleCap: bigint; // in wei (e.g., 800M tokens)
  divisor: bigint;
  ethTarget: bigint; // in wei (e.g., 10 ETH)
  currentSold?: bigint; // current amount sold (0 for new launch)
}

export const ZCurveBondingChart: React.FC<ZCurveBondingChartProps> = ({
  saleCap,
  divisor,
  ethTarget,
  currentSold = BigInt(0),
}) => {
  const { t } = useTranslation();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const chartTheme = useChartTheme();

  // Map the theme to what lightweight-charts expects
  const theme = {
    backgroundColor: chartTheme.background,
    textColor: chartTheme.textColor,
    gridColor: chartTheme.lineColor + "20", // Add transparency
    borderColor: chartTheme.lineColor + "40", // Add transparency
  };

  // Quadratic bonding curve cost function from the contract
  // cost = n(n-1)(2n-1) · 1e18 / (6 * d)
  const calculateCost = (n: bigint, d: bigint): bigint => {
    if (n < BigInt(2)) return BigInt(0);

    // Step 1: a = n * (n-1)
    const a = n * (n - BigInt(1));
    // Step 2: b = a * (2n-1)
    const b = a * (BigInt(2) * n - BigInt(1));
    // Step 3: cost = b * 1e18 / (6 * d)
    return (b * parseEther("1")) / (BigInt(6) * d);
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 300,
      layout: {
        background: { type: ColorType.Solid, color: theme.backgroundColor },
        textColor: theme.textColor,
      },
      grid: {
        vertLines: { color: theme.gridColor },
        horzLines: { color: theme.gridColor },
      },
      leftPriceScale: {
        mode: PriceScaleMode.Normal,
        borderColor: theme.borderColor,
        borderVisible: false,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      rightPriceScale: {
        visible: false,
      },
      timeScale: {
        visible: false,
        borderVisible: false,
      },
      crosshair: {
        horzLine: {
          visible: false,
        },
        vertLine: {
          visible: false,
        },
      },
    });

    chartRef.current = chart;

    // Create area series for filled area under curve
    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: "#10b981",
      topColor: "rgba(16, 185, 129, 0.4)",
      bottomColor: "rgba(16, 185, 129, 0.04)",
      lineWidth: 2,
      priceFormat: {
        type: "custom",
        formatter: (price: number) => {
          return `${price.toFixed(6)} ETH`;
        },
      },
    });
    areaSeriesRef.current = areaSeries;

    // Generate curve data points
    const dataPoints: LineData[] = [];
    const numPoints = 100;
    const saleCapNum = Number(saleCap / parseEther("1")); // Convert to token units

    for (let i = 0; i <= numPoints; i++) {
      const tokensSold = BigInt(Math.floor((i / numPoints) * saleCapNum)) * parseEther("1");
      const totalCost = calculateCost(tokensSold / parseEther("1"), divisor);

      dataPoints.push({
        time: i as UTCTimestamp,
        value: Number(formatEther(totalCost)),
      });
    }

    areaSeries.setData(dataPoints);

    // Add a horizontal line for the ETH target
    const targetEthValue = Number(formatEther(ethTarget));
    areaSeries.createPriceLine({
      price: targetEthValue,
      color: "#f59e0b",
      lineWidth: 2,
      lineStyle: 2, // Dashed
      axisLabelVisible: true,
      title: "Target",
    });

    // Fit content
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
  }, [saleCap, divisor, ethTarget, currentSold, theme]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{t("create.bonding_curve", "Bonding Curve")}</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500 rounded-full" />
            <span>{t("create.price_curve", "Price Curve")}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-amber-500 rounded-full" />
            <span>{t("create.eth_target", "ETH Target")}</span>
          </div>
        </div>
      </div>
      <div className="border rounded-lg bg-background p-2">
        <div ref={chartContainerRef} className="w-full h-[300px]" />
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="text-center p-2 bg-muted/30 rounded">
          <div className="text-muted-foreground">{t("create.starting_price", "Starting Price")}</div>
          <div className="font-medium">{Number(formatEther(calculateCost(BigInt(1), divisor))).toFixed(8)} ETH</div>
        </div>
        <div className="text-center p-2 bg-muted/30 rounded">
          <div className="text-muted-foreground">{t("create.avg_price_at_target", "Avg Price @ Target")}</div>
          <div className="font-medium">
            {(Number(formatEther(ethTarget)) / Number(formatEther(saleCap))).toFixed(8)} ETH
          </div>
        </div>
        <div className="text-center p-2 bg-muted/30 rounded">
          <div className="text-muted-foreground">{t("create.max_raise", "Max Raise")}</div>
          <div className="font-medium">
            {Number(formatEther(calculateCost(saleCap / parseEther("1"), divisor))).toFixed(2)} ETH
          </div>
        </div>
      </div>
    </div>
  );
};
