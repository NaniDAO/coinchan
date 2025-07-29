import { useMemo } from "react";
import { formatEther } from "viem";
import type { ZCurveSale } from "@/hooks/use-zcurve-sale";
import { UNIT_SCALE, unpackQuadCap } from "@/lib/zCurveHelpers";

interface ZCurveMiniChartProps {
  sale: ZCurveSale;
  className?: string;
}

export function ZCurveMiniChart({ sale, className = "" }: ZCurveMiniChartProps) {
  const isFinalized = sale.status === "FINALIZED";
  
  const chartData = useMemo(() => {
    const saleCap = BigInt(sale.saleCap);
    const divisor = BigInt(sale.divisor);
    const quadCap = unpackQuadCap(BigInt(sale.quadCap));
    const netSold = isFinalized ? saleCap : BigInt(sale.netSold);
    
    // Calculate cost using the exact contract formula
    const calculateCost = (n: bigint): bigint => {
      const m = n / UNIT_SCALE;
      
      if (m < 2n) return 0n;
      
      const K = quadCap / UNIT_SCALE;
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
    
    // Generate curve points
    const points = [];
    const step = saleCap / 50n; // 50 points for smooth mini curve
    
    for (let i = 0n; i <= saleCap; i += step) {
      const cost = calculateCost(i);
      points.push({
        x: Number(i) / Number(saleCap) * 100, // Convert to percentage
        y: Number(formatEther(cost))
      });
    }
    
    // Add final point if not already at 100%
    if (points[points.length - 1].x < 100) {
      const finalCost = calculateCost(saleCap);
      points.push({
        x: 100,
        y: Number(formatEther(finalCost))
      });
    }
    
    // Current position
    const currentCost = calculateCost(netSold);
    const currentX = Number(netSold) / Number(saleCap) * 100;
    const currentY = Number(formatEther(currentCost));
    
    // Max Y for scaling
    const maxY = Math.max(...points.map(p => p.y));
    
    return {
      points,
      currentX,
      currentY,
      maxY,
      progress: (Number(netSold) / Number(saleCap)) * 100
    };
  }, [sale]);
  
  const { points, currentX, currentY, maxY, progress } = chartData;
  
  // Create SVG path
  const pathData = points
    .map((point, index) => {
      const x = (point.x / 100) * 100; // Scale to viewBox width
      const y = 40 - (point.y / maxY) * 35; // Scale and invert for SVG
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
  
  return (
    <div className={`relative ${className}`}>
      <svg 
        viewBox="0 0 100 40" 
        className="w-full h-full"
        preserveAspectRatio="none"
      >
        {/* Background grid */}
        <defs>
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path 
              d="M 10 0 L 0 0 0 10" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="0.5" 
              className="text-border opacity-20"
            />
          </pattern>
        </defs>
        <rect width="100" height="40" fill="url(#grid)" />
        
        {/* Bonding curve */}
        <path
          d={pathData}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={isFinalized ? "text-amber-500" : "text-green-500"}
        />
        
        {/* Fill area under curve up to current position */}
        {currentX > 0 && (
          <path
            d={(() => {
              // Create fill path up to current position
              const fillPoints = points.filter(p => p.x <= currentX);
              
              // Add interpolated point at currentX if needed
              if (fillPoints.length > 0 && fillPoints[fillPoints.length - 1].x < currentX) {
                const lastPoint = fillPoints[fillPoints.length - 1];
                const nextPoint = points.find(p => p.x > currentX);
                
                if (nextPoint) {
                  // Interpolate Y value at currentX
                  const t = (currentX - lastPoint.x) / (nextPoint.x - lastPoint.x);
                  const interpY = lastPoint.y + (nextPoint.y - lastPoint.y) * t;
                  fillPoints.push({ x: currentX, y: interpY });
                }
              }
              
              // Build the fill path
              const fillPath = fillPoints
                .map((point, index) => {
                  const x = (point.x / 100) * 100; // Scale to viewBox width
                  const y = 40 - (point.y / maxY) * 35; // Scale and invert for SVG
                  return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
                })
                .join(' ');
              
              // Close the path to create filled area
              return `${fillPath} L ${currentX} 40 L 0 40 Z`;
            })()}
            fill="currentColor"
            className={isFinalized ? "text-amber-500 opacity-20" : "text-green-500 opacity-20"}
          />
        )}
        
        {/* Current position marker */}
        <circle
          cx={currentX}
          cy={40 - (currentY / maxY) * 35}
          r="2"
          fill="currentColor"
          className={isFinalized ? "text-amber-600" : "text-amber-500"}
        />
        
        {/* Progress line */}
        <line
          x1={currentX}
          y1="0"
          x2={currentX}
          y2="40"
          stroke="currentColor"
          strokeWidth="0.5"
          strokeDasharray="2,2"
          className={isFinalized ? "text-amber-500 opacity-50" : "text-amber-500 opacity-50"}
        />
      </svg>
      
      {/* Progress percentage */}
      <div className={`absolute bottom-0 right-0 text-[10px] font-mono font-bold ${isFinalized ? 'text-amber-600' : 'text-muted-foreground'} bg-background/80 px-1 rounded-sm`}>
        {isFinalized ? '100.0%' : `${progress.toFixed(1)}%`}
      </div>
    </div>
  );
}