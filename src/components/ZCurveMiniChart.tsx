import { memo, useMemo } from "react";
import { formatEther } from "viem";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, ReferenceLine, Dot } from "recharts";
import type { ZCurveSale } from "@/hooks/use-zcurve-sale";
import { UNIT_SCALE, unpackQuadCap, ZCURVE_STANDARD_PARAMS } from "@/lib/zCurveHelpers";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

// Calculate cost using the exact contract formula
const calculateCost = (n: bigint, quadCap: bigint, divisor: bigint): bigint => {
  // Protect against division by zero
  if (divisor === 0n || UNIT_SCALE === 0n) return 0n;

  const m = n / UNIT_SCALE;

  if (m < 2n) return 0n;

  const K = quadCap / UNIT_SCALE;
  // Optimize for standard divisor - protect against zero divisor
  const denom = divisor === ZCURVE_STANDARD_PARAMS.DIVISOR ? ZCURVE_STANDARD_PARAMS.DIVISOR * 6n : 6n * divisor;

  // Additional safety check for denominator
  if (denom === 0n) return 0n;

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

interface ZCurveMiniChartProps {
  sale: ZCurveSale;
  className?: string;
}

// Custom dot component for current position
const CurrentPositionDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (!payload?.isCurrent) return null;

  return <Dot cx={cx} cy={cy} r={3} fill="currentColor" className="text-amber-500" stroke="white" strokeWidth={1} />;
};

