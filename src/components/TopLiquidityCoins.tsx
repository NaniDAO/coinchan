import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { formatEther } from "viem";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useCoinsData } from "@/hooks/metadata/use-coins-data";
import { Skeleton } from "./ui/skeleton";

export const TopLiquidityCoins = ({ currentCoinId }: { currentCoinId: string }) => {
  const { t } = useTranslation();
  const { data: coins, isLoading } = useCoinsData();

  // Sort coins by liquidity and filter out the current coin
  const topCoins = coins
    ?.filter(coin => coin.coinId.toString() !== currentCoinId)
    ?.sort((a, b) => {
      const aLiquidity = Number(a.reserve0 || 0n);
      const bLiquidity = Number(b.reserve0 || 0n);
      return bLiquidity - aLiquidity;
    })
    ?.slice(0, 10); // Show top 10

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("coin.top_liquidity", "Top Liquidity")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!topCoins || topCoins.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("coin.top_liquidity", "Top Liquidity")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {topCoins.map((coin, index) => {
            const ethLiquidity = Number(formatEther(coin.reserve0 || 0n));
            const coinPath = coin.symbol === "ENS" || coin.symbol === "CULT" || coin.symbol === "USDT" 
              ? `/swap?to=${coin.coinId}` 
              : `/coin/${coin.coinId}`;
            
            return (
              <Link
                key={coin.coinId.toString()}
                to={coinPath}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-muted-foreground w-6">
                    #{index + 1}
                  </span>
                  {coin.imageUrl && (
                    <img 
                      src={coin.imageUrl} 
                      alt={coin.symbol || ""}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  )}
                  <div>
                    <div className="font-medium">{coin.symbol}</div>
                    <div className="text-sm text-muted-foreground">{coin.name}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{ethLiquidity.toFixed(2)} ETH</div>
                  <div className="text-sm text-muted-foreground">
                    {t("coin.liquidity", "Liquidity")}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};