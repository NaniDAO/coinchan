import React from "react";
import { cn } from "@/lib/utils";

interface CultPriceDisplayProps {
  cultPrice: string;
  cultUsdPrice: string;
  priceAnimating?: boolean;
  className?: string;
}

export const CultPriceDisplay = React.memo(({ 
  cultPrice, 
  cultUsdPrice, 
  priceAnimating = false,
  className 
}: CultPriceDisplayProps) => {
  return (
    <div className={cn("text-center", className)}>
      <div className={cn(
        "text-4xl font-black tracking-tight",
        priceAnimating && "price-update" // Use the shake animation class
      )}>
        {cultPrice} CULT/ETH
      </div>
      {cultUsdPrice !== "--" && (
        <div className="text-sm text-gray-400 mt-1">
          ${cultUsdPrice} USD
        </div>
      )}
    </div>
  );
});

CultPriceDisplay.displayName = "CultPriceDisplay";