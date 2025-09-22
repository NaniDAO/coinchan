import { formatUsdPrice } from "@/lib/math";
import { TokenMetadata } from "@/lib/pools";
import { formatNumber } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits } from "viem";

interface PoolInfoSectionProps {
  tokenA?: TokenMetadata;
  tokenB?: TokenMetadata;
  reserves?: {
    reserve0: bigint;
    reserve1: bigint;
  };
  price: number;
  priceUsd: number;
  ethPrice?: { priceWei: bigint; priceUSD: number; priceStr: string };
  marketCapEth: number;
  marketCapUsd: number;
  fee: bigint;
  poolId: string;
  totalSupply: bigint | null;
}

export const PoolInfoSection = ({
  tokenA,
  tokenB,
  reserves,
  price,
  priceUsd,
  ethPrice,
  marketCapEth,
  marketCapUsd,
  fee,
  poolId,
  totalSupply,
}: PoolInfoSectionProps) => {
  const { t } = useTranslation();
  return (
    <div className="mt-4 sm:mt-6 md:mt-8 bg-card rounded-lg p-4 sm:p-6">
      <h2 className="text-base sm:text-lg md:text-xl font-semibold mb-4 sm:mb-6 flex items-center gap-2">
        <span className="w-2 h-2 bg-primary rounded-full"></span>
        {tokenA?.symbol} / {tokenB?.symbol} {t("coin.pool_details", "Pool")}
      </h2>

      {/* Unified Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-4 sm:mb-6">
        {/* Price */}
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 sm:mb-2">
            Price
          </div>
          <div className="font-semibold text-sm sm:text-base lg:text-lg">
            {reserves && price > 0
              ? price < 1e-15
                ? `${((reserves.reserve0 * BigInt(1e18)) / reserves.reserve1).toString()} wei`
                : price < 1e-12
                  ? `${(price * 1e9).toFixed(6)} gwei`
                  : price < 1e-9
                    ? `${(price * 1e9).toFixed(3)} gwei`
                    : price < 1e-6
                      ? `${(price * 1e6).toFixed(3)} μETH`
                      : price < 0.001
                        ? `${(price * 1000).toFixed(4)} mETH`
                        : price < 0.01
                          ? `${price.toFixed(6)} ETH`
                          : price < 1
                            ? `${price.toFixed(4)} ETH`
                            : `${price.toFixed(2)} ETH`
              : "0.00000000 ETH"}
          </div>
          <div className="text-sm text-muted-foreground">
            {ethPrice?.priceUSD ? formatUsdPrice(priceUsd) : "Loading..."}
          </div>
          {/* Tokens per ETH for context */}
          {reserves && price > 0 && (
            <div className="text-xs text-muted-foreground mt-1">
              {(() => {
                const tokensPerEth = 1 / price;
                if (tokensPerEth >= 1e9) {
                  return `${(tokensPerEth / 1e9).toFixed(2)}B per ETH`;
                } else if (tokensPerEth >= 1e6) {
                  return `${(tokensPerEth / 1e6).toFixed(2)}M per ETH`;
                } else if (tokensPerEth >= 1e3) {
                  return `${(tokensPerEth / 1e3).toFixed(2)}K per ETH`;
                } else {
                  return `${tokensPerEth.toFixed(2)} per ETH`;
                }
              })()}
            </div>
          )}
        </div>

        {/* Market Cap */}
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 sm:mb-2">
            Market Cap
          </div>
          <div className="font-semibold text-sm sm:text-base lg:text-lg">
            {reserves && marketCapEth > 0 ? (
              <>
                {marketCapEth < 1
                  ? `${marketCapEth.toFixed(4)} ETH`
                  : marketCapEth < 1000
                    ? `${marketCapEth.toFixed(2)} ETH`
                    : `${(marketCapEth / 1000).toFixed(2)}K ETH`}
                {ethPrice?.priceUSD && marketCapUsd > 0 && (
                  <span className="text-muted-foreground text-xs ml-1">
                    (~$
                    {marketCapUsd > 1e9
                      ? `${(marketCapUsd / 1e9).toFixed(2)}B`
                      : marketCapUsd > 1e6
                        ? `${(marketCapUsd / 1e6).toFixed(2)}M`
                        : marketCapUsd > 1000
                          ? `${(marketCapUsd / 1e3).toFixed(2)}K`
                          : marketCapUsd.toFixed(0)}
                    )
                  </span>
                )}
              </>
            ) : (
              "Loading..."
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {totalSupply
              ? `${formatNumber(Number(formatEther(totalSupply)), 0)} supply`
              : "Supply data loading..."}
          </div>
        </div>

        {/* ETH Liquidity */}
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 sm:mb-2">
            {tokenA?.symbol} Liquidity
          </div>
          <div className="font-semibold text-sm sm:text-base lg:text-lg">
            {formatNumber(Number(formatEther(reserves?.reserve0 || 0n)), 4)}
          </div>
          <div className="text-xs text-muted-foreground">ETH</div>
        </div>

        {/* Token Liquidity */}
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 sm:mb-2">
            {tokenB?.symbol} Liquidity
          </div>
          <div className="font-semibold text-sm sm:text-base lg:text-lg">
            {formatNumber(Number(formatUnits(reserves?.reserve1 || 0n, 18)), 0)}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            {tokenB?.symbol}
            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-medium">
              {(Number(fee) / 100).toFixed(2)}% Fee
            </span>
          </div>
        </div>
      </div>

      {/* Technical Details - Minimalist */}
      <details className="group pt-4">
        <summary className="flex items-center justify-between cursor-pointer py-2 hover:text-primary transition-colors">
          <span className="text-sm font-medium text-muted-foreground">
            Technical Details
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground group-open:rotate-180 transition-transform" />
        </summary>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pool ID</span>
            <span className="font-mono text-xs text-primary">
              {poolId?.slice(0, 8)}...{poolId?.slice(-6)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Decimals</span>
            <span>18</span>
          </div>
        </div>
      </details>
    </div>
  );
};
