import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, parseEther, type Address } from "viem";
import { useAccount, useBalance, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TokenIcon } from "@/components/TokenIcon";

import { zCurveAbi, zCurveAddress } from "@/constants/zCurve";
import { useZCurveSale, useZCurveBalance } from "@/hooks/use-zcurve-sale";
import { calculateCost } from "@/lib/zCurveMath";
import { handleWalletError, isUserRejectionError } from "@/lib/errors";

interface ZCurveBuyProps {
  coinId: string;
  coinName?: string;
  coinSymbol?: string;
  coinIcon?: string;
}

export function ZCurveBuy({ coinId, coinName, coinSymbol, coinIcon }: ZCurveBuyProps) {
  const { t } = useTranslation();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  
  const [ethAmount, setEthAmount] = useState("");
  const [slippage, setSlippage] = useState(1); // 1% default slippage
  const [isCalculating, setIsCalculating] = useState(false);
  
  const { data: sale, isLoading: saleLoading } = useZCurveSale(coinId);
  const { data: userBalance } = useZCurveBalance(coinId, address);
  const { data: ethBalance } = useBalance({ address });
  
  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const { isSuccess: txSuccess, isLoading: txLoading } = useWaitForTransactionReceipt({ hash });
  
  // Calculate expected output and slippage
  const calculations = useMemo(() => {
    if (!sale || !ethAmount || parseFloat(ethAmount) <= 0) {
      return { expectedCoins: BigInt(0), minCoins: BigInt(0), priceImpact: 0 };
    }
    
    try {
      const ethAmountWei = parseEther(ethAmount);
      const saleCap = BigInt(sale.saleCap);
      const netSold = BigInt(sale.netSold);
      const divisor = BigInt(sale.divisor);
      const quadCap = BigInt(sale.quadCap);
      
      // Calculate how many coins we can buy with this ETH amount
      // This matches the contract's buyForExactETH logic
      const currentCost = calculateCost(netSold, quadCap, divisor);
      const remaining = saleCap - netSold;
      
      // Binary search to find how many coins we can buy
      let lo = BigInt(0);
      let hi = remaining;
      
      while (lo < hi) {
        const mid = (lo + hi + BigInt(1)) / BigInt(2);
        const totalCost = calculateCost(netSold + mid, quadCap, divisor) - currentCost;
        if (totalCost <= ethAmountWei) {
          lo = mid;
        } else {
          hi = mid - BigInt(1);
        }
      }
      
      const expectedCoins = lo;
      
      // Calculate minimum coins with slippage
      const slippageMultiplier = 1 - slippage / 100;
      const minCoins = BigInt(Math.floor(Number(expectedCoins) * slippageMultiplier));
      
      // Calculate price impact
      const currentPrice = sale.currentPrice ? BigInt(sale.currentPrice) : BigInt(0);
      const avgPrice = expectedCoins > 0 ? ethAmountWei / expectedCoins : BigInt(0);
      const priceImpact = currentPrice > 0 
        ? Number((avgPrice - currentPrice) * BigInt(10000) / currentPrice) / 100
        : 0;
      
      return { expectedCoins, minCoins, priceImpact };
    } catch (error) {
      console.error("Error calculating output:", error);
      return { expectedCoins: BigInt(0), minCoins: BigInt(0), priceImpact: 0 };
    }
  }, [sale, ethAmount, slippage]);
  
  const handleBuy = async () => {
    if (!sale || !ethAmount || calculations.minCoins === BigInt(0)) return;
    
    try {
      setIsCalculating(true);
      
      // Use the contract's view function to get the exact output
      if (publicClient) {
        const coinsOut = await publicClient.readContract({
          address: zCurveAddress,
          abi: zCurveAbi,
          functionName: "coinsForETH",
          args: [BigInt(coinId), parseEther(ethAmount)],
        });
        
        if (coinsOut === BigInt(0)) {
          toast.error(t("trade.insufficient_liquidity", "Insufficient liquidity"));
          setIsCalculating(false);
          return;
        }
      }
      
      setIsCalculating(false);
      
      // Execute the buy
      writeContract({
        address: zCurveAddress,
        abi: zCurveAbi,
        functionName: "buyForExactETH",
        args: [BigInt(coinId), calculations.minCoins],
        value: parseEther(ethAmount),
      });
      
      toast.info(t("trade.buy_initiated", "Buy transaction initiated"));
    } catch (error) {
      setIsCalculating(false);
      console.error("Buy error:", error);
      
      if (isUserRejectionError(error)) {
        toast.error(t("trade.transaction_cancelled", "Transaction cancelled"));
      } else {
        const errorMessage = handleWalletError(error, { t });
        toast.error(errorMessage || t("trade.buy_failed", "Failed to buy tokens"));
      }
    }
  };
  
  const insufficientBalance = ethBalance && ethAmount && parseEther(ethAmount) > ethBalance.value;
  const saleExpired = sale && BigInt(sale.deadline) < BigInt(Math.floor(Date.now() / 1000));
  const saleFinalized = sale?.status === "FINALIZED";
  
  if (saleLoading) {
    return <div className="text-center py-8">{t("common.loading", "Loading...")}</div>;
  }
  
  if (!sale) {
    return null; // No zCurve sale for this coin
  }
  
  return (
    <div className="space-y-4">
      {/* Input */}
      <div className="space-y-2">
        <Label>{t("trade.you_pay", "You Pay")}</Label>
        <div className="relative">
          <Input
            type="number"
            placeholder="0.0"
            value={ethAmount}
            onChange={(e) => setEthAmount(e.target.value)}
            className="pr-16"
            disabled={saleFinalized || saleExpired}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium">
            ETH
          </div>
        </div>
        {ethBalance && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t("trade.balance", "Balance")}: {formatEther(ethBalance.value).slice(0, 8)} ETH</span>
            <button
              onClick={() => setEthAmount(formatEther(ethBalance.value))}
              className="text-primary hover:underline"
              disabled={saleFinalized || saleExpired}
            >
              {t("trade.max", "Max")}
            </button>
          </div>
        )}
      </div>
      
      {/* Output */}
      <div className="space-y-2">
        <Label>{t("trade.you_receive", "You Receive")}</Label>
        <div className="relative bg-muted rounded-lg p-3">
          <div className="flex items-center gap-2">
            {coinIcon && <TokenIcon src={coinIcon} symbol={coinSymbol} size="sm" />}
            <div className="flex-1">
              <div className="font-medium">
                {calculations.expectedCoins > 0 
                  ? formatEther(calculations.expectedCoins).slice(0, 12)
                  : "0.0"
                } {coinSymbol}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("trade.min_received", "Min")}: {formatEther(calculations.minCoins).slice(0, 12)}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Price Impact Warning */}
      {calculations.priceImpact > 5 && (
        <Alert variant="destructive">
          <AlertDescription>
            {t("trade.high_price_impact", "High price impact")}: {calculations.priceImpact.toFixed(2)}%
          </AlertDescription>
        </Alert>
      )}
      
      {/* Slippage Settings */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("trade.slippage_tolerance", "Slippage Tolerance")}</span>
          <span className="font-medium">{slippage}%</span>
        </div>
        <Slider
          value={[slippage]}
          onValueChange={([value]) => setSlippage(value)}
          min={0.1}
          max={5}
          step={0.1}
          disabled={saleFinalized || saleExpired}
        />
      </div>
      
      {/* User Balance */}
      {userBalance && BigInt(userBalance.balance) > 0 && (
        <div className="text-sm text-muted-foreground">
          {t("trade.your_balance", "Your balance")}: {formatEther(BigInt(userBalance.balance))} {coinSymbol}
        </div>
      )}
      
      {/* Sale Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t("trade.sale_progress", "Sale Progress")}</span>
          <span className="font-medium">{sale.percentFunded / 100}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all"
            style={{ width: `${sale.percentFunded / 100}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatEther(BigInt(sale.netSold))} {t("common.sold", "sold")}</span>
          <span>{formatEther(BigInt(sale.saleCap))} {t("common.cap", "cap")}</span>
        </div>
      </div>
      
      {/* Buy Button */}
      <Button
        onClick={handleBuy}
        disabled={
          !address ||
          isPending ||
          isCalculating ||
          saleFinalized ||
          saleExpired ||
          insufficientBalance ||
          !ethAmount ||
          parseFloat(ethAmount) <= 0 ||
          calculations.expectedCoins === BigInt(0)
        }
        className="w-full"
        size="lg"
      >
        {!address
          ? t("common.connect_wallet", "Connect Wallet")
          : isPending || isCalculating
          ? t("common.processing", "Processing...")
          : saleFinalized
          ? t("trade.sale_finalized", "Sale Finalized")
          : saleExpired
          ? t("trade.sale_expired", "Sale Expired")
          : insufficientBalance
          ? t("trade.insufficient_balance", "Insufficient Balance")
          : t("trade.buy", "Buy")}
      </Button>
      
      {/* Transaction Success */}
      {txSuccess && (
        <Alert className="border-green-200 bg-green-50">
          <AlertDescription className="text-green-800">
            {t("trade.buy_successful", "Purchase successful!")}
          </AlertDescription>
        </Alert>
      )}
      
      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}