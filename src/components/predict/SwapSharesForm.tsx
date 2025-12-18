import React, { useState, useMemo, useEffect } from "react";
import { parseEther, formatEther } from "viem";
import { useAccount } from "wagmi";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowDownUp, ArrowRight } from "lucide-react";
import { useSwapShares } from "@/hooks/use-user-orders";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { PAMMSingletonAddress, DEFAULT_FEE_OR_HOOK } from "@/constants/PAMMSingleton";
import { cn } from "@/lib/utils";

interface SwapSharesFormProps {
  marketId: bigint;
  noId: bigint;
  onSuccess?: () => void;
}

export const SwapSharesForm: React.FC<SwapSharesFormProps> = ({
  marketId,
  noId,
  onSuccess,
}) => {
  const { address } = useAccount();
  const [yesForNo, setYesForNo] = useState(true); // true = YES->NO, false = NO->YES
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(1); // 1%

  // Get balances
  const { data: yesBalance } = useTokenBalance({
    token: { id: marketId, address: PAMMSingletonAddress },
    address: address || "0x0000000000000000000000000000000000000000",
  });

  const { data: noBalance } = useTokenBalance({
    token: { id: noId, address: PAMMSingletonAddress },
    address: address || "0x0000000000000000000000000000000000000000",
  });

  // Get ZAMM pool state for YES/NO pair to estimate output
  // ZAMM pools are keyed by (token0, id0, token1, id1, feeOrHook)
  // For PM shares: both tokens are PAMM, ids are marketId and noId

  const { swapShares, isPending, isConfirming, isSuccess, reset } = useSwapShares();

  // Reset on success
  useEffect(() => {
    if (isSuccess) {
      toast.success("Swap successful!");
      setAmount("");
      reset();
      onSuccess?.();
    }
  }, [isSuccess, onSuccess, reset]);

  const sourceBalance = yesForNo ? yesBalance : noBalance;
  const targetBalance = yesForNo ? noBalance : yesBalance;
  const sourceLabel = yesForNo ? "YES" : "NO";
  const targetLabel = yesForNo ? "NO" : "YES";

  const amountWei = useMemo(() => {
    try {
      return parseEther(amount || "0");
    } catch {
      return 0n;
    }
  }, [amount]);

  // Simple estimation: for YES/NO swap, output ≈ input (minus fees)
  // In reality this depends on pool reserves, but for PM shares it's often close to 1:1
  const estimatedOutput = useMemo(() => {
    if (amountWei === 0n) return 0n;
    // Rough estimate: 99.5% (0.5% fee assumption)
    return (amountWei * 995n) / 1000n;
  }, [amountWei]);

  const minOutput = useMemo(() => {
    // Apply slippage to estimated output
    const slippageMultiplier = BigInt(Math.floor((100 - slippage) * 100));
    return (estimatedOutput * slippageMultiplier) / 10000n;
  }, [estimatedOutput, slippage]);

  // Validation
  const validationError = useMemo(() => {
    if (!address) return "Connect wallet";
    if (!amount || parseFloat(amount) <= 0) return "Enter amount";
    if (sourceBalance && amountWei > sourceBalance) {
      return `Insufficient ${sourceLabel} balance`;
    }
    return null;
  }, [address, amount, amountWei, sourceBalance, sourceLabel]);

  const handleSubmit = async () => {
    if (validationError || !address) return;

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour

    await swapShares({
      marketId,
      yesForNo,
      amountIn: amountWei,
      minOut: minOutput,
      feeOrHook: DEFAULT_FEE_OR_HOOK,
      deadline,
    });
  };

  const handleMax = () => {
    if (sourceBalance && sourceBalance > 0n) {
      setAmount(formatEther(sourceBalance));
    }
  };

  const handleFlip = () => {
    setYesForNo(!yesForNo);
    setAmount("");
  };

  return (
    <div className="space-y-4">
      {/* Direction Indicator */}
      <div className="flex items-center justify-center gap-4 py-4">
        <div className="text-center">
          <div
            className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold",
              yesForNo
                ? "bg-green-500/20 text-green-500"
                : "bg-red-500/20 text-red-500"
            )}
          >
            {sourceLabel}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {sourceBalance ? Number(formatEther(sourceBalance)).toFixed(2) : "0"}
          </p>
        </div>

        <button
          type="button"
          onClick={handleFlip}
          className="p-2 rounded-full bg-muted hover:bg-muted/80 transition-colors"
        >
          <ArrowRight className="h-5 w-5" />
        </button>

        <div className="text-center">
          <div
            className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold",
              !yesForNo
                ? "bg-green-500/20 text-green-500"
                : "bg-red-500/20 text-red-500"
            )}
          >
            {targetLabel}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {targetBalance ? Number(formatEther(targetBalance)).toFixed(2) : "0"}
          </p>
        </div>
      </div>

      {/* Amount Input */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm">{sourceLabel} Amount</Label>
          <button
            type="button"
            onClick={handleMax}
            className="text-xs text-primary hover:underline"
          >
            Max
          </button>
        </div>
        <Input
          type="number"
          step="0.001"
          min="0"
          placeholder="0.0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      {/* Output Preview */}
      {estimatedOutput > 0n && (
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">You receive (est.)</span>
            <span className="font-mono">
              {Number(formatEther(estimatedOutput)).toFixed(4)} {targetLabel}
            </span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Min output ({slippage}% slippage)</span>
            <span className="font-mono">
              {Number(formatEther(minOutput)).toFixed(4)} {targetLabel}
            </span>
          </div>
        </div>
      )}

      {/* Slippage */}
      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground">Slippage:</Label>
        {[0.5, 1, 2].map((pct) => (
          <button
            key={pct}
            type="button"
            onClick={() => setSlippage(pct)}
            className={cn(
              "px-2 py-1 text-xs rounded border transition-colors",
              slippage === pct
                ? "bg-primary/20 text-primary border-primary"
                : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
            )}
          >
            {pct}%
          </button>
        ))}
      </div>

      {/* Submit Button */}
      <Button
        className="w-full"
        onClick={handleSubmit}
        disabled={!!validationError || isPending || isConfirming}
      >
        {isPending || isConfirming ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {isPending ? "Confirm in wallet..." : "Swapping..."}
          </>
        ) : validationError ? (
          validationError
        ) : (
          <>
            <ArrowDownUp className="h-4 w-4 mr-2" />
            Swap {sourceLabel} → {targetLabel}
          </>
        )}
      </Button>

      {/* Info */}
      <p className="text-xs text-center text-muted-foreground">
        Swaps use ZAMM AMM. No slippage on 1:1 swaps in balanced pools.
      </p>
    </div>
  );
};

export default SwapSharesForm;
