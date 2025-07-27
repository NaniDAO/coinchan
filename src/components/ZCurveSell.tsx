import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, parseEther, type Address } from "viem";
import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TokenIcon } from "@/components/TokenIcon";

import { zCurveAbi, zCurveAddress } from "@/constants/zCurve";
import { useZCurveSale, useZCurveBalance } from "@/hooks/use-zcurve-sale";
import { handleWalletError, isUserRejectionError } from "@/lib/errors";

interface ZCurveSellProps {
  coinId: string;
  coinName?: string;
  coinSymbol?: string;
  coinIcon?: string;
}

export function ZCurveSell({ coinId, coinName, coinSymbol, coinIcon }: ZCurveSellProps) {
  const { t } = useTranslation();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  
  const [coinAmount, setCoinAmount] = useState("");
  const [slippage, setSlippage] = useState(1); // 1% default slippage
  const [isCalculating, setIsCalculating] = useState(false);
  
  const { data: sale, isLoading: saleLoading } = useZCurveSale(coinId);
  const { data: userBalance } = useZCurveBalance(coinId, address);
  
  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const { isSuccess: txSuccess, isLoading: txLoading } = useWaitForTransactionReceipt({ hash });
  
  // Calculate expected output and slippage
  const calculations = useMemo(() => {
    if (!sale || !coinAmount || parseFloat(coinAmount) <= 0) {
      return { expectedEth: BigInt(0), minEth: BigInt(0), priceImpact: 0 };
    }
    
    try {
      const coinAmountWei = parseEther(coinAmount);
      
      // Use the contract's view function for accurate calculation
      setIsCalculating(true);
      
      // We'll need to call the contract to get the exact refund amount
      // For now, we'll estimate based on current price
      const currentPrice = sale.currentPrice ? BigInt(sale.currentPrice) : BigInt(0);
      const expectedEth = currentPrice > 0 ? (coinAmountWei * currentPrice) / parseEther("1") : BigInt(0);
      
      // Calculate minimum ETH with slippage
      const slippageMultiplier = 1 - slippage / 100;
      const minEth = BigInt(Math.floor(Number(expectedEth) * slippageMultiplier));
      
      // Calculate price impact (simplified for sells)
      const priceImpact = 2; // Simplified - actual calculation would need to consider curve dynamics
      
      setIsCalculating(false);
      
      return { expectedEth, minEth, priceImpact };
    } catch (error) {
      console.error("Error calculating output:", error);
      setIsCalculating(false);
      return { expectedEth: BigInt(0), minEth: BigInt(0), priceImpact: 0 };
    }
  }, [sale, coinAmount, slippage]);
  
  // Get actual refund amount from contract
  const getRefundAmount = async () => {
    if (!publicClient || !coinAmount || !sale) return BigInt(0);
    
    try {
      const refund = await publicClient.readContract({
        address: zCurveAddress,
        abi: zCurveAbi,
        functionName: "sellRefund",
        args: [BigInt(coinId), parseEther(coinAmount)],
      });
      return refund;
    } catch (error) {
      console.error("Error getting refund amount:", error);
      return BigInt(0);
    }
  };
  
  const handleSell = async () => {
    if (!sale || !coinAmount || parseFloat(coinAmount) <= 0) return;
    
    try {
      setIsCalculating(true);
      
      // Get the actual refund amount
      const actualRefund = await getRefundAmount();
      
      if (actualRefund === BigInt(0)) {
        toast.error(t("trade.no_liquidity_for_sell", "No liquidity available for selling"));
        setIsCalculating(false);
        return;
      }
      
      // Calculate minimum with slippage
      const minEthOut = BigInt(Math.floor(Number(actualRefund) * (1 - slippage / 100)));
      
      setIsCalculating(false);
      
      // Execute the sell
      writeContract({
        address: zCurveAddress,
        abi: zCurveAbi,
        functionName: "sellExactCoins",
        args: [BigInt(coinId), parseEther(coinAmount), minEthOut],
      });
      
      toast.info(t("trade.sell_initiated", "Sell transaction initiated"));
    } catch (error) {
      setIsCalculating(false);
      console.error("Sell error:", error);
      
      if (isUserRejectionError(error)) {
        toast.error(t("trade.transaction_cancelled", "Transaction cancelled"));
      } else {
        const errorMessage = handleWalletError(error, { t });
        toast.error(errorMessage || t("trade.sell_failed", "Failed to sell tokens"));
      }
    }
  };
  
  const userBalanceAmount = userBalance ? BigInt(userBalance.balance) : BigInt(0);
  const insufficientBalance = coinAmount && parseEther(coinAmount) > userBalanceAmount;
  const saleExpired = sale && BigInt(sale.deadline) < BigInt(Math.floor(Date.now() / 1000));
  const saleFinalized = sale?.status === "FINALIZED";
  const noLiquidity = sale && BigInt(sale.ethEscrow) === BigInt(0);
  
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
        <Label>{t("trade.you_sell", "You Sell")}</Label>
        <div className="relative">
          <Input
            type="number"
            placeholder="0.0"
            value={coinAmount}
            onChange={(e) => setCoinAmount(e.target.value)}
            className="pr-20"
            disabled={saleFinalized}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {coinIcon && <TokenIcon src={coinIcon} symbol={coinSymbol} size="xs" />}
            <span className="text-sm font-medium">{coinSymbol}</span>
          </div>
        </div>
        {userBalance && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t("trade.balance", "Balance")}: {formatEther(userBalanceAmount).slice(0, 8)} {coinSymbol}</span>
            <button
              onClick={() => setCoinAmount(formatEther(userBalanceAmount))}
              className="text-primary hover:underline"
              disabled={saleFinalized}
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
          <div className="flex-1">
            <div className="font-medium">
              {calculations.expectedEth > 0 
                ? formatEther(calculations.expectedEth).slice(0, 8)
                : "0.0"
              } ETH
            </div>
            <div className="text-xs text-muted-foreground">
              {t("trade.min_received", "Min")}: {formatEther(calculations.minEth).slice(0, 8)} ETH
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
          disabled={saleFinalized}
        />
      </div>
      
      {/* Sale Info */}
      <div className="space-y-1 text-sm text-muted-foreground">
        <div className="flex justify-between">
          <span>{t("trade.eth_in_escrow", "ETH in Escrow")}</span>
          <span>{formatEther(BigInt(sale.ethEscrow))} ETH</span>
        </div>
        <div className="flex justify-between">
          <span>{t("trade.current_price", "Current Price")}</span>
          <span>{sale.currentPrice ? formatEther(BigInt(sale.currentPrice)).slice(0, 10) : "0"} ETH</span>
        </div>
      </div>
      
      {/* Sell Button */}
      <Button
        onClick={handleSell}
        disabled={
          !address ||
          isPending ||
          isCalculating ||
          saleFinalized ||
          insufficientBalance ||
          noLiquidity ||
          !coinAmount ||
          parseFloat(coinAmount) <= 0 ||
          calculations.expectedEth === BigInt(0)
        }
        className="w-full"
        size="lg"
        variant="destructive"
      >
        {!address
          ? t("common.connect_wallet", "Connect Wallet")
          : isPending || isCalculating
          ? t("common.processing", "Processing...")
          : saleFinalized
          ? t("trade.sale_finalized", "Sale Finalized")
          : insufficientBalance
          ? t("trade.insufficient_balance", "Insufficient Balance")
          : noLiquidity
          ? t("trade.no_liquidity", "No Liquidity")
          : t("trade.sell", "Sell")}
      </Button>
      
      {/* Transaction Success */}
      {txSuccess && (
        <Alert className="border-green-200 bg-green-50">
          <AlertDescription className="text-green-800">
            {t("trade.sell_successful", "Sale successful!")}
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