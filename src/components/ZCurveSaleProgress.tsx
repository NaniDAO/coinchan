import { useTranslation } from "react-i18next";
import { formatEther, formatUnits } from "viem";
import { CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import type { ZCurveSale } from "@/hooks/use-zcurve-sale";
import { unpackQuadCap } from "@/lib/zCurveHelpers";
import { useZCurveSaleSummary } from "@/hooks/use-zcurve-sale";
import { useAccount } from "wagmi";
import { useMemo } from "react";
import { computeZCurvePoolId } from "@/lib/zCurvePoolId";
import { useReserves } from "@/hooks/use-reserves";
import { useETHPrice } from "@/hooks/use-eth-price";

interface ZCurveSaleProgressProps {
  sale: ZCurveSale;
}

export function ZCurveSaleProgress({ sale }: ZCurveSaleProgressProps) {
  const { t } = useTranslation();
  const { address } = useAccount();
  
  // Get real-time onchain data
  const { data: onchainData } = useZCurveSaleSummary(sale.coinId, address);
  
  // Use onchain data if available, otherwise fall back to indexed data
  const netSold = onchainData ? BigInt(onchainData.netSold) : BigInt(sale.netSold);
  const saleCap = onchainData ? BigInt(onchainData.saleCap) : BigInt(sale.saleCap);
  const ethEscrow = onchainData ? BigInt(onchainData.ethEscrow) : BigInt(sale.ethEscrow);
  const ethTarget = onchainData ? BigInt(onchainData.ethTarget) : BigInt(sale.ethTarget);
  const quadCap = unpackQuadCap(onchainData ? BigInt(onchainData.quadCap) : BigInt(sale.quadCap));
  const isFinalized = onchainData ? onchainData.isFinalized : sale.status === "FINALIZED";
  const feeOrHook = onchainData ? BigInt(onchainData.feeOrHook) : BigInt(sale.feeOrHook);
  
  // Calculate pool ID for finalized sales
  const poolId = useMemo(() => {
    if (!isFinalized) return null;
    // Use feeOrHook from sale data, default to 30 bps (0.3% fee) if not available
    const finalFee = feeOrHook < 10000n ? feeOrHook : 30n; // Use actual fee or default to 30 bps for hooks
    return computeZCurvePoolId(BigInt(sale.coinId), finalFee);
  }, [isFinalized, sale.coinId, feeOrHook]);
  
  // Fetch pool reserves and ETH price for finalized sales
  const { data: reserves } = useReserves({
    poolId: poolId ? BigInt(poolId) : undefined,
    source: "COOKBOOK" as const,
  });
  const { data: ethPrice } = useETHPrice();

  const soldPercentage = saleCap > 0n ? Number((netSold * 100n) / saleCap) : 0;
  // Fix funding percentage calculation
  const fundedPercentage = ethTarget > 0n ? Number((ethEscrow * 10000n) / ethTarget) / 100 : 0;
  const quadCapPercentage =
    saleCap > 0n ? Number((quadCap * 100n) / saleCap) : 0;
  
  // Calculate market price and market cap for finalized sales
  const { marketPrice, marketPriceInWei, marketCapUsd } = useMemo(() => {
    if (!isFinalized || !reserves || reserves.reserve0 === 0n || reserves.reserve1 === 0n) {
      return { marketPrice: 0, marketPriceInWei: 0n, marketCapUsd: 0 };
    }
    
    // Price = ETH reserve / Token reserve
    const ethReserve = Number(formatEther(reserves.reserve0));
    const tokenReserve = Number(formatUnits(reserves.reserve1, 18));
    const price = ethReserve / tokenReserve;
    
    // Convert to wei for calculations
    const priceInWei = (reserves.reserve0 * BigInt(1e18)) / reserves.reserve1;
    
    const usdPrice = price * (ethPrice?.priceUSD || 0);
    // Use 1 billion (1e9) as the total supply for all zCurve launched tokens
    const totalSupply = 1_000_000_000n * 10n ** 18n; // 1 billion tokens with 18 decimals
    const marketCap = usdPrice * Number(formatUnits(totalSupply, 18));
    
    return {
      marketPrice: price,
      marketPriceInWei: priceInWei,
      marketCapUsd: marketCap,
    };
  }, [isFinalized, reserves, ethPrice?.priceUSD]);

  return (
    <CardContent className="space-y-4 h-fit">
      {/* Funding Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {t("sale.funding_progress", "Funding Progress")}
          </span>
          <span className="font-medium">{fundedPercentage.toFixed(1)}%</span>
        </div>
        <Progress value={fundedPercentage} className="h-3" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{(() => {
            const ethValue = Number(formatEther(ethEscrow));
            if (ethValue === 0) return "0";
            if (ethValue < 0.0001) return ethValue.toFixed(9);
            if (ethValue < 0.01) return ethValue.toFixed(6);
            if (ethValue < 1) return ethValue.toFixed(4);
            return ethValue.toFixed(2);
          })()} ETH</span>
          <span>
            {t("sale.target", "Target")}: {formatEther(ethTarget)} ETH
          </span>
        </div>
      </div>

      <Separator />

      {/* Sale Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {t("sale.tokens_sold", "Tokens Sold")}
          </span>
          <span className="font-medium">{soldPercentage.toFixed(1)}%</span>
        </div>
        <div className="relative">
          <Progress value={soldPercentage} className="h-3" />
          {/* Quadratic cap indicator */}
          {quadCapPercentage > 0 && quadCapPercentage < 100 && (
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-primary/50"
              style={{ left: `${quadCapPercentage}%` }}
              title={t("sale.quadratic_cap", "Quadratic pricing ends here")}
            />
          )}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {(() => {
              const value = Number(formatEther(netSold));
              if (value === 0) return "0";
              if (value < 1000) return value.toFixed(0);
              if (value < 1000000) return (value / 1000).toFixed(1) + "K";
              return (value / 1000000).toFixed(1) + "M";
            })()} {t("common.sold", "sold")}
          </span>
          <span>
            {(() => {
              const value = Number(formatEther(saleCap));
              if (value < 1000000) return (value / 1000).toFixed(0) + "K";
              return (value / 1000000).toFixed(0) + "M";
            })()} {t("common.cap", "cap")}
          </span>
        </div>
        {saleCap > 0n && (
          <div className="text-xs text-muted-foreground text-center">
            {((Number(netSold) / Number(saleCap)) * 100).toFixed(2)}% {t("sale.of_total_supply", "of total supply")}
          </div>
        )}
      </div>

      {/* Price Info */}
      <div className="grid grid-cols-2 gap-4 pt-2">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {isFinalized ? t("sale.market_price", "Market Price") : t("sale.current_price", "Current Price")}
          </p>
          <p className="text-sm font-medium">
            {(() => {
              // Use market price for finalized sales, otherwise use current sale price
              let priceInWei = isFinalized && marketPriceInWei > 0n ? marketPriceInWei : (sale.currentPrice ? BigInt(sale.currentPrice) : 0n);
              
              // For finalized sales without market data, calculate average sale price
              if (isFinalized && priceInWei === 0n && netSold > 0n) {
                // Use ethEscrow if available, otherwise use ethTarget
                const ethRaised = ethEscrow > 0n ? ethEscrow : ethTarget;
                if (ethRaised > 0n) {
                  // Average price = total ETH raised / tokens sold
                  priceInWei = (ethRaised * BigInt(1e18)) / netSold;
                }
              }
              
              const price = Number(formatEther(priceInWei));
              
              if (price === 0) return "0 ETH";
              
              // Format very small prices with better readability
              if (price < 1e-15) {
                const wei = price * 1e18;
                if (wei < 0.001) {
                  return `${wei.toExponential(2)} wei`;
                }
                return `${wei.toFixed(3)} wei`;
              }
              if (price < 1e-9) {
                const gwei = price * 1e9;
                if (gwei < 0.001) {
                  return `${gwei.toFixed(6)} gwei`;
                } else if (gwei < 1) {
                  return `${gwei.toFixed(4)} gwei`;
                }
                return `${gwei.toFixed(2)} gwei`;
              }
              if (price < 1e-6) {
                return `${(price * 1e6).toFixed(3)} μETH`;
              }
              if (price < 0.001) {
                return `${(price * 1000).toFixed(4)} mETH`;
              }
              if (price < 0.01) {
                // Format small numbers with notation like 0.{6}1234
                const str = price.toFixed(12).replace(/\.?0+$/, '');
                const parts = str.split('.');
                if (parts.length === 2 && parts[1].length > 3) {
                  const leadingZeros = parts[1].match(/^0+/)?.[0].length || 0;
                  if (leadingZeros >= 3) {
                    const significantPart = parts[1].slice(leadingZeros);
                    return (
                      <span className="font-mono">
                        0.{`{${leadingZeros}}`}{significantPart.slice(0, 4)} ETH
                      </span>
                    );
                  }
                }
              }
              return `${price.toFixed(6)} ETH`;
            })()}
          </p>
          {/* Coins per 1 ETH display */}
          <p className="text-xs text-muted-foreground mt-0.5">
            {(() => {
              // Use market price for finalized sales, otherwise use current sale price
              let priceInWei = isFinalized && marketPriceInWei > 0n ? marketPriceInWei : (sale.currentPrice ? BigInt(sale.currentPrice) : 0n);
              
              // For finalized sales without market data, calculate average sale price
              if (isFinalized && priceInWei === 0n && netSold > 0n) {
                const ethRaised = ethEscrow > 0n ? ethEscrow : ethTarget;
                if (ethRaised > 0n) {
                  priceInWei = (ethRaised * BigInt(1e18)) / netSold;
                }
              }
              
              if (priceInWei === 0n) return "";
              
              // Calculate coins per 1 ETH
              const oneEth = BigInt(1e18);
              const coinsPerEth = (oneEth * oneEth) / priceInWei;
              const coinsPerEthNumber = Number(formatEther(coinsPerEth));
              
              // Format the number nicely
              if (coinsPerEthNumber >= 1e9) {
                return `${(coinsPerEthNumber / 1e9).toFixed(2)}B per ETH`;
              } else if (coinsPerEthNumber >= 1e6) {
                return `${(coinsPerEthNumber / 1e6).toFixed(2)}M per ETH`;
              } else if (coinsPerEthNumber >= 1e3) {
                return `${(coinsPerEthNumber / 1e3).toFixed(2)}K per ETH`;
              } else if (coinsPerEthNumber >= 1) {
                return `${coinsPerEthNumber.toFixed(0)} per ETH`;
              } else {
                return `${coinsPerEthNumber.toFixed(4)} per ETH`;
              }
            })()}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {isFinalized ? t("sale.market_cap", "Market Cap") : t("sale.pricing_phase", "Pricing Phase")}
          </p>
          <p className="text-sm font-medium">
            {isFinalized ? (
              marketCapUsd > 0 ? (
                marketCapUsd > 1e9
                  ? `$${(marketCapUsd / 1e9).toFixed(2)}B`
                  : marketCapUsd > 1e6
                    ? `$${(marketCapUsd / 1e6).toFixed(2)}M`
                    : `$${(marketCapUsd / 1e3).toFixed(2)}K`
              ) : (
                `${Number(formatEther(ethEscrow)).toFixed(4)} ETH raised`
              )
            ) : (
              netSold < quadCap
                ? t("sale.quadratic", "Quadratic")
                : t("sale.linear", "Linear")
            )}
          </p>
          {isFinalized && marketCapUsd > 0 && (
            <p className="text-xs text-muted-foreground">
              {Number(formatEther(ethEscrow)).toFixed(2)} ETH raised
            </p>
          )}
          {!isFinalized && netSold < quadCap && quadCap > 0n && (
            <p className="text-xs text-muted-foreground">
              {((Number(netSold) / Number(quadCap)) * 100).toFixed(1)}%{" "}
              {t("sale.to_linear", "to linear")}
            </p>
          )}
        </div>
      </div>

      {/* Auto-finalization note or finalized status */}
      {isFinalized ? (
        <div className="text-xs text-green-600 dark:text-green-400 text-center pt-2">
          {t(
            "sale.finalized_success",
            "Sale finalized successfully. Pool created on zAMM.",
          )}
        </div>
      ) : fundedPercentage >= 90 ? (
        <div className="text-xs text-amber-600 dark:text-amber-400 text-center pt-2">
          {t(
            "sale.near_target",
            "Sale will auto-finalize when target is reached",
          )}
        </div>
      ) : null}
    </CardContent>
  );
}
