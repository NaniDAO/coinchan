import React, { useState } from "react";
import { parseEther, formatEther } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { toast } from "sonner";
import { PredictionMarketAddress, PredictionMarketAbi } from "@/constants/PredictionMarket";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  marketId: bigint;
  marketName: string;
  yesSupply: bigint;
  noSupply: bigint;
}

export const TradeModal: React.FC<TradeModalProps> = ({
  isOpen,
  onClose,
  marketId,
  marketName,
  yesSupply,
  noSupply,
}) => {
  const { address } = useAccount();
  const [action, setAction] = useState<"buy" | "sell">("buy");
  const [position, setPosition] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("");

  const {
    writeContractAsync,
    data: hash,
    isPending,
    error: writeError,
  } = useWriteContract();

  const { isSuccess: txSuccess, isLoading: txLoading } = useWaitForTransactionReceipt({ hash });

  React.useEffect(() => {
    if (txSuccess) {
      toast.success("Transaction confirmed!");
      setAmount("");
      setTimeout(() => {
        onClose();
      }, 2000);
    }
  }, [txSuccess, onClose]);

  const handleTrade = async () => {
    if (!address) {
      toast.error("Please connect your wallet");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    try {
      const amountWei = parseEther(amount);

      if (action === "buy") {
        const functionName = position === "yes" ? "buyYes" : "buyNo";
        await writeContractAsync({
          address: PredictionMarketAddress as `0x${string}`,
          abi: PredictionMarketAbi,
          functionName,
          args: [marketId, 0n, address],
          value: amountWei,
        });
      } else {
        const functionName = position === "yes" ? "sellYes" : "sellNo";
        await writeContractAsync({
          address: PredictionMarketAddress as `0x${string}`,
          abi: PredictionMarketAbi,
          functionName,
          args: [marketId, amountWei, address],
        });
      }

      toast.success("Transaction submitted");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.shortMessage ?? err?.message ?? "Transaction failed");
    }
  };

  const totalSupply = yesSupply + noSupply;
  const yesPercent = totalSupply > 0n ? Number((yesSupply * 100n) / totalSupply) : 50;
  const noPercent = 100 - yesPercent;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{marketName}</DialogTitle>
          <DialogDescription>Trade shares in this prediction market</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Odds Display */}
          <div className="bg-muted rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-green-600 dark:text-green-400 font-bold">
                YES {yesPercent.toFixed(1)}%
              </span>
              <span className="text-red-600 dark:text-red-400 font-bold">
                NO {noPercent.toFixed(1)}%
              </span>
            </div>
            <div className="flex h-3 rounded-full overflow-hidden bg-background">
              <div
                className="bg-green-600 dark:bg-green-400"
                style={{ width: `${yesPercent}%` }}
              />
              <div
                className="bg-red-600 dark:bg-red-400"
                style={{ width: `${noPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatEther(yesSupply)} wstETH</span>
              <span>{formatEther(noSupply)} wstETH</span>
            </div>
          </div>

          {/* Trade Interface */}
          <Tabs value={action} onValueChange={(v) => setAction(v as "buy" | "sell")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="buy">Buy</TabsTrigger>
              <TabsTrigger value="sell">Sell</TabsTrigger>
            </TabsList>

            <TabsContent value="buy" className="space-y-4">
              <div className="grid gap-2">
                <Label>Position</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={position === "yes" ? "default" : "outline"}
                    onClick={() => setPosition("yes")}
                    className={position === "yes" ? "bg-green-600 hover:bg-green-700" : ""}
                  >
                    YES
                  </Button>
                  <Button
                    variant={position === "no" ? "default" : "outline"}
                    onClick={() => setPosition("no")}
                    className={position === "no" ? "bg-red-600 hover:bg-red-700" : ""}
                  >
                    NO
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="amount">Amount (ETH)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.001"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.1"
                />
                <p className="text-xs text-muted-foreground">
                  Buy {position.toUpperCase()} shares with ETH
                </p>
              </div>
            </TabsContent>

            <TabsContent value="sell" className="space-y-4">
              <div className="grid gap-2">
                <Label>Position</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={position === "yes" ? "default" : "outline"}
                    onClick={() => setPosition("yes")}
                    className={position === "yes" ? "bg-green-600 hover:bg-green-700" : ""}
                  >
                    YES
                  </Button>
                  <Button
                    variant={position === "no" ? "default" : "outline"}
                    onClick={() => setPosition("no")}
                    className={position === "no" ? "bg-red-600 hover:bg-red-700" : ""}
                  >
                    NO
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="sell-amount">Amount (wstETH shares)</Label>
                <Input
                  id="sell-amount"
                  type="number"
                  step="0.001"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.1"
                />
                <p className="text-xs text-muted-foreground">
                  Sell your {position.toUpperCase()} shares for wstETH
                </p>
              </div>
            </TabsContent>
          </Tabs>

          {writeError && (
            <Alert tone="destructive">
              <AlertDescription className="break-words text-sm">
                {writeError.message}
              </AlertDescription>
            </Alert>
          )}

          {txLoading && (
            <Alert>
              <AlertDescription>Transaction is being confirmed…</AlertDescription>
            </Alert>
          )}

          {txSuccess && (
            <Alert>
              <AlertDescription className="text-green-600 dark:text-green-400">
                Trade successful!
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleTrade}
              disabled={isPending || txLoading || !address}
              className="flex-1"
            >
              {isPending || txLoading
                ? "Processing…"
                : `${action === "buy" ? "Buy" : "Sell"} ${position.toUpperCase()}`}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={isPending || txLoading}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