export function ZCurveMiniChartInner({ sale, className = "" }: ZCurveMiniChartProps) {
  const { t } = useTranslation();
  const isFinalized = sale.status === "FINALIZED";

  // Memoize the basic calculation parameters
  const calculationParams = useMemo(() => {
    if (!sale || !sale.divisor || !sale.quadCap) {
      return null;
    }

    // For finalized sales, use lpSupply instead of saleCap
    const saleCap = isFinalized ? BigInt(sale.lpSupply || 0) : BigInt(sale.saleCap || 0);
    const divisor = BigInt(sale.divisor);
    const quadCap = unpackQuadCap(BigInt(sale.quadCap));

    // Ensure no zero values that could cause division errors
    if (saleCap === 0n || divisor === 0n) {
      return null;
    }

    return {
      saleCap,
      divisor,
      quadCap,
      // For finalized sales, netSold should be the full saleCap (lpSupply)
      netSold: isFinalized ? saleCap : BigInt(sale.netSold || 0),
      ethEscrow: BigInt(sale.ethEscrow || 0),
      ethTarget: BigInt(sale.ethTarget || 1), // Ensure never zero
    };
  }, [
    sale.saleCap,
    sale.lpSupply,
    sale.divisor,
    sale.quadCap,
    sale.netSold,
    sale.ethEscrow,
    sale.ethTarget,
    isFinalized,
  ]);

  // Memoize chart data generation
  const chartData = useMemo(() => {
    if (!calculationParams) return [];

    const { saleCap, quadCap, divisor, netSold } = calculationParams;

    // Additional safety check
    if (saleCap === 0n) return [];

    const points = [];
    const numPoints = 50; // More points for smoother curve with Recharts
    const step = saleCap / BigInt(numPoints);

    // Ensure step is not zero
    const safeStep = step === 0n ? 1n : step;

    for (let i = 0n; i <= saleCap; i += safeStep) {
      const cost = calculateCost(i, quadCap, divisor);
      const progressPercent = Number((i * 10000n) / saleCap) / 100;
      const isCurrent = i <= netSold && (i + safeStep > netSold || i === saleCap);

      points.push({
        progress: progressPercent,
        cost: Number(formatEther(cost)),
        // For finalized sales, fill the entire chart
        costFilled: isFinalized || i <= netSold ? Number(formatEther(cost)) : 0,
        isCurrent: isFinalized ? i === saleCap : isCurrent, // Only show dot at end for finalized
        tokens: Number(i),
      });

      // Break if we've reached saleCap to avoid infinite loop
      if (i >= saleCap) break;
    }

    // Ensure we have a final point at 100%
    if (points.length === 0 || points[points.length - 1].progress < 100) {
      const finalCost = calculateCost(saleCap, quadCap, divisor);
      points.push({
        progress: 100,
        cost: Number(formatEther(finalCost)),
        costFilled: Number(formatEther(finalCost)), // Always filled for final point
        isCurrent: isFinalized || netSold >= saleCap,
        tokens: Number(saleCap),
      });
    }

    return points;
  }, [calculationParams, isFinalized]);

  // Memoize current position calculations
  const currentStats = useMemo(() => {
    if (!calculationParams) {
      return { currentProgress: 0, fundedPercentage: 0 };
    }

    const { saleCap, netSold, ethEscrow, ethTarget } = calculationParams;

    // Protect against division by zero
    const currentProgress = saleCap > 0n ? Number((netSold * 10000n) / saleCap) / 100 : 0;
    const fundedPercentage = ethTarget > 0n ? Number((ethEscrow * 10000n) / ethTarget) / 100 : 0;

    return {
      currentProgress: isFinalized ? 100 : currentProgress,
      fundedPercentage: isFinalized ? 100 : fundedPercentage,
    };
  }, [calculationParams, isFinalized]);

  // Memoize styling classes with enhanced golden theme for finalized
  const strokeColor = useMemo(
    () => (isFinalized ? "#f59e0b" : "#10b981"), // amber-500 : green-500
    [isFinalized],
  );

  const progressClass = useMemo(() => {
    const isCharging = !isFinalized && currentStats.fundedPercentage < 0.05;

    return `absolute bottom-1 right-1 text-[10px] font-mono font-bold ${
      isFinalized
        ? "text-amber-900 bg-gradient-to-r from-amber-100 to-yellow-100 border-amber-300"
        : isCharging
          ? "text-muted-foreground/80 bg-background/90 border"
          : "text-muted-foreground bg-background/90 border"
    } px-1.5 py-0.5 rounded-sm`;
  }, [isFinalized, currentStats.fundedPercentage]);

  // Memoize percentage display
  const percentageDisplay = useMemo(() => {
    if (isFinalized) return "100.0%";

    // Show lightning bolt for very early stages (less than 0.05%)
    if (currentStats.fundedPercentage < 0.05) {
      return `⚡ ${t("sale.charging", "Charging")}`;
    }

    return `${currentStats.fundedPercentage.toFixed(1)}%`;
  }, [isFinalized, currentStats.fundedPercentage, t]);

  // Don't render if no valid data
  if (!calculationParams || chartData.length === 0) {
    return <div className={cn(`bg-muted/20 animate-pulse rounded`, className)} />;
  }

  return (
    <div
      className={cn(
        `relative border rounded transition-all duration-500`,
        isFinalized
          ? "bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200 shadow-amber-100 shadow-lg"
          : "bg-background",
        className,
      )}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={strokeColor} stopOpacity={isFinalized ? 0.4 : 0.3} />
              <stop offset="95%" stopColor={strokeColor} stopOpacity={isFinalized ? 0.1 : 0.05} />
            </linearGradient>
            <linearGradient id="filledGradient" x1="0" y1="0" x2="0" y2="1">
              {isFinalized ? (
                // Golden gradient for finalized state
                <>
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                  <stop offset="50%" stopColor="#fbbf24" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.4} />
                </>
              ) : (
                <>
                  <stop offset="5%" stopColor={strokeColor} stopOpacity={0.6} />
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0.2} />
                </>
              )}
            </linearGradient>
          </defs>

          <XAxis dataKey="progress" type="number" scale="linear" domain={[0, 100]} hide />
          <YAxis dataKey="cost" type="number" domain={[0, "dataMax"]} hide />

          {/* Background curve area */}
          <Area
            type="monotone"
            dataKey="cost"
            stroke={strokeColor}
            strokeWidth={isFinalized ? 2 : 1.5}
            fill="url(#costGradient)"
            fillOpacity={isFinalized ? 0.4 : 0.3}
            dot={false}
            activeDot={false}
          />

          {/* Filled area up to current position */}
          <Area
            type="monotone"
            dataKey="costFilled"
            stroke="none"
            fill="url(#filledGradient)"
            fillOpacity={1}
            dot={<CurrentPositionDot />}
            activeDot={false}
          />

          {/* Current progress reference line - hidden for finalized since it's at 100% */}
          {!isFinalized && (
            <ReferenceLine
              x={currentStats.currentProgress}
              stroke={strokeColor}
              strokeDasharray="3 3"
              strokeOpacity={0.6}
              strokeWidth={1}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>

      {/* Progress percentage overlay with enhanced styling for finalized */}
      <div className={progressClass}>
        {isFinalized && <span className="mr-1 text-amber-600">✨</span>}
        {percentageDisplay}
      </div>
    </div>
  );
}

export const ZCurveMiniChart = memo(ZCurveMiniChartInner);
