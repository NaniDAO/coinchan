import { useState } from "react";
import { useTranslation } from "react-i18next";
import { parseEther } from "viem";
import { useAccount, useBalance, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { toast } from "sonner";
import { Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { zCurveAbi, zCurveAddress } from "@/constants/zCurve";
import { handleWalletError, isUserRejectionError } from "@/lib/errors";
import { UNIT_SCALE } from "@/lib/zCurveHelpers";
import { cn } from "@/lib/utils";

interface ApeButtonProps {
  coinId: string;
  coinSymbol?: string;
  className?: string;
  onSuccess?: () => void;
}

// Helper to quantize values to UNIT_SCALE
const quantizeToUnitScale = (value: bigint): bigint => {
  return (value / UNIT_SCALE) * UNIT_SCALE;
};

export function ApeButton({ coinId, coinSymbol = "TOKEN", className, onSuccess }: ApeButtonProps) {
  const { t } = useTranslation();
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: ethBalance } = useBalance({ address });
  const [isCalculating, setIsCalculating] = useState(false);

  // Transaction state
  const { data: hash, isPending, writeContract } = useWriteContract();
  const { isSuccess: txSuccess } = useWaitForTransactionReceipt({ 
    hash,
    onReplaced: () => {
      toast.success(t("trade.transaction_success", "Trade successful!"));
      onSuccess?.();
    },
  });

  // Handle successful transaction
  if (txSuccess && hash) {
    toast.success(t("trade.transaction_success", "Trade successful!"));
    onSuccess?.();
  }

  const handleQuickBuy = async () => {
    if (!address || !publicClient) return;

    const BUY_AMOUNT = parseEther("0.01"); // Always buy 0.01 ETH worth
    const SLIPPAGE_BPS = 1000n; // 10% slippage

    // Check balance
    if (!ethBalance || ethBalance.value < BUY_AMOUNT) {
      toast.error(t("trade.insufficient_eth_for_quick_buy", "Insufficient ETH balance"));
      return;
    }

    setIsCalculating(true);
    
    try {
      // Calculate expected output
      const expectedCoins = await publicClient.readContract({
        address: zCurveAddress,
        abi: zCurveAbi,
        functionName: "coinsForETH",
        args: [BigInt(coinId), BUY_AMOUNT],
      });

      // Apply slippage (90% of expected with 10% slippage)
      const slippageMultiplier = 10000n - SLIPPAGE_BPS;
      let minCoins = (expectedCoins * slippageMultiplier) / 10000n;

      // Quantize to UNIT_SCALE
      minCoins = quantizeToUnitScale(minCoins);

      // Ensure minCoins is at least UNIT_SCALE to avoid NoWant error
      if (minCoins > 0n && minCoins < UNIT_SCALE) {
        minCoins = UNIT_SCALE;
      }

      // Execute buy
      writeContract({
        address: zCurveAddress,
        abi: zCurveAbi,
        functionName: "buyForExactETH",
        args: [BigInt(coinId), minCoins],
        value: BUY_AMOUNT,
      });

      toast.info(t("trade.quick_buy_initiated", { symbol: coinSymbol }));
    } catch (error) {
      console.error("Quick buy error:", error);
      if (!isUserRejectionError(error)) {
        toast.error(handleWalletError(error));
      }
    } finally {
      setIsCalculating(false);
    }
  };

  if (!isConnected) {
    return null; // Don't show button if not connected
  }

  return (
    <Button
      onClick={handleQuickBuy}
      disabled={isPending || isCalculating || !ethBalance || ethBalance.value < parseEther("0.01")}
      size="sm"
      variant="secondary"
      className={cn(
        "group relative overflow-hidden transition-all",
        "bg-gradient-to-r from-purple-500/10 to-pink-500/10",
        "hover:from-purple-500/20 hover:to-pink-500/20",
        "border-purple-500/20 hover:border-purple-500/40",
        className
      )}
    >
      <span className="relative z-10 flex items-center gap-1.5">
        <Zap className="h-3.5 w-3.5" />
        <span className="font-mono text-xs font-bold">
          {isPending ? t("trade.buying", "BUYING...") : t("trade.quick_buy", "BUY 0.01Ξ")}
        </span>
      </span>
      
      {/* Animated background */}
      <div className="absolute inset-0 -translate-x-full group-hover:translate-x-0 transition-transform duration-300 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </Button>
  );
}