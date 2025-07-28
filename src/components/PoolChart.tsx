import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import {
  CandlestickChartIcon,
  ChevronDownIcon,
  LineChartIcon,
} from "lucide-react";
import { Suspense, useState } from "react";
import { LoadingLogo } from "./ui/loading-logo";
import PoolPriceChart from "./PoolPriceChart";
import PoolCandleChart from "@/PoolCandleChart";
import { cn, formatNumber } from "@/lib/utils";
import { formatEther, formatUnits } from "viem";

export const PoolChart = ({
  poolId,
  coinSymbol,
  ethPrice,
  coinPrice,
  coinUsdPrice,
  marketCapUsd,
  reserves,
}) => {
  const { t } = useTranslation();

  const [chartType, setChartType] = useState<"line" | "candle">("line");

  return (
    <div className="lg:col-span-7 p-2">
      <div>
        <Suspense
          fallback={
            <div className="flex items-center justify-center">
              <LoadingLogo />
            </div>
          }
        >
          {chartType === "line" ? (
            <PoolPriceChart
              poolId={poolId}
              ticker={coinSymbol}
              ethUsdPrice={ethPrice?.priceUSD}
            />
          ) : (
            <PoolCandleChart poolId={poolId} interval="1d" />
          )}

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setChartType("candle")}
              className={cn(
                "h-8",
                chartType === "candle"
                  ? "bg-primary !text-primary-foreground"
                  : "bg-transparent",
              )}
            >
              <CandlestickChartIcon className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              onClick={() => setChartType("line")}
              className={cn(
                "h-8",
                chartType === "line"
                  ? "bg-primary !text-primary-foreground"
                  : "bg-transparent",
              )}
            >
              <LineChartIcon className="h-4 w-4" />
            </Button>
          </div>
        </Suspense>
      </div>

      {/* Market Stats */}
      <div className="mt-4 lg:mt-6 border p-4 border-border grid grid-cols-2 gap-4 lg:gap-6 text-xs lg:text-sm">
        <div>
          <p className="text-muted-foreground mb-1 lg:mb-2">
            {t("coin.price")}
          </p>
          <p className="font-medium lg:text-base">
            {coinPrice > 0 ? `${coinPrice.toFixed(6)} ETH` : "-"}
          </p>
          <p className="text-muted-foreground text-xs lg:text-sm">
            ${coinUsdPrice.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground mb-1 lg:mb-2">
            {t("coin.market_cap")}
          </p>
          <p className="font-medium lg:text-base">
            $
            {marketCapUsd > 1e9
              ? (marketCapUsd / 1e9).toFixed(2) + "B"
              : marketCapUsd > 0
                ? (marketCapUsd / 1e6).toFixed(2) + "M"
                : "-"}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground mb-1 lg:mb-2">
            {t("coin.pool_eth")}
          </p>
          <p className="font-medium lg:text-base">
            {formatNumber(Number(formatEther(reserves?.reserve0 || 0n)), 4)} ETH
          </p>
        </div>
        <div>
          <p className="text-muted-foreground mb-1 lg:mb-2">
            {t("coin.pool_tokens", "Pool Tokens")}
          </p>
          <p className="font-medium lg:text-base">
            {formatNumber(Number(formatUnits(reserves?.reserve1 || 0n, 18)), 0)}{" "}
            {coinSymbol}
          </p>
        </div>
      </div>
    </div>
  );
};
