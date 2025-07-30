// import { useState } from "react";
import { useTranslation } from "react-i18next";
// import { Button } from "@/components/ui/button";
// import { LineChart, CandlestickChart } from "lucide-react";
import { ZCurveLiveChart } from "./ZCurveLiveChart";
// import { ZCurveCandlestickChart } from "./ZCurveCandlestickChart";
import type { ZCurveSale } from "@/hooks/use-zcurve-sale";
// import { cn } from "@/lib/utils";

interface ZCurvePriceChartProps {
  sale: ZCurveSale;
  previewAmount?: bigint;
  isBuying?: boolean;
  // defaultView?: "line" | "candlestick";
}

export function ZCurvePriceChart({ 
  sale, 
  previewAmount, 
  isBuying = true,
  // defaultView = "line" 
}: ZCurvePriceChartProps) {
  const { t } = useTranslation();
  // const [chartType, setChartType] = useState<"line" | "candlestick">(defaultView);

  return (
    <div className="space-y-4">
      {/* Chart type toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {t("chart.price_chart", "Price Chart")}
        </h3>
        
        {/* Candlestick toggle removed - only line chart available */}
        {/* <div className="flex items-center gap-1 border border-border rounded-md p-1">
          <Button
            variant={chartType === "line" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2"
            onClick={() => setChartType("line")}
          >
            <LineChart className="h-4 w-4 mr-1" />
            <span className="text-xs">{t("chart.line", "Line")}</span>
          </Button>
          <Button
            variant={chartType === "candlestick" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2"
            onClick={() => setChartType("candlestick")}
          >
            <CandlestickChart className="h-4 w-4 mr-1" />
            <span className="text-xs">{t("chart.candles", "Candles")}</span>
          </Button>
        </div> */}
      </div>

      {/* Chart content */}
      <div>
        {/* Only show line chart - candlestick chart removed */}
        <ZCurveLiveChart 
          sale={sale} 
          previewAmount={previewAmount} 
          isBuying={isBuying} 
        />
        {/* Candlestick chart code removed
        {chartType === "line" ? (
          <ZCurveLiveChart 
            sale={sale} 
            previewAmount={previewAmount} 
            isBuying={isBuying} 
          />
        ) : (
          <>
            <ZCurveCandlestickChart sale={sale} />
            {previewAmount && previewAmount > 0n && (
              <div className="mt-2 p-3 bg-muted/50 rounded-md text-sm text-muted-foreground">
                <span className="font-medium">{t("chart.note", "Note")}:</span> {t("chart.preview_not_available", "Trade preview is only available in line chart mode")}
              </div>
            )}
          </>
        )} */}
      </div>
    </div>
  );
}