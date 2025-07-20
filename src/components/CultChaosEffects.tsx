import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Random color transitions between updates
const CHAOS_COLORS = [
  "text-red-400",
  "text-red-500", 
  "text-red-600",
  "text-orange-500",
  "text-pink-500",
];

interface CultChaosEffectsProps {
  children: React.ReactNode;
  enableChaos?: boolean;
  interval?: number;
}

export const CultChaosEffects = React.memo(({ 
  children, 
  enableChaos = true,
  interval = 27000 // Random color every 27 seconds
}: CultChaosEffectsProps) => {
  const [chaosColor, setChaosColor] = useState("");
  const [glowIntensity, setGlowIntensity] = useState(0);

  useEffect(() => {
    if (!enableChaos) return;

    const chaosInterval = setInterval(() => {
      // Random color transition
      const randomColor = CHAOS_COLORS[Math.floor(Math.random() * CHAOS_COLORS.length)];
      setChaosColor(randomColor);
      
      // Random glow intensity
      setGlowIntensity(Math.random() * 30 + 10); // 10-40% intensity
      
      // Reset after animation
      setTimeout(() => {
        setChaosColor("");
        setGlowIntensity(0);
      }, 2000);
    }, interval);

    return () => clearInterval(chaosInterval);
  }, [enableChaos, interval]);

  return (
    <div 
      className={cn(
        "transition-all duration-1000",
        chaosColor
      )}
      style={{
        filter: glowIntensity > 0 ? `drop-shadow(0 0 ${glowIntensity}px rgba(239, 68, 68, 0.5))` : undefined
      }}
    >
      {children}
    </div>
  );
});

CultChaosEffects.displayName = "CultChaosEffects";

// Skeleton loader with CULT style
export const CultSkeleton = ({ className }: { className?: string }) => {
  return (
    <div className={cn(
      "animate-pulse bg-gradient-to-r from-gray-800 via-red-900/20 to-gray-800",
      "background-size-200 background-position-0",
      className
    )}>
      <div className="shimmer" />
    </div>
  );
};

// Loading state with chaos
export const CultLoadingChaos = () => {
  const [dot, setDot] = useState("");
  
  useEffect(() => {
    const interval = setInterval(() => {
      setDot(prev => prev.length >= 3 ? "" : prev + ".");
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="text-center py-8">
      <div className="text-2xl font-bold text-red-500 animate-pulse">
        LOADING CULT{dot}
      </div>
      <div className="mt-2 text-sm text-gray-500">
        Summoning the chaos
      </div>
    </div>
  );
};