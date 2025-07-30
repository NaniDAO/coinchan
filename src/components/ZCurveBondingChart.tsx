import { useChartTheme } from "@/hooks/use-chart-theme";
import {
  ColorType,
  createChart,
  AreaSeries,
  LineSeries,
  type ISeriesApi,
  type LineData,
  PriceScaleMode,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, parseEther } from "viem";
import { calculateCost } from "@/lib/zCurveMath";
import { UNIT_SCALE } from "@/lib/zCurveHelpers";

interface ZCurveBondingChartProps {
  saleCap: bigint; // in wei (e.g., 800M tokens)
  divisor: bigint;
  ethTarget: bigint; // in wei (e.g., 10 ETH)
  quadCap?: bigint; // quadratic cap - where curve transitions to linear
  currentSold?: bigint; // current amount sold (0 for new launch)
  showMarginalPrice?: boolean; // Show marginal price chart
}

export const ZCurveBondingChart: React.FC<ZCurveBondingChartProps> = ({
  saleCap,
  divisor,
  ethTarget,
  quadCap,
  currentSold = BigInt(0),
  showMarginalPrice = true,
}) => {
  const { t } = useTranslation();
  const cumulativeChartContainerRef = useRef<HTMLDivElement>(null);
  const marginalChartContainerRef = useRef<HTMLDivElement>(null);
  const cumulativeChartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const marginalChartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const cumulativeSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const marginalSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const chartTheme = useChartTheme();
  const [hoveredPrice, setHoveredPrice] = useState<string | null>(null);
  const [hoveredAmount, setHoveredAmount] = useState<string | null>(null);
  const [hoveredMarginalPrice, setHoveredMarginalPrice] = useState<string | null>(null);

  // Map the theme to what lightweight-charts expects
  const theme = {
    backgroundColor: chartTheme.background,
    textColor: chartTheme.textColor,
    gridColor: chartTheme.lineColor + "20", // Add transparency
    borderColor: chartTheme.lineColor + "40", // Add transparency
  };

  // Format very small ETH values with appropriate precision and readability
  const formatSmallEthValue = (value: bigint, forceReadable: boolean = false): string => {
    if (value === 0n) return "0";

    const ethValue = Number(formatEther(value));

    // For very small values, use more readable format if requested
    if (forceReadable && ethValue < 1e-10) {
      // Convert to more readable units
      if (ethValue < 1e-15) {
        const attoETH = ethValue * 1e18; // Convert to attoETH (10^-18 ETH)
        return `${attoETH.toFixed(2)} attoETH`;
      } else if (ethValue < 1e-12) {
        const femtoETH = ethValue * 1e15; // Convert to femtoETH (10^-15 ETH)
        return `${femtoETH.toFixed(2)} femtoETH`;
      } else if (ethValue < 1e-9) {
        const picoETH = ethValue * 1e12; // Convert to picoETH (10^-12 ETH)
        return `${picoETH.toFixed(2)} picoETH`;
      } else {
        const nanoETH = ethValue * 1e9; // Convert to nanoETH (10^-9 ETH)
        return `${nanoETH.toFixed(2)} nanoETH`;
      }
    }

    // Standard formatting
    if (ethValue < 1e-15) {
      return ethValue.toExponential(6);
    } else if (ethValue < 1e-12) {
      return ethValue.toExponential(4);
    } else if (ethValue < 1e-8) {
      return ethValue.toExponential(3);
    } else if (ethValue < 0.00001) {
      // For values between 1e-8 and 1e-5, show with enough decimal places
      return ethValue.toFixed(10).replace(/\.?0+$/, "");
    } else {
      return ethValue.toFixed(8).replace(/\.?0+$/, "");
    }
  };


  // Calculate marginal price at a given token amount using the shared calculateCost function
  const calculateMarginalPrice = (tokensSold: bigint, quadCapValue: bigint | undefined, d: bigint): bigint => {
    // Marginal price is the cost of the next UNIT_SCALE tokens
    const adjustedQuadCap = quadCapValue || tokensSold + UNIT_SCALE * 2n; // If no quadCap, ensure we stay in quadratic
    return calculateCost(tokensSold + UNIT_SCALE, adjustedQuadCap, d) - calculateCost(tokensSold, adjustedQuadCap, d);
  };

  // Calculate important values
  const calculatedValues = useMemo(() => {
    // Calculate the marginal price at the very beginning (after 2 free ticks)
    // The marginal price formula is: (ticks^2 * 1 ETH) / (6 * divisor) in quadratic phase
    const firstTicks = 3n; // First purchasable tick after 2 free ones
    const firstTokenPrice = (firstTicks * firstTicks * parseEther("1")) / (6n * divisor);

    // Calculate average price when target is reached
    // We need to find how many tokens would be sold to reach the target
    let low = 0n;
    let high = saleCap;
    let targetTokens = saleCap;

    // Binary search to find amount of tokens that would raise ethTarget
    while (high - low > UNIT_SCALE) {
      // Continue until we're within 1 tick
      const mid = (low + high) / 2n;
      const cost = calculateCost(mid, quadCap || saleCap, divisor);
      if (cost < ethTarget) {
        low = mid;
      } else {
        high = mid;
      }
    }

    // Check which is closer to target
    const lowCost = calculateCost(low, quadCap || saleCap, divisor);
    const highCost = calculateCost(high, quadCap || saleCap, divisor);
    const lowDiff = ethTarget > lowCost ? ethTarget - lowCost : lowCost - ethTarget;
    const highDiff = ethTarget > highCost ? ethTarget - highCost : highCost - ethTarget;

    targetTokens = lowDiff < highDiff ? low : high;
    const actualRaisedAtTarget = lowDiff < highDiff ? lowCost : highCost;

    // We'll calculate the average price in the display component
    // to maintain precision

    // Max raise is the cost of selling all tokens
    const maxRaise = calculateCost(saleCap, quadCap || saleCap, divisor);

    // Find transition point price for 1 full token if quadCap exists
    let transitionPrice = 0n;
    if (quadCap && quadCap < saleCap) {
      transitionPrice = calculateMarginalPrice(quadCap, quadCap, divisor);
    }

    return {
      firstPrice: firstTokenPrice,
      maxRaise,
      targetTokens,
      actualRaisedAtTarget,
      transitionPrice,
    };
  }, [saleCap, divisor, ethTarget, quadCap]);

  // Create cumulative ETH raised chart
  useEffect(() => {
    if (!cumulativeChartContainerRef.current) return;

    // Create chart
    const chart = createChart(cumulativeChartContainerRef.current, {
      width: cumulativeChartContainerRef.current.clientWidth,
      height: 300,
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
        mode: 1, // Magnet mode
        horzLine: {
          visible: true,
          labelVisible: true,
          labelBackgroundColor: theme.backgroundColor,
        },
        vertLine: {
          visible: true,
          labelVisible: false,
        },
      },
    });

    cumulativeChartRef.current = chart;

    // Create area series for filled area under curve
    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: "#0084ff",
      topColor: "rgba(0, 132, 255, 0.4)",
      bottomColor: "rgba(0, 132, 255, 0.04)",
      lineWidth: 2,
      priceFormat: {
        type: "custom",
        formatter: (price: number) => {
          return `${price.toFixed(6)} ETH`;
        },
      },
    });
    cumulativeSeriesRef.current = areaSeries;

    // Generate curve data points with token mapping
    const dataPoints: LineData[] = [];
    const tokenMap = new Map<number, bigint>(); // Map x-coordinate to token amount
    const numPoints = 200; // More points for smoother curve

    for (let i = 0; i <= numPoints; i++) {
      const tokensSold = (saleCap * BigInt(i)) / BigInt(numPoints);
      const totalCost = calculateCost(tokensSold, quadCap || saleCap, divisor);

      tokenMap.set(i, tokensSold);
      dataPoints.push({
        time: i as UTCTimestamp,
        value: Number(formatEther(totalCost)),
      });
    }

    areaSeries.setData(dataPoints);

    // Subscribe to crosshair move for interactive tooltips
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setHoveredPrice(null);
        setHoveredAmount(null);
        return;
      }

      const timeIndex = param.time as number;
      const tokenAmount = tokenMap.get(timeIndex);
      if (tokenAmount !== undefined) {
        const cost = calculateCost(tokenAmount, quadCap || saleCap, divisor);
        setHoveredAmount(formatEther(tokenAmount).slice(0, 8));
        setHoveredPrice(formatEther(cost).slice(0, 8));
      }
    });

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
      // Since lightweight-charts doesn't support vertical lines well,
      // we'll add a note about the transition in the UI instead
      const quadCapCost = calculateCost(quadCap, quadCap, divisor);

      // Could add a price line at the cost level where transition happens
      areaSeries.createPriceLine({
        price: Number(formatEther(quadCapCost)),
        color: "#ef4444",
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
      if (cumulativeChartContainerRef.current && chart) {
        chart.applyOptions({
          width: cumulativeChartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [saleCap, divisor, ethTarget, quadCap, currentSold, theme]);

  // Create marginal price chart
  useEffect(() => {
    if (!showMarginalPrice || !marginalChartContainerRef.current) return;

    // Create chart
    const chart = createChart(marginalChartContainerRef.current, {
      width: marginalChartContainerRef.current.clientWidth,
      height: 250,
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
        mode: 1, // Magnet mode
        horzLine: {
          visible: true,
          labelVisible: true,
          labelBackgroundColor: theme.backgroundColor,
        },
        vertLine: {
          visible: true,
          labelVisible: false,
        },
      },
    });

    marginalChartRef.current = chart;

    // Create line series for marginal price
    const lineSeries = chart.addSeries(LineSeries, {
      color: "#ff7f00",
      lineWidth: 2,
      priceFormat: {
        type: "custom",
        formatter: (price: number) => {
          if (price === 0) return "0 ETH/token";
          if (price < 1e-15) {
            return price.toExponential(6) + " ETH/token";
          } else if (price < 1e-12) {
            return price.toExponential(4) + " ETH/token";
          } else if (price < 1e-8) {
            return price.toExponential(3) + " ETH/token";
          } else if (price < 0.00001) {
            return price.toFixed(10).replace(/\.?0+$/, "") + " ETH/token";
          }
          return price.toFixed(8).replace(/\.?0+$/, "") + " ETH/token";
        },
      },
    });
    marginalSeriesRef.current = lineSeries;

    // Generate marginal price data points
    const dataPoints: LineData[] = [];
    const tokenMap = new Map<number, bigint>(); // Map x-coordinate to token amount
    const numPoints = 200; // More points for smoother curve

    for (let i = 0; i <= numPoints; i++) {
      const tokensSold = (saleCap * BigInt(i)) / BigInt(numPoints);
      if (tokensSold === 0n) continue; // Skip zero to avoid division issues

      const marginalPrice = calculateMarginalPrice(tokensSold, quadCap, divisor);

      tokenMap.set(i, tokensSold);
      dataPoints.push({
        time: i as UTCTimestamp,
        value: Number(formatEther(marginalPrice)),
      });
    }

    lineSeries.setData(dataPoints);

    // Subscribe to crosshair move for interactive tooltips
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setHoveredMarginalPrice(null);
        return;
      }

      const timeIndex = param.time as number;
      const tokenAmount = tokenMap.get(timeIndex);
      if (tokenAmount !== undefined && tokenAmount > 0n) {
        const marginalPrice = calculateMarginalPrice(tokenAmount, quadCap, divisor);
        const priceStr = formatEther(marginalPrice);
        const priceNum = Number(priceStr);
        if (priceNum < 0.00000001) {
          setHoveredMarginalPrice(priceNum.toExponential(2));
        } else {
          setHoveredMarginalPrice(priceStr.slice(0, 10));
        }
      }
    });

    // Add visual indicator for quadCap transition if it exists
    if (quadCap && quadCap < saleCap) {
      // Find the marginal price at transition
      const transitionPrice = calculateMarginalPrice(quadCap, quadCap, divisor);

      // Add a horizontal reference line at the transition price
      lineSeries.createPriceLine({
        price: Number(formatEther(transitionPrice)),
        color: "#ef4444",
        lineWidth: 2,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: t("create.linear_price", "Linear Price"),
      });
    }

    // Fit content
    chart.timeScale().fitContent();

    // Handle resize
    const handleResize = () => {
      if (marginalChartContainerRef.current && chart) {
        chart.applyOptions({
          width: marginalChartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [saleCap, divisor, quadCap, showMarginalPrice, theme]);

  return (
    <div className="space-y-4">
      {/* Cumulative ETH Raised Chart */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">
            {t("create.cumulative_eth_raised", "Cumulative ETH Raised")}
          </h3>
          {hoveredAmount && hoveredPrice && (
            <div className="text-xs text-foreground">
              {t("create.tokens_equals_eth", "{{amount}} tokens = {{price}} ETH", {
                amount: hoveredAmount,
                price: hoveredPrice,
              })}
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-blue-500 rounded-full" />
              <span>{t("create.eth_raised", "ETH Raised")}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-amber-500 rounded-full" />
              <span>{t("create.eth_target", "ETH Target")}</span>
            </div>
            {quadCap && quadCap > 0n && quadCap < saleCap ? (
              <div className="flex items-center gap-1">
                <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-red-500" />
                <span>{t("create.quadcap_transition", "K (Transition)")}</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="border rounded-lg bg-background p-2">
          <div ref={cumulativeChartContainerRef} className="w-full h-[300px]" />
        </div>
      </div>

      {/* Marginal Price Chart */}
      {showMarginalPrice ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              {t("create.marginal_price", "Marginal Price (ETH per token)")}
            </h3>
            {hoveredMarginalPrice && (
              <div className="text-xs text-foreground">
                {t("create.price_per_token_value", "Price: {{price}} ETH/token", { price: hoveredMarginalPrice })}
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-orange-500 rounded-full" />
                <span>{t("create.price_per_token", "Price per Token")}</span>
              </div>
              {quadCap && quadCap > 0n && quadCap < saleCap ? (
                <div className="flex items-center gap-1">
                  <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-red-500" />
                  <span>{t("create.quadcap_transition", "K (Transition)")}</span>
                </div>
              ) : null}
            </div>
          </div>
          <div className="border rounded-lg bg-background p-2">
            <div ref={marginalChartContainerRef} className="w-full h-[250px]" />
          </div>
        </div>
      ) : null}

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="text-center p-2 bg-muted/30 rounded">
          <div className="text-muted-foreground">{t("create.starting_price", "Starting Price")}</div>
          <div className="font-medium">
            {calculatedValues.firstPrice === 0n || Number(formatEther(calculatedValues.firstPrice)) < 1e-18
              ? t("create.free_first_tokens", "Free (first 2M tokens)")
              : t("create.eth_per_token", "{{price}} ETH/token", {
                  price: formatSmallEthValue(calculatedValues.firstPrice),
                })}
          </div>
        </div>
        <div className="text-center p-2 bg-muted/30 rounded">
          <div className="text-muted-foreground">{t("create.avg_price_at_target", "Avg Price @ Target")}</div>
          <div className="font-medium">
            {calculatedValues.targetTokens === 0n || calculatedValues.actualRaisedAtTarget === 0n
              ? t("common.calculating", "Calculating...")
              : (() => {
                  // Calculate average price: total ETH / total tokens
                  const avgPriceWei =
                    (calculatedValues.actualRaisedAtTarget * BigInt(1e18)) / calculatedValues.targetTokens;
                  return t("create.price_per_token_short", "{{price}}/token", {
                    price: formatSmallEthValue(avgPriceWei, true),
                  });
                })()}
          </div>
        </div>
        <div className="text-center p-2 bg-muted/30 rounded">
          <div className="text-muted-foreground">{t("create.max_raise", "Max Raise")}</div>
          <div className="font-medium">{Number(formatEther(calculatedValues.maxRaise)).toFixed(4)} ETH</div>
        </div>
      </div>
      {quadCap && quadCap > 0n && quadCap < saleCap ? (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="text-center p-2 bg-muted/30 rounded">
            <div className="text-muted-foreground">{t("create.quadratic_phase", "Quadratic Phase")}</div>
            <div className="font-medium">
              {t("create.until_tokens", "Until {{amount}} tokens", {
                amount: Number(formatEther(quadCap)).toLocaleString(),
              })}
            </div>
          </div>
          <div className="text-center p-2 bg-muted/30 rounded">
            <div className="text-muted-foreground">{t("create.linear_price", "Linear Price")}</div>
            <div className="font-medium">
              {formatSmallEthValue(calculatedValues.transitionPrice, true)}
              /token
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
