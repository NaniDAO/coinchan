import React, { useState } from "react";
import { parseEther, formatEther } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { toast } from "sonner";
import { PredictionMarketAddress, PredictionMarketAbi } from "@/constants/PredictionMarket";
import { PredictionAMMAbi } from "@/constants/PredictionMarketAMM";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";
import { BadgeCheck } from "lucide-react";
import { isPerpetualOracleResolver } from "@/constants/TrustedResolvers";
import { isUserRejectionError } from "@/lib/errors";

// wstETH contract address
const WSTETH_ADDRESS = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0" as const;

// Minimal ABI for wstETH stEthPerToken function
const WSTETH_ABI = [
  {
    inputs: [],
    name: "stEthPerToken",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  marketId: bigint;
  marketName: string;
  yesSupply: bigint;
  noSupply: bigint;
  marketType?: "parimutuel" | "amm";
  contractAddress?: string;
  resolver?: string; // Optional: resolver address to show verification badge
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
  resolver,
}) => {
  const isPerpetualOracle = resolver ? isPerpetualOracleResolver(resolver) : false;
  const { address } = useAccount();
  const [action, setAction] = useState<"buy" | "sell">("buy");
  const [position, setPosition] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("");
  const [slippageTolerance, setSlippageTolerance] = useState(10); // 10% default for AMM markets
  const [localError, setLocalError] = useState<string | null>(null);

  const { writeContractAsync, data: hash, isPending, error: writeError, reset } = useWriteContract();

  const { isSuccess: txSuccess, isLoading: txLoading } = useWaitForTransactionReceipt({ hash });

  // Quote for AMM buy trades
  const sharesAmount = amount && parseFloat(amount) > 0 ? parseEther(amount) : 0n;

  const { data: quoteData } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: PredictionAMMAbi,
    functionName:
      action === "buy"
        ? position === "yes"
          ? "quoteBuyYes"
          : "quoteBuyNo"
        : position === "yes"
          ? "quoteSellYes"
          : "quoteSellNo",
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

  // Fetch wstETH to stETH (≈ ETH) conversion rate
  const { data: stEthPerToken } = useReadContract({
    address: WSTETH_ADDRESS,
    abi: WSTETH_ABI,
    functionName: "stEthPerToken",
    query: {
      enabled: marketType === "amm" && action === "buy",
    },
  });

  React.useEffect(() => {
    if (txSuccess) {
      toast.success("Transaction confirmed!");
      setAmount("");
      setLocalError(null);
      setTimeout(() => {
        onClose();
      }, 2000);
    }
  }, [txSuccess, onClose]);

  // Clear errors when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      setLocalError(null);
      reset();
    }
  }, [isOpen, reset]);

  // Handle wallet disconnection
  React.useEffect(() => {
    if (!address && isOpen && (isPending || txLoading)) {
      toast.error("Wallet disconnected");
      setLocalError("Wallet disconnected during transaction");
    }
  }, [address, isOpen, isPending, txLoading]);

  const handleTrade = async () => {
    // Check wallet connection first
    if (!address) {
      toast.error("Please connect your wallet");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    // Clear any previous errors
    setLocalError(null);

    try {
      const amountWei = parseEther(amount);

      if (marketType === "amm") {
        // AMM market trading
        if (action === "buy") {
          // For AMM buy: amount is shares to buy, we pay with ETH
          const slippageMultiplier = BigInt(Math.floor((1 + slippageTolerance / 100) * 10000));
          const wstInMax = (estimatedCost * slippageMultiplier) / 10000n;
          const oppInMax = (oppIn * slippageMultiplier) / 10000n;

          // Calculate ETH needed: wstETH / stEthPerToken * 1e18 gives ≈ ETH needed
          // CRITICAL: Contract calculates wstIn on-chain at execution time (not bounded by wstInMax when inIsETH=true)
          // Need large buffer because wstIn can increase if: pool moves, tuning changes, rounding differences
          // Small purchases need even more buffer due to proportionally larger rounding errors
          // 40% buffer = slippage protection (10%) + state changes + tuning + rounding for small amounts
          let ethValue: bigint;
          if (stEthPerToken) {
            // Use actual exchange rate: (wstInMax / stEthPerToken * 1e18) * 1.40
            ethValue = (wstInMax * parseEther("1") * 140n) / (stEthPerToken * 100n);
          } else {
            // Fallback: use 1.2 ratio with 40% buffer = 1.68x total
            ethValue = (wstInMax * 168n) / 100n;
          }

          const functionName = position === "yes" ? "buyYesViaPool" : "buyNoViaPool";
          await writeContractAsync({
            address: contractAddress as `0x${string}`,
            abi: PredictionAMMAbi,
            functionName,
            args: [
              marketId,
              amountWei, // yesOut or noOut (shares to buy)
              true, // inIsETH
              wstInMax, // wstInMax (slippage protection)
              oppInMax, // oppInMax (slippage protection)
              address, // to
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
              amountWei, // yesIn or noIn (shares to sell)
              wstOutMin, // wstOutMin (slippage protection)
              oppOutMin, // oppOutMin (slippage protection)
              address, // to
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
      setLocalError(null);
    } catch (err: any) {
      // Handle user rejection silently - no toast, just reset state
      if (isUserRejectionError(err)) {
        setLocalError(null);
        return;
      }

      // For actual errors, log and show to user
      console.error("Trade error:", err);

      // Extract clean error message - avoid showing huge error objects
      const errorMessage = err?.shortMessage ?? err?.message ?? err?.reason ?? String(err);
      let displayMessage = errorMessage;
      if (errorMessage && errorMessage.length > 200) {
        // Truncate very long errors - likely stack traces
        displayMessage = errorMessage.substring(0, 200) + "...";
      }

      // Show error in toast and local error state
      setLocalError(displayMessage || "Transaction failed");
      toast.error(displayMessage || "Transaction failed");
    }
  };

  // For AMM markets, use pool reserves for odds; for parimutuel, use total supply
  // AMM odds formula (from PAMM.sol impliedYesProb):
  //   YES probability = rNo / (rYes + rNo)
  //   NO probability = rYes / (rYes + rNo)
  // This is because reserves are inversely related to probability in a CPMM
  let yesPercent: number;
  let noPercent: number;
  let displayYes: bigint;
  let displayNo: bigint;

  if (marketType === "amm" && rYes > 0n && rNo > 0n) {
    const totalReserves = rYes + rNo;
    // YES probability uses rNo in numerator (inverse relationship)
    // Use high precision calculation to avoid BigInt truncation
    yesPercent = (Number(rNo) / Number(totalReserves)) * 100;
    noPercent = 100 - yesPercent;
    // For display of reserve values, show actual reserves
    displayYes = rYes;
    displayNo = rNo;
  } else {
    // Parimutuel markets: use total supply directly
    const totalSupply = yesSupply + noSupply;
    yesPercent = totalSupply > 0n ? (Number(yesSupply) / Number(totalSupply)) * 100 : 50;
    noPercent = 100 - yesPercent;
    displayYes = yesSupply;
    displayNo = noSupply;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {marketName}
            {isPerpetualOracle && (
              <span title="Perpetual Oracle Resolver">
                <BadgeCheck className="h-5 w-5 text-yellow-500 shrink-0" />
              </span>
            )}
          </DialogTitle>
          <DialogDescription>Trade shares in this prediction market</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Odds Display */}
          <div className="bg-muted rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-green-600 dark:text-green-400 font-bold">YES {yesPercent.toFixed(2)}%</span>
              <span className="text-red-600 dark:text-red-400 font-bold">NO {noPercent.toFixed(2)}%</span>
            </div>
            <div className="flex h-3 rounded-full overflow-hidden bg-background">
              <div className="bg-green-600 dark:bg-green-400" style={{ width: `${yesPercent}%` }} />
              <div className="bg-red-600 dark:bg-red-400" style={{ width: `${noPercent}%` }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatEther(displayYes)} wstETH</span>
              <span>{formatEther(displayNo)} wstETH</span>
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
                <Label htmlFor="amount">{marketType === "amm" ? "Shares to Buy" : "Amount (ETH)"}</Label>
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
                    : `Buy ${position.toUpperCase()} shares with ETH`}
                </p>
              </div>

              {marketType === "amm" && estimatedCost > 0n && (() => {
                const slippageMultiplier = BigInt(Math.floor((1 + slippageTolerance / 100) * 10000));
                const wstInMax = (estimatedCost * slippageMultiplier) / 10000n;

                // Calculate ETH to send using the same logic as handleTrade
                let ethToSend: bigint;
                if (stEthPerToken) {
                  ethToSend = (wstInMax * parseEther("1") * 140n) / (stEthPerToken * 100n);
                } else {
                  ethToSend = (wstInMax * 168n) / 100n;
                }

                return (
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
                        {Number(formatEther(wstInMax)).toFixed(6)} wstETH
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ETH to send:</span>
                      <span className="font-mono">
                        {Number(formatEther(ethToSend)).toFixed(6)} ETH
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground italic">
                      Extra ETH is refunded as wstETH. Includes 40% buffer for on-chain pricing & small amount rounding.
                    </p>
                  </div>
                );
              })()}

              {marketType === "amm" && (
                <div className="grid gap-2">
                  <Label htmlFor="slippage">Slippage Tolerance: {slippageTolerance}%</Label>
                  <Slider
                    id="slippage"
                    min={0.1}
                    max={20}
                    step={0.1}
                    value={[slippageTolerance]}
                    onValueChange={(value) => setSlippageTolerance(value[0])}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0.1%</span>
                    <span>20%</span>
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
                <p className="text-xs text-muted-foreground">Sell your {position.toUpperCase()} shares for wstETH</p>
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
                  <Label htmlFor="slippage-sell">Slippage Tolerance: {slippageTolerance}%</Label>
                  <Slider
                    id="slippage-sell"
                    min={0.1}
                    max={20}
                    step={0.1}
                    value={[slippageTolerance]}
                    onValueChange={(value) => setSlippageTolerance(value[0])}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0.1%</span>
                    <span>20%</span>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {(writeError || localError) && (
            <Alert tone="destructive">
              <AlertDescription className="break-words text-sm">
                {localError || writeError?.message || "Transaction failed"}
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
              <AlertDescription className="text-green-600 dark:text-green-400">Trade successful!</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button onClick={handleTrade} disabled={isPending || txLoading || !address} className="flex-1">
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
