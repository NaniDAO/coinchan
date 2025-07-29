import { useMemo } from "react";
import { formatEther, parseEther } from "viem";

interface StaticZCurveBondingChartProps {
  saleCap: bigint; // in wei (e.g., 800M tokens)
  divisor: bigint;
  ethTarget: bigint; // in wei (e.g., 10 ETH)
  quadCap?: bigint; // quadratic cap - where curve transitions to linear
  currentSold?: bigint; // current amount sold
  netSold?: bigint; // alternative to currentSold
  percentFunded?: number; // percentage funded (0-100)
  currentPrice?: bigint; // current marginal price in wei
  compact?: boolean; // whether to show compact version
  className?: string;
}

export const StaticZCurveBondingChart: React.FC<
  StaticZCurveBondingChartProps
> = ({
  saleCap,
  divisor,
  ethTarget,
  quadCap,
  currentSold = 0n,
  netSold,
  percentFunded,
  currentPrice,
  compact = false,
  className = "",
}) => {
  // Use netSold if provided, otherwise use currentSold
  const tokensSold = netSold || currentSold;

  // Constants from zCurve contract
  const UNIT_SCALE = BigInt("1000000000000"); // 1e12

  // Format very small ETH values with appropriate precision and readability
  const formatSmallEthValue = (
    value: bigint,
    forceReadable: boolean = false,
  ): string => {
    if (value === 0n) return "0";

    const ethValue = Number(formatEther(value));

    // For very small values, use more readable format if requested
    if (forceReadable && ethValue < 1e-10) {
      if (ethValue < 1e-15) {
        const attoETH = ethValue * 1e18;
        return `${attoETH.toFixed(2)} attoETH`;
      } else if (ethValue < 1e-12) {
        const femtoETH = ethValue * 1e15;
        return `${femtoETH.toFixed(2)} femtoETH`;
      } else if (ethValue < 1e-9) {
        const picoETH = ethValue * 1e12;
        return `${picoETH.toFixed(2)} picoETH`;
      } else {
        const nanoETH = ethValue * 1e9;
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
      return ethValue.toFixed(10).replace(/\.?0+$/, "");
    } else {
      return ethValue.toFixed(8).replace(/\.?0+$/, "");
    }
  };

  // Quadratic-then-linear bonding curve cost function
  const calculateCost = (
    n: bigint,
    quadCapValue: bigint | undefined,
    d: bigint,
  ): bigint => {
    const m = n / UNIT_SCALE;
    if (m < BigInt(2)) return BigInt(0);

    if (!quadCapValue) {
      const a = m * (m - BigInt(1));
      const b = a * (BigInt(2) * m - BigInt(1));
      return (b * parseEther("1")) / (BigInt(6) * d);
    }

    const K = quadCapValue / UNIT_SCALE;
    const denom = BigInt(6) * d;
    const oneETH = parseEther("1");

    if (m <= K) {
      const sumSq =
        (m * (m - BigInt(1)) * (BigInt(2) * m - BigInt(1))) / BigInt(6);
      return (sumSq * oneETH) / denom;
    } else {
      const sumK =
        (K * (K - BigInt(1)) * (BigInt(2) * K - BigInt(1))) / BigInt(6);
      const quadCost = (sumK * oneETH) / denom;
      const pK = (K * K * oneETH) / denom;
      const tailTicks = m - K;
      const tailCost = pK * tailTicks;
      return quadCost + tailCost;
    }
  };

  // Calculate marginal price at a given token amount
  const calculateMarginalPrice = (
    tokensSold: bigint,
    quadCapValue: bigint | undefined,
    d: bigint,
  ): bigint => {
    const ticks = tokensSold / UNIT_SCALE;
    const K = quadCapValue ? quadCapValue / UNIT_SCALE : BigInt(0);

    if (ticks < BigInt(2)) return BigInt(0);

    const denom = BigInt(6) * d;
    const oneETH = parseEther("1");

    if (!quadCapValue || ticks <= K) {
      return (ticks * ticks * oneETH) / denom;
    } else {
      return (K * K * oneETH) / denom;
    }
  };

  // Calculate key metrics
  const metrics = useMemo(() => {
    // Current status
    const currentRaised = calculateCost(tokensSold, quadCap, divisor);
    const calculatedCurrentPrice = calculateMarginalPrice(
      tokensSold,
      quadCap,
      divisor,
    );
    const displayCurrentPrice = currentPrice || calculatedCurrentPrice;

    // Progress calculations
    const progressPercent =
      percentFunded ||
      (Number(formatEther(currentRaised)) / Number(formatEther(ethTarget))) *
        100;
    const tokensProgressPercent =
      (Number(formatEther(tokensSold)) / Number(formatEther(saleCap))) * 100;

    // Max raise
    const maxRaise = calculateCost(saleCap, quadCap, divisor);

    // Starting price (after 2 free ticks)
    const firstTicks = 3n;
    const startingPrice =
      (firstTicks * firstTicks * parseEther("1")) / (6n * divisor);

    // Final price if fully sold
    const finalPrice = calculateMarginalPrice(saleCap, quadCap, divisor);

    // Transition point if quadCap exists
    let transitionPrice = 0n;
    let transitionTokens = 0n;
    if (quadCap && quadCap < saleCap) {
      transitionPrice = calculateMarginalPrice(quadCap, quadCap, divisor);
      transitionTokens = quadCap;
    }

    return {
      currentRaised,
      displayCurrentPrice,
      progressPercent: Math.min(progressPercent, 100),
      tokensProgressPercent: Math.min(tokensProgressPercent, 100),
      maxRaise,
      startingPrice,
      finalPrice,
      transitionPrice,
      transitionTokens,
    };
  }, [
    saleCap,
    divisor,
    ethTarget,
    quadCap,
    tokensSold,
    currentPrice,
    percentFunded,
  ]);

  // Generate simple visual representation
  const generateSimpleCurve = () => {
    const points = 20;
    const pathData: string[] = [];

    for (let i = 0; i <= points; i++) {
      const tokens = (saleCap * BigInt(i)) / BigInt(points);
      const cost = calculateCost(tokens, quadCap, divisor);
      const x = (i / points) * 100; // 0-100%
      const y =
        100 -
        (Number(formatEther(cost)) / Number(formatEther(metrics.maxRaise))) *
          100; // Invert Y for SVG

      if (i === 0) {
        pathData.push(`M ${x} ${y}`);
      } else {
        pathData.push(`L ${x} ${y}`);
      }
    }

    return pathData.join(" ");
  };

  if (compact) {
    return (
      <div className={`text-xs space-y-1 ${className}`}>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Progress:</span>
          <span className="font-mono">
            {metrics.progressPercent.toFixed(1)}%
          </span>
        </div>
        <div className="w-full bg-muted h-1 rounded-full overflow-hidden">
          <div
            className="bg-blue-500 h-full transition-all duration-300"
            style={{ width: `${metrics.progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Current:</span>
          <span className="font-mono">
            {formatSmallEthValue(metrics.displayCurrentPrice)}/token
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Raised:</span>
          <span className="font-mono">
            {Number(formatEther(metrics.currentRaised)).toFixed(4)} ETH
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Visual Curve Representation */}
      <div className="relative">
        <div className="text-sm font-medium text-muted-foreground mb-2">
          Bonding Curve Progress
        </div>
        <div className="border rounded-lg bg-background p-4">
          <svg viewBox="0 0 100 100" className="w-full h-24">
            {/* Grid lines */}
            <defs>
              <pattern
                id="grid"
                width="10"
                height="10"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 10 0 L 0 0 0 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="0.5"
                  opacity="0.1"
                />
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#grid)" />

            {/* Target line */}
            <line
              x1="0"
              y1={
                100 -
                (Number(formatEther(ethTarget)) /
                  Number(formatEther(metrics.maxRaise))) *
                  100
              }
              x2="100"
              y2={
                100 -
                (Number(formatEther(ethTarget)) /
                  Number(formatEther(metrics.maxRaise))) *
                  100
              }
              stroke="#f59e0b"
              strokeWidth="1"
              strokeDasharray="2,2"
              opacity="0.8"
            />

            {/* Bonding curve */}
            <path
              d={generateSimpleCurve()}
              fill="none"
              stroke="#0084ff"
              strokeWidth="2"
            />

            {/* Current position indicator */}
            <circle
              cx={metrics.tokensProgressPercent}
              cy={
                100 -
                (Number(formatEther(metrics.currentRaised)) /
                  Number(formatEther(metrics.maxRaise))) *
                  100
              }
              r="2"
              fill="#0084ff"
            />
          </svg>
        </div>
      </div>

      {/* Progress Bars */}
      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>ETH Raised Progress</span>
            <span>{metrics.progressPercent.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
            <div
              className="bg-blue-500 h-full transition-all duration-300"
              style={{ width: `${metrics.progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>
              {Number(formatEther(metrics.currentRaised)).toFixed(4)} ETH
            </span>
            <span>{Number(formatEther(ethTarget)).toFixed(2)} ETH target</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Tokens Sold</span>
            <span>{metrics.tokensProgressPercent.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
            <div
              className="bg-orange-500 h-full transition-all duration-300"
              style={{ width: `${metrics.tokensProgressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>
              {Number(formatEther(tokensSold)).toLocaleString()} tokens
            </span>
            <span>{Number(formatEther(saleCap)).toLocaleString()} total</span>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="text-center p-2 bg-muted/30 rounded">
          <div className="text-muted-foreground">Current Price</div>
          <div className="font-medium font-mono">
            {formatSmallEthValue(metrics.displayCurrentPrice, true)}/token
          </div>
        </div>
        <div className="text-center p-2 bg-muted/30 rounded">
          <div className="text-muted-foreground">Starting Price</div>
          <div className="font-medium font-mono">
            {metrics.startingPrice === 0n
              ? "Free"
              : formatSmallEthValue(metrics.startingPrice, true) + "/token"}
          </div>
        </div>
        <div className="text-center p-2 bg-muted/30 rounded">
          <div className="text-muted-foreground">ETH Raised</div>
          <div className="font-medium font-mono">
            {Number(formatEther(metrics.currentRaised)).toFixed(4)} ETH
          </div>
        </div>
        <div className="text-center p-2 bg-muted/30 rounded">
          <div className="text-muted-foreground">Max Possible</div>
          <div className="font-medium font-mono">
            {Number(formatEther(metrics.maxRaise)).toFixed(2)} ETH
          </div>
        </div>
      </div>

      {/* Quadratic Cap Info */}
      {quadCap && quadCap > 0n && quadCap < saleCap && (
        <div className="text-xs bg-muted/20 p-2 rounded">
          <div className="font-medium mb-1">Bonding Curve Details:</div>
          <div className="space-y-1 text-muted-foreground">
            <div>
              • Quadratic phase: up to{" "}
              {Number(formatEther(quadCap)).toLocaleString()} tokens
            </div>
            <div>
              • Linear phase:{" "}
              {formatSmallEthValue(metrics.transitionPrice, true)}/token
              thereafter
            </div>
            <div>
              • Current phase: {tokensSold <= quadCap ? "Quadratic" : "Linear"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
