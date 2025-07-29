import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, parseEther } from "viem";
import {
  createChart,
  type IChartApi,
  ColorType,
  PriceScaleMode,
  AreaSeries,
  LineSeries,
  type UTCTimestamp,
} from "lightweight-charts";
import { useTheme } from "@/lib/theme";
import type { ZCurveSale } from "@/hooks/use-zcurve-sale";
import { UNIT_SCALE, unpackQuadCap } from "@/lib/zCurveHelpers";

interface ZCurveLiveChartProps {
  sale: ZCurveSale;
  previewAmount?: bigint; // Preview amount in base units
  isBuying?: boolean; // true for buy, false for sell
}

export function ZCurveLiveChart({
  sale,
  previewAmount,
  isBuying = true,
}: ZCurveLiveChartProps) {
  const { t } = useTranslation();
  const { theme: appTheme } = useTheme();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [hoveredPrice, setHoveredPrice] = useState<string | null>(null);
  const [hoveredAmount, setHoveredAmount] = useState<string | null>(null);

  // Extract sale parameters
  const saleCap = BigInt(sale.saleCap);
  const divisor = BigInt(sale.divisor);
  const quadCap = unpackQuadCap(BigInt(sale.quadCap));
  const netSold = BigInt(sale.netSold);

  // Theme configuration
  const theme = {
    backgroundColor: appTheme === "dark" ? "#0a0a0a" : "#ffffff",
    textColor: appTheme === "dark" ? "#e5e5e5" : "#171717",
    gridColor: appTheme === "dark" ? "#262626" : "#f5f5f5",
    borderColor: appTheme === "dark" ? "#404040" : "#e5e5e5",
  };

  // Calculate cost using the exact contract formula
  const calculateCost = (n: bigint): bigint => {
    const m = n / UNIT_SCALE;

    if (m < 2n) return 0n;

    const K = quadCap / UNIT_SCALE; // quadCap is already unpacked on line 26
    const denom = 6n * divisor;
    const oneETH = BigInt(1e18);

    if (m <= K) {
      // Pure quadratic phase
      const sumSq = (m * (m - 1n) * (2n * m - 1n)) / 6n;
      return (sumSq * oneETH) / denom;
    }
    // Mixed phase: quadratic then linear
    const sumK = (K * (K - 1n) * (2n * K - 1n)) / 6n;
    const quadCost = (sumK * oneETH) / denom;
    const pK = (K * K * oneETH) / denom;
    const tailTicks = m - K;
    const tailCost = pK * tailTicks;
    return quadCost + tailCost;
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { type: ColorType.Solid, color: theme.backgroundColor },
        textColor: theme.textColor,
        attributionLogo: false,
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
          bottom: 0.2,
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

    // Create area series for the bonding curve
    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: "#10b981",
      topColor: "rgba(16, 185, 129, 0.4)",
      bottomColor: "rgba(16, 185, 129, 0.0)",
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
    });

    // Generate curve data points
    const dataPoints = [];
    const step = saleCap / 200n; // 200 points for smooth curve

    for (let i = 0n; i <= saleCap; i += step) {
      const cost = calculateCost(i);
      dataPoints.push({
        time: Number(formatEther(i)) as UTCTimestamp, // Amount of coins as x-axis
        value: Number(formatEther(cost)),
      });
    }

    areaSeries.setData(dataPoints);

    // Add current position marker with shadow point
    if (netSold > 0n) {
      const currentCost = calculateCost(netSold);

      // Create a line series for the current position point
      const currentPositionSeries = chart.addSeries(LineSeries, {
        color: "#f59e0b", // Amber color for current position
        lineStyle: 0, // Solid line style
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 8,
        lastValueVisible: false,
        lineVisible: false, // Hide the line, show only the marker
      });

      // Add the current position point
      currentPositionSeries.setData([
        {
          time: Number(formatEther(netSold)) as UTCTimestamp,
          value: Number(formatEther(currentCost)),
        },
      ]);

      // Add a shadow/glow effect using a larger semi-transparent circle
      const shadowSeries = chart.addSeries(LineSeries, {
        color: "rgba(245, 158, 11, 0.3)", // Semi-transparent amber
        lineStyle: 0,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 16,
        lastValueVisible: false,
        lineVisible: false,
      });

      shadowSeries.setData([
        {
          time: Number(formatEther(netSold)) as UTCTimestamp,
          value: Number(formatEther(currentCost)),
        },
      ]);

      // Add a vertical line at current position
      areaSeries.createPriceLine({
        price: Number(formatEther(currentCost)),
        color: "#f59e0b",
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: t("sale.current_price", "Current"),
      });
    }

    // Add preview visualization if previewAmount is provided
    if (previewAmount && previewAmount > 0n) {
      const startPoint = netSold;
      const endPoint = isBuying
        ? netSold + previewAmount
        : netSold - previewAmount;

      if (endPoint >= 0n && endPoint <= saleCap) {
        // Add shaded area for the preview range
        const previewAreaSeries = chart.addSeries(AreaSeries, {
          topColor: isBuying ? 'rgba(59, 130, 246, 0.4)' : 'rgba(239, 68, 68, 0.4)',
          bottomColor: isBuying ? 'rgba(59, 130, 246, 0.05)' : 'rgba(239, 68, 68, 0.05)',
          lineColor: isBuying ? '#3b82f6' : '#ef4444',
          lineWidth: 2,
          crosshairMarkerVisible: false,
        });

        // Generate preview area data points
        const previewDataPoints = [];
        const step = (endPoint - startPoint) / 20n; // 20 points for smooth curve
        const actualStep = step > 0n ? step : -step;
        const stepDirection = step > 0n ? 1n : -1n;
        
        for (let i = 0n; i <= 20n; i++) {
          const point = startPoint + (actualStep * i * stepDirection);
          if (point >= 0n && point <= saleCap) {
            const cost = calculateCost(point);
            previewDataPoints.push({
              time: Number(formatEther(point)) as UTCTimestamp,
              value: Number(formatEther(cost)),
            });
          }
        }
        
        previewAreaSeries.setData(previewDataPoints);

        // Add preview end marker
        const endCost = calculateCost(endPoint);
        const previewMarkerSeries = chart.addSeries(LineSeries, {
          color: isBuying ? '#3b82f6' : '#ef4444',
          lineWidth: 1,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 6,
          crosshairMarkerBorderColor: isBuying ? '#3b82f6' : '#ef4444',
          crosshairMarkerBackgroundColor: isBuying ? '#3b82f6' : '#ef4444',
        });
        
        previewMarkerSeries.setData([{
          time: Number(formatEther(endPoint)) as UTCTimestamp,
          value: Number(formatEther(endCost)),
        }]);

        // Add arrow or indicator showing direction
        
        // Create a price line at the new position
        previewAreaSeries.createPriceLine({
          price: Number(formatEther(endCost)),
          color: isBuying ? '#3b82f6' : '#ef4444',
          lineWidth: 1,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: isBuying ? '→ New Price' : '← New Price',
        });
      }
    }

    // Add quadratic cap indicator
    if (quadCap < saleCap) {
      const quadCapCost = calculateCost(quadCap);
      areaSeries.createPriceLine({
        price: Number(formatEther(quadCapCost)),
        color: "#6366f1",
        lineWidth: 1,
        lineStyle: 3, // Dotted
        axisLabelVisible: false,
        title: "",
      });
    }

    // Subscribe to crosshair move
    chart.subscribeCrosshairMove((param) => {
      if (param.point && param.time) {
        const amount = BigInt(Math.round(Number(param.time) * 1e18));
        const cost = calculateCost(amount);
        setHoveredAmount(formatEther(amount).slice(0, 8));
        setHoveredPrice(formatEther(cost).slice(0, 8));
      } else {
        setHoveredAmount(null);
        setHoveredPrice(null);
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
  }, [sale, previewAmount, isBuying, appTheme, t, calculateCost, quadCap, netSold, theme]);

  // Calculate sale progress
  const saleProgress = Number((netSold * 100n) / saleCap);
  const currentPrice =
    calculateCost(netSold + UNIT_SCALE) - calculateCost(netSold);
  const formattedPrice = formatEther(currentPrice);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">
            {t("sale.live_price_curve", "Live Price Curve")}
          </h3>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">
                {t("sale.progress", "Progress")}:
              </span>
              <span className="font-medium">{saleProgress.toFixed(1)}%</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">
                {t("sale.current", "Current")}:
              </span>
              <span className="font-medium">
                {formattedPrice.slice(0, 8)} ETH
              </span>
            </div>
          </div>
        </div>
        {hoveredAmount && hoveredPrice && (
          <div className="text-xs text-muted-foreground text-right">
            {hoveredAmount} {t("common.tokens", "tokens")} = {hoveredPrice} ETH
          </div>
        )}
      </div>

      <div
        ref={chartContainerRef}
        className="w-full h-[400px] bg-background border border-border rounded-lg"
      />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500 rounded-full" />
            <span>{t("sale.price_curve", "Price Curve")}</span>
          </div>
          {netSold > 0n && (
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-amber-500 rounded-full shadow-lg shadow-amber-500/50" />
              <span>{t("sale.current_position", "Current Position")}</span>
            </div>
          )}
          {previewAmount && previewAmount > 0n ? (
            <div className="flex items-center gap-1">
              <div
                className={`w-3 h-[2px] ${isBuying ? "bg-blue-500" : "bg-red-500"}`}
              />
              <span>
                {isBuying
                  ? t("trade.buy_preview", "Buy Preview")
                  : t("trade.sell_preview", "Sell Preview")}
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-4">
          {netSold > 0n && (
            <div>
              {t("sale.current_price_label", "Current Price")}:{" "}
              {(() => {
                // Calculate marginal price at current netSold
                const m = netSold / UNIT_SCALE;
                const K = quadCap / UNIT_SCALE;
                const denom = 6n * divisor;
                const oneETH = parseEther("1");
                
                let marginalPrice = 0n;
                if (m < 2n) {
                  // Use a minimum value to avoid zero price
                  const minM = m > 0n ? m : 1n;
                  marginalPrice = (minM * oneETH) / (3n * divisor);
                } else if (m <= K) {
                  // Quadratic phase: marginal price = 2m / (6 * divisor)
                  marginalPrice = (2n * m * oneETH) / denom;
                } else {
                  // Linear phase: constant marginal price = 2K / (6 * divisor)
                  marginalPrice = (2n * K * oneETH) / denom;
                }
                
                const price = Number(formatEther(marginalPrice));
                if (price === 0) return "0";
                if (price < 1e-15) return price.toExponential(2);
                if (price < 1e-6) return price.toFixed(9);
                return price.toFixed(8);
              })()} ETH
            </div>
          )}
          <div>
            {t("sale.tokens_sold", "Sold")}: {formatEther(netSold).slice(0, 8)}{" "}
            / {formatEther(saleCap).slice(0, 8)}
            {saleCap > 0n && (
              <span className="text-muted-foreground">
                {" "}({((Number(netSold) / Number(saleCap)) * 100).toFixed(2)}%)
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
