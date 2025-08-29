import { formatEther, formatUnits } from "viem";
import { formatNumber } from "@/lib/utils";
import { formatDexscreenerStyle } from "@/lib/math";

interface PoolInfoCardProps {
  reserves: any;
  sellToken: any;
  buyToken: any;
  isCustomPool: boolean;
  isCoinToCoin: boolean;
  isDirectUsdtEthSwap: boolean;
  coinId?: string | null;
  tokens: any[];
  ethPrice?: { priceUSD: number };
  priceImpact?: { impactPercent: number } | null;
  swapFee: string;
}

export const PoolInfoCard = ({
  reserves,
  sellToken,
  buyToken,
  isCustomPool,
  isCoinToCoin,
  isDirectUsdtEthSwap,
  coinId,
  tokens,
  ethPrice,
  priceImpact,
  swapFee,
}: PoolInfoCardProps) => {
  if (!reserves) return null;

  return (
    <div className="space-y-2 text-xs">
      {/* Route or Pool reserves */}
      <div className="flex justify-between items-center">
        <span>
          {isCoinToCoin && !isDirectUsdtEthSwap ? (
            <span className="bg-chart-5/20 text-chart-5 px-1 py-0.5 rounded">
              Route: {sellToken.symbol} → ETH → {buyToken?.symbol}
            </span>
          ) : (
            <>
              Pool: {formatNumber(parseFloat(formatEther(reserves.reserve0)), 5)} ETH /{" "}
              {formatNumber(
                parseFloat(
                  formatUnits(
                    reserves.reserve1,
                    isCustomPool ? (sellToken.isCustomPool ? sellToken.decimals || 18 : buyToken?.decimals || 18) : 18,
                  ),
                ),
                3,
              )}{" "}
              {coinId ? tokens.find((t) => t.id === coinId)?.symbol || "Token" : buyToken?.symbol}
            </>
          )}
        </span>

        {/* Fee + Impact */}
        <span className="flex items-center gap-2">
          <span>Fee: {swapFee}</span>
          {priceImpact && (
            <span className={`font-medium ${priceImpact.impactPercent > 0 ? "text-green-600" : "text-red-600"}`}>
              {priceImpact.impactPercent > 0 ? "+" : ""}
              {formatDexscreenerStyle(priceImpact.impactPercent)}%
            </span>
          )}
        </span>
      </div>

      {/* USD stats */}
      {ethPrice?.priceUSD && !isCoinToCoin && (
        <div className="opacity-70 space-y-1">
          <div>
            Total Pool Value: ${formatNumber(parseFloat(formatEther(reserves.reserve0)) * ethPrice.priceUSD * 2, 2)} USD
          </div>
          <div>
            1 ETH ≈ {formatNumber(reserves.reserve1 / reserves.reserve0, 6)} {buyToken?.symbol}
          </div>
        </div>
      )}
    </div>
  );
};
