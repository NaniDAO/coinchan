import React from "react";
import { useTranslation } from "react-i18next";

interface CultFloorProgressProps {
  floorProgress: number;
  accumulatedTax: string;
}

export const CultFloorProgress = React.memo(({ floorProgress, accumulatedTax }: CultFloorProgressProps) => {
  const { t } = useTranslation();
  
  return (
    <div className="relative">
      <div className="text-xs text-gray-400 mb-2 flex justify-between">
        <span>{t("cult.cult_floor_accumulation")}</span>
        <span>{accumulatedTax} ETH / 2.488 ETH</span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-red-600 to-red-500 transition-all duration-1000 ease-out shimmer"
          style={{ width: `${floorProgress}%` }}
        />
      </div>
      <div className="text-xs text-gray-500 mt-1 text-center">
        {floorProgress.toFixed(1)}% {t("cult.to_floor_price")}
      </div>
    </div>
  );
});

CultFloorProgress.displayName = "CultFloorProgress";