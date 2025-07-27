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
  quadCap?: bigint; // quadratic cap - where curve transitions to linear
  currentSold?: bigint; // current amount sold (0 for new launch)
}

export const ZCurveBondingChart: React.FC<ZCurveBondingChartProps> = ({
  saleCap,
  divisor,
  ethTarget,
  quadCap,
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

  // Constants from zCurve contract
  const UNIT_SCALE = BigInt("1000000000000"); // 1e12

  // Quadratic-then-linear bonding curve cost function from the zCurve contract
  const calculateCost = (n: bigint, quadCapValue: bigint | undefined, d: bigint): bigint => {
    // Convert to "tick" count (1 tick = UNIT_SCALE base-units)
    const m = n / UNIT_SCALE;

    // First tick free
    if (m < BigInt(2)) return BigInt(0);

    // If no quadCap specified, use pure quadratic
    if (!quadCapValue) {
      const a = m * (m - BigInt(1));
      const b = a * (BigInt(2) * m - BigInt(1));
      return (b * parseEther("1")) / (BigInt(6) * d);
    }

    // How many ticks do we run pure-quad? Up to the quadCap
    const K = quadCapValue / UNIT_SCALE;

    // We factor out the common (6*d) denominator and 1 ETH numerator
    const denom = BigInt(6) * d;
    const oneETH = parseEther("1");

    if (m <= K) {
      // PURE QUADRATIC PHASE
      // sum_{i=0..m-1} i^2 = m*(m-1)*(2m-1)/6
      const sumSq = (m * (m - BigInt(1)) * (BigInt(2) * m - BigInt(1))) / BigInt(6);
      return (sumSq * oneETH) / denom;
    } else {
      // MIXED PHASE: QUAD TILL K, THEN LINEAR TAIL
      // 1) Quad area for first K ticks:
      //    sum_{i=0..K-1} i^2 = K*(K-1)*(2K-1)/6
      const sumK = (K * (K - BigInt(1)) * (BigInt(2) * K - BigInt(1))) / BigInt(6);
      const quadCost = (sumK * oneETH) / denom;

      // 2) Marginal price at tick K (for ticks K→m):
      //    p_K = cost(K+1) - cost(K) = (K^2 * 1 ETH) / (6*d)
      const pK = (K * K * oneETH) / denom;

      // 3) Linear tail for the remaining (m - K) ticks
      const tailTicks = m - K;
      const tailCost = pK * tailTicks;

      return quadCost + tailCost;
    }
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
      const totalCost = calculateCost(tokensSold, quadCap, divisor);

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

    // Add visual indicator for quadCap transition if it exists
    if (quadCap && quadCap < saleCap) {
      // Add a subtle vertical reference line at the transition point
      const quadCapCost = calculateCost(quadCap, quadCap, divisor);
      areaSeries.createPriceLine({
        price: Number(formatEther(quadCapCost)),
        color: "#6366f1",
        lineWidth: 1,
        lineStyle: 3, // Dotted
        axisLabelVisible: false,
        title: "",
      });
    }

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
  }, [saleCap, divisor, ethTarget, quadCap, currentSold, theme]);

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
          {quadCap && quadCap > 0n && quadCap < saleCap ? (
            <div className="flex items-center gap-1">
              <div className="w-3 h-[2px] bg-indigo-500" />
              <span>{t("create.linear_phase", "Linear Phase")}</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="border rounded-lg bg-background p-2">
        <div ref={chartContainerRef} className="w-full h-[300px]" />
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="text-center p-2 bg-muted/30 rounded">
          <div className="text-muted-foreground">{t("create.starting_price", "Starting Price")}</div>
          <div className="font-medium">
            {Number(formatEther(calculateCost(UNIT_SCALE, quadCap, divisor))).toFixed(8)} ETH
          </div>
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
            {Number(formatEther(calculateCost(saleCap, quadCap, divisor))).toFixed(2)} ETH
          </div>
        </div>
      </div>
    </div>
  );
};
