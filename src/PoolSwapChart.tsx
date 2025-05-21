import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { computePoolId } from "./lib/swap";
import PoolPriceChart from "./PoolPriceChart";
import { ChevronDownIcon } from "lucide-react";

interface PoolSwapChartProps {
  // @TODO
  sellToken: any;
  buyToken: any;
  prevPair: any;
}

export const PoolSwapChart = ({ sellToken, buyToken, prevPair }: PoolSwapChartProps) => {
  const { t } = useTranslation();
  const [showPriceChart, setShowPriceChart] = useState<boolean>(false);

  useEffect(() => {
    const currentPair = [sellToken.id, buyToken?.id].sort().toString();

    if (prevPair !== null && prevPair !== currentPair) {
      setShowPriceChart(false);
    }
  }, [prevPair]);

  const chartToken =
    buyToken && buyToken.id !== null ? buyToken : sellToken && sellToken.id !== null ? sellToken : null;

  if (!chartToken || chartToken.id === null) return null;

  return (
    <div className="relative flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setShowPriceChart((prev) => !prev)}
          className="text-xs text-muted-foreground flex items-center gap-1 hover:text-primary"
        >
          {showPriceChart ? t("coin.hide_chart") : t("coin.show_chart")}
          <ChevronDownIcon className={`w-3 h-3 transition-transform ${showPriceChart ? "rotate-180" : ""}`} />
        </button>
        {showPriceChart && (
          <div className="text-xs text-muted-foreground">
            {chartToken.symbol}/ETH {t("chart.price_chart").toLowerCase()}
          </div>
        )}
      </div>

      {showPriceChart && (
        <div
          className={`transition-all duration-300 ${showPriceChart ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0 overflow-hidden"}`}
        >
          <PoolPriceChart poolId={computePoolId(chartToken.id).toString()} ticker={chartToken.symbol} />
        </div>
      )}
    </div>
  );
};
