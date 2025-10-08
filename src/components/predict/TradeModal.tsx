import React, { useState, useEffect } from "react";
import { parseEther, formatEther, maxUint256 } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { toast } from "sonner";
import { PredictionMarketAddress, PredictionMarketAbi } from "@/constants/PredictionMarket";
import { PredictionAMMAbi } from "@/constants/PredictionMarketAMM";
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
import { Slider } from "@/components/ui/slider";

interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  marketId: bigint;
  marketName: string;
  yesSupply: bigint;
  noSupply: bigint;
  marketType?: "parimutuel" | "amm";
  contractAddress?: string;
}

export const TradeModal: React.FC<TradeModalProps> = ({
  isOpen,
  onClose,
  marketId,
  marketName,
  yesSupply,
  noSupply,
  marketType = "parimutuel",
  contractAddress = PredictionMarketAddress,
}) => {
  const { address } = useAccount();
  const [action, setAction] = useState<"buy" | "sell">("buy");
  const [position, setPosition] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("");
  const [slippageTolerance, setSlippageTolerance] = useState(0.5); // 0.5% default

  const {
    writeContractAsync,
    data: hash,
    isPending,
    error: writeError,
  } = useWriteContract();

  const { isSuccess: txSuccess, isLoading: txLoading } = useWaitForTransactionReceipt({ hash });

  // Quote for AMM buy trades
  const sharesAmount = amount && parseFloat(amount) > 0 ? parseEther(amount) : 0n;

  const { data: quoteData } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: PredictionAMMAbi,
    functionName: action === "buy"
      ? (position === "yes" ? "quoteBuyYes" : "quoteBuyNo")
      : (position === "yes" ? "quoteSellYes" : "quoteSellNo"),
    args: [marketId, sharesAmount],
    query: {
      enabled: marketType === "amm" && sharesAmount > 0n,
    },
  });

  const estimatedCost = quoteData ? quoteData[1] : 0n; // wstInFair or wstOutFair
  const oppIn = quoteData ? quoteData[0] : 0n; // oppIn or oppOut

  // For AMM markets, fetch pool reserves to show live odds
  const { data: ammPoolData } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: PredictionAMMAbi,
    functionName: "getPool",
    args: [marketId],
    query: {
      enabled: marketType === "amm",
    },
  });

  // Extract reserves: [poolId, rYes, rNo, tsLast, kLast, lpSupply]
  const rYes = ammPoolData ? ammPoolData[1] : 0n;
  const rNo = ammPoolData ? ammPoolData[2] : 0n;

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

      if (marketType === "amm") {
        // AMM market trading
        if (action === "buy") {
          // For AMM buy: amount is shares to buy, we pay with ETH
          const slippageMultiplier = BigInt(Math.floor((1 + slippageTolerance / 100) * 10000));
          const wstInMax = (estimatedCost * slippageMultiplier) / 10000n;
          const oppInMax = (oppIn * slippageMultiplier) / 10000n;

          // Add 40% buffer to wstInMax for ETH→wstETH conversion (wstETH worth ~1.18 ETH)
          const ethValue = (wstInMax * 14n) / 10n;

          const functionName = position === "yes" ? "buyYesViaPool" : "buyNoViaPool";
          await writeContractAsync({
            address: contractAddress as `0x${string}`,
            abi: PredictionAMMAbi,
            functionName,
            args: [
              marketId,
              amountWei,    // yesOut or noOut (shares to buy)
              true,         // inIsETH
              wstInMax,     // wstInMax (slippage protection)
              oppInMax,     // oppInMax (slippage protection)
              address,      // to
            ],
            value: ethValue,
          });
        } else {
          // For AMM sell: amount is shares to sell
          const slippageMultiplier = BigInt(Math.floor((1 - slippageTolerance / 100) * 10000));
          const wstOutMin = (estimatedCost * slippageMultiplier) / 10000n;
          const oppOutMin = (oppIn * slippageMultiplier) / 10000n;

          const functionName = position === "yes" ? "sellYesViaPool" : "sellNoViaPool";
          await writeContractAsync({
            address: contractAddress as `0x${string}`,
            abi: PredictionAMMAbi,
            functionName,
            args: [
              marketId,
              amountWei,    // yesIn or noIn (shares to sell)
              wstOutMin,    // wstOutMin (slippage protection)
              oppOutMin,    // oppOutMin (slippage protection)
              address,      // to
            ],
          });
        }
      } else {
        // Parimutuel market trading
        if (action === "buy") {
          const functionName = position === "yes" ? "buyYes" : "buyNo";
          await writeContractAsync({
            address: contractAddress as `0x${string}`,
            abi: PredictionMarketAbi,
            functionName,
            args: [marketId, 0n, address],
            value: amountWei,
          });
        } else {
          const functionName = position === "yes" ? "sellYes" : "sellNo";
          await writeContractAsync({
            address: contractAddress as `0x${string}`,
            abi: PredictionMarketAbi,
            functionName,
            args: [marketId, amountWei, address],
          });
        }
      }

      toast.success("Transaction submitted");
    } catch (err: any) {
      console.error(err);

      // Handle wallet rejection gracefully
      if (err?.code === 4001 || err?.code === "ACTION_REJECTED") {
        toast.info("Transaction cancelled");
        return;
      }

      // Handle user rejection messages
      const errorMessage = err?.shortMessage ?? err?.message ?? "";
      if (
        errorMessage.toLowerCase().includes("user rejected") ||
        errorMessage.toLowerCase().includes("user denied") ||
        errorMessage.toLowerCase().includes("user cancelled") ||
        errorMessage.toLowerCase().includes("rejected by user")
      ) {
        toast.info("Transaction cancelled");
        return;
      }

      // Other errors
      toast.error(errorMessage || "Transaction failed");
    }
  };

  // For AMM markets, use pool reserves for odds; for parimutuel, use total supply
  const useYes = marketType === "amm" && rYes > 0n ? rYes : yesSupply;
  const useNo = marketType === "amm" && rNo > 0n ? rNo : noSupply;

  const totalSupply = useYes + useNo;
  const yesPercent = totalSupply > 0n ? Number((useYes * 100n) / totalSupply) : 50;
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
                YES {yesPercent.toFixed(2)}%
              </span>
              <span className="text-red-600 dark:text-red-400 font-bold">
                NO {noPercent.toFixed(2)}%
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
              <span>{formatEther(useYes)} wstETH</span>
              <span>{formatEther(useNo)} wstETH</span>
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
                <Label htmlFor="amount">
                  {marketType === "amm" ? "Shares to Buy" : "Amount (ETH)"}
                </Label>
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
                  {marketType === "amm"
                    ? `Enter number of ${position.toUpperCase()} shares to buy`
                    : `Buy ${position.toUpperCase()} shares with ETH`
                  }
                </p>
              </div>

              {marketType === "amm" && estimatedCost > 0n && (
                <div className="bg-muted rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Estimated Cost:</span>
                    <span className="font-mono font-semibold">
                      {Number(formatEther(estimatedCost)).toFixed(6)} wstETH
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Cost (with slippage):</span>
                    <span className="font-mono text-xs">
                      {Number(formatEther((estimatedCost * BigInt(Math.floor((1 + slippageTolerance / 100) * 10000))) / 10000n)).toFixed(6)} wstETH
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ETH to send:</span>
                    <span className="font-mono">
                      {Number(formatEther((estimatedCost * BigInt(Math.floor((1 + slippageTolerance / 100) * 10000)) * 14n) / 100000n)).toFixed(6)} ETH
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground italic">
                    Extra ETH will be refunded. Includes conversion buffer.
                  </p>
                </div>
              )}

              {marketType === "amm" && (
                <div className="grid gap-2">
                  <Label htmlFor="slippage">
                    Slippage Tolerance: {slippageTolerance}%
                  </Label>
                  <Slider
                    id="slippage"
                    min={0.1}
                    max={5}
                    step={0.1}
                    value={[slippageTolerance]}
                    onValueChange={(value) => setSlippageTolerance(value[0])}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0.1%</span>
                    <span>5%</span>
                  </div>
                </div>
              )}
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
                <Label htmlFor="sell-amount">
                  {marketType === "amm" ? "Shares to Sell" : "Amount (wstETH shares)"}
                </Label>
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

              {marketType === "amm" && estimatedCost > 0n && (
                <div className="bg-muted rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Estimated Payout:</span>
                    <span className="font-mono font-semibold">
                      {Number(formatEther(estimatedCost)).toFixed(6)} wstETH
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground italic">
                    Payout may vary due to price impact and slippage.
                  </p>
                </div>
              )}

              {marketType === "amm" && (
                <div className="grid gap-2">
                  <Label htmlFor="slippage-sell">
                    Slippage Tolerance: {slippageTolerance}%
                  </Label>
                  <Slider
                    id="slippage-sell"
                    min={0.1}
                    max={5}
                    step={0.1}
                    value={[slippageTolerance]}
                    onValueChange={(value) => setSlippageTolerance(value[0])}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0.1%</span>
                    <span>5%</span>
                  </div>
                </div>
              )}
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
