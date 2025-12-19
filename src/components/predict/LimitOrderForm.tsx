import React, { useState, useMemo, useEffect } from "react";
import { parseEther, formatEther } from "viem";
import { useAccount, useBalance } from "wagmi";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { usePlaceOrder } from "@/hooks/use-user-orders";
import { useMarketOrderbook } from "@/hooks/use-market-orderbook";
import { OrderbookPreview } from "./OrderbookDisplay";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { PAMMSingletonAddress } from "@/constants/PAMMSingleton";
import { cn } from "@/lib/utils";

interface LimitOrderFormProps {
  marketId: bigint;
  isYes: boolean;
  noId: bigint;
  onSuccess?: () => void;
}

export const LimitOrderForm: React.FC<LimitOrderFormProps> = ({
  marketId,
  isYes,
  noId,
  onSuccess,
}) => {
  const { address } = useAccount();
  const [isBuy, setIsBuy] = useState(true);
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState(""); // Shares for sell, ETH for buy
  const [partialFill, setPartialFill] = useState(true);
  const [deadlineDays, setDeadlineDays] = useState(7);

  // Balances
  const { data: ethBalance } = useBalance({ address });
  const tokenId = isYes ? marketId : noId;
  const { data: shareBalance } = useTokenBalance({
    token: { id: tokenId, address: PAMMSingletonAddress },
    address: address || "0x0000000000000000000000000000000000000000",
  });

  // Orderbook
  const { orderbook, isLoading: isOrderbookLoading } = useMarketOrderbook({
    marketId,
    isYes,
    enabled: true,
  });

  // Place order hook
  const { placeOrder, isPending, isConfirming, isSuccess, reset } = usePlaceOrder();

  // Reset form on success
  useEffect(() => {
    if (isSuccess) {
      toast.success("Limit order placed!");
      setPrice("");
      setAmount("");
      reset();
      onSuccess?.();
    }
  }, [isSuccess, onSuccess, reset]);

  // Calculate shares and collateral from inputs
  const { shares, collateral, estimatedTotal } = useMemo(() => {
    const priceNum = parseFloat(price) || 0;
    const amountNum = parseFloat(amount) || 0;

    if (priceNum <= 0 || amountNum <= 0) {
      return { shares: 0n, collateral: 0n, estimatedTotal: 0 };
    }

    if (isBuy) {
      // Buying: amount is ETH, calculate shares
      // shares = collateral / price
      const collateralWei = parseEther(amount);
      const sharesNum = amountNum / priceNum;
      const sharesWei = parseEther(sharesNum.toString());
      return {
        shares: sharesWei,
        collateral: collateralWei,
        estimatedTotal: sharesNum,
      };
    } else {
      // Selling: amount is shares, calculate collateral
      // collateral = shares * price
      const sharesWei = parseEther(amount);
      const collateralNum = amountNum * priceNum;
      const collateralWei = parseEther(collateralNum.toString());
      return {
        shares: sharesWei,
        collateral: collateralWei,
        estimatedTotal: collateralNum,
      };
    }
  }, [price, amount, isBuy]);

  // Validation
  const validationError = useMemo(() => {
    if (!address) return "Connect wallet";
    if (!price || parseFloat(price) <= 0) return "Enter price";
    if (parseFloat(price) >= 1) return "Price must be < 1 (shares pay 1 if win)";
    if (!amount || parseFloat(amount) <= 0) return "Enter amount";

    if (isBuy) {
      // Check ETH balance
      if (ethBalance && collateral > ethBalance.value) {
        return "Insufficient ETH balance";
      }
    } else {
      // Check share balance
      if (shareBalance && shares > shareBalance) {
        return "Insufficient share balance";
      }
    }

    return null;
  }, [address, price, amount, isBuy, ethBalance, shareBalance, collateral, shares]);

  const handleSubmit = async () => {
    if (validationError || !address) return;

    // Calculate deadline (days from now)
    const deadlineTimestamp = BigInt(Math.floor(Date.now() / 1000) + deadlineDays * 86400);

    await placeOrder({
      marketId,
      isYes,
      isBuy,
      shares,
      collateral,
      deadline: deadlineTimestamp,
      partialFill,
    });
  };

  const handleSelectPrice = (selectedPrice: number) => {
    setPrice(selectedPrice.toFixed(6));
  };

  const handleMax = () => {
    if (isBuy) {
      // Max ETH (leave some for gas)
      if (ethBalance && ethBalance.value > parseEther("0.001")) {
        const maxEth = ethBalance.value - parseEther("0.001");
        setAmount(formatEther(maxEth));
      }
    } else {
      // Max shares
      if (shareBalance && shareBalance > 0n) {
        setAmount(formatEther(shareBalance));
      }
    }
  };

  const sideLabel = isYes ? "YES" : "NO";

  return (
    <div className="space-y-4">
      {/* Buy/Sell Toggle */}
      <div className="flex rounded-lg border border-border overflow-hidden">
        <button
          type="button"
          onClick={() => setIsBuy(true)}
          className={cn(
            "flex-1 py-2 text-sm font-medium transition-colors",
            isBuy
              ? "bg-green-500/20 text-green-500 border-green-500"
              : "bg-transparent text-muted-foreground hover:bg-muted/50"
          )}
        >
          Buy {sideLabel}
        </button>
        <button
          type="button"
          onClick={() => setIsBuy(false)}
          className={cn(
            "flex-1 py-2 text-sm font-medium transition-colors",
            !isBuy
              ? "bg-red-500/20 text-red-500 border-red-500"
              : "bg-transparent text-muted-foreground hover:bg-muted/50"
          )}
        >
          Sell {sideLabel}
        </button>
      </div>

      {/* Orderbook Preview */}
      <div className="p-2 rounded-lg bg-muted/30">
        <OrderbookPreview
          orderbook={orderbook}
          isLoading={isOrderbookLoading}
          isBuy={isBuy}
          onSelectPrice={handleSelectPrice}
        />
      </div>

      {/* Price Input */}
      <div className="space-y-2">
        <Label className="text-sm">Price per share (ETH)</Label>
        <Input
          type="number"
          step="0.0001"
          min="0"
          max="0.9999"
          placeholder="0.50"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Shares pay 1 ETH if they win. Price = probability.
        </p>
      </div>

      {/* Amount Input */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm">
            {isBuy ? "Amount (ETH)" : `Shares to sell`}
          </Label>
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
          placeholder={isBuy ? "0.1" : "100"}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        {isBuy ? (
          <p className="text-xs text-muted-foreground">
            Balance: {ethBalance ? Number(formatEther(ethBalance.value)).toFixed(4) : "0"} ETH
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Balance: {shareBalance ? Number(formatEther(shareBalance)).toFixed(4) : "0"} {sideLabel}
          </p>
        )}
      </div>

      {/* Estimated Output */}
      {estimatedTotal > 0 && (
        <div className="p-3 rounded-lg bg-muted/50 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {isBuy ? "Est. Shares" : "Est. ETH"}
            </span>
            <span className="font-mono">
              {estimatedTotal.toFixed(4)} {isBuy ? sideLabel : "ETH"}
            </span>
          </div>
          {isBuy && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">If you win</span>
              <span className="font-mono text-green-500">
                +{(estimatedTotal - parseFloat(amount || "0")).toFixed(4)} ETH
              </span>
            </div>
          )}
        </div>
      )}

      {/* Options */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            checked={partialFill}
            onCheckedChange={setPartialFill}
            id="partial-fill"
          />
          <Label htmlFor="partial-fill" className="text-sm cursor-pointer">
            Allow partial fills
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Expires:</Label>
          <select
            value={deadlineDays}
            onChange={(e) => setDeadlineDays(Number(e.target.value))}
            className="text-sm bg-transparent border border-border rounded px-2 py-1"
          >
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>
      </div>

      {/* Submit Button */}
      <Button
        className="w-full"
        variant={isBuy ? "default" : "destructive"}
        onClick={handleSubmit}
        disabled={!!validationError || isPending || isConfirming}
      >
        {isPending || isConfirming ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {isPending ? "Confirm in wallet..." : "Placing order..."}
          </>
        ) : validationError ? (
          validationError
        ) : (
          <>
            {isBuy ? "Place Buy Order" : "Place Sell Order"}
          </>
        )}
      </Button>
    </div>
  );
};

export default LimitOrderForm;
