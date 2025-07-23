import PoolPriceChart from "@/components/PoolPriceChart";
import { ChevronDownIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { computePoolId } from "./lib/swap";
import { useEthUsdPrice } from "./hooks/use-eth-usd-price";

interface PoolSwapChartProps {
  // @TODO
  sellToken: any;
  buyToken: any;
  prevPair: any;
  priceImpact?: {
    currentPrice: number;
    projectedPrice: number;
    impactPercent: number;
    action: "buy" | "sell";
  } | null;
}

export const PoolSwapChart = ({ sellToken, buyToken, prevPair, priceImpact }: PoolSwapChartProps) => {
  const { t } = useTranslation();
  const [showPriceChart, setShowPriceChart] = useState<boolean>(false); // Hidden by default
  const { data: ethUsdPrice } = useEthUsdPrice();

  useEffect(() => {
    const currentPair = [sellToken.id, buyToken?.id].sort().toString();

    if (prevPair !== null && prevPair !== currentPair) {
      // Keep chart visible when switching pairs
    }
  }, [prevPair]);

  // Special handling for ENS which has id=0n
  const isENSSwap = buyToken?.symbol === "ENS" || sellToken?.symbol === "ENS";
  const ensToken = buyToken?.symbol === "ENS" ? buyToken : sellToken?.symbol === "ENS" ? sellToken : null;

  const chartToken = isENSSwap
    ? ensToken
    : buyToken && buyToken.id !== null
      ? buyToken
      : sellToken && sellToken.id !== null
        ? sellToken
        : null;

  // ENS and other ERC20s have id=0n which is falsy but valid
  if (!chartToken || (!isENSSwap && (chartToken.id === null || chartToken.id === undefined))) return null;

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
            {chartToken.symbol}/ETH {t("coin.price_history")}
          </div>
        )}
      </div>

      {showPriceChart && (
        <div
          className={`transition-all duration-300 ${showPriceChart ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0 overflow-hidden"}`}
        >
          <PoolPriceChart
            poolId={
              isENSSwap
                ? "107895081322979037665933919470752294545033231002190305779392467929211865476585"
                : chartToken.poolId
                  ? chartToken.poolId.toString()
                  : computePoolId(chartToken.id).toString()
            }
            ticker={chartToken.symbol}
            ethUsdPrice={ethUsdPrice}
            priceImpact={priceImpact}
          />
        </div>
      )}
    </div>
  );
};
