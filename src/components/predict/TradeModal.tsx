import React, { useState } from "react";
import { parseEther, formatEther } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useBalance } from "wagmi";
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
import { BadgeCheck, Settings } from "lucide-react";
import { isPerpetualOracleResolver } from "@/constants/TrustedResolvers";
import { isUserRejectionError } from "@/lib/errors";
import { ChainlinkAggregatorV3Abi, CHAINLINK_ETH_USD_FEED } from "@/constants/ChainlinkAggregator";
import { PercentageBlobs } from "@/components/ui/percentage-blobs";

// wstETH contract address
const WSTETH_ADDRESS = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0" as const;

// wstETH ABI for approvals and balance checks
const WSTETH_ABI = [
  {
    inputs: [],
    name: "stEthPerToken",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
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
  initialPosition?: "yes" | "no"; // Pre-select YES or NO when modal opens
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
  initialPosition = "yes",
}) => {
  const isPerpetualOracle = resolver ? isPerpetualOracleResolver(resolver) : false;
  const { address } = useAccount();
  const [action, setAction] = useState<"buy" | "sell">("buy");
  const [position, setPosition] = useState<"yes" | "no">(initialPosition);
  const [amount, setAmount] = useState("");
  const [slippageTolerance, setSlippageTolerance] = useState(10); // 10% default for AMM markets
  const [localError, setLocalError] = useState<string | null>(null);
  const [showSlippageSettings, setShowSlippageSettings] = useState(false);
  const [useWstETH, setUseWstETH] = useState<boolean>(false); // Auto-set based on balance

  // Fetch user's ETH balance for percentage buttons
  const { data: ethBalance } = useBalance({
    address: address,
  });

  // Fetch user's wstETH balance
  const { data: wstethBalance, refetch: refetchWstethBalance } = useReadContract({
    address: WSTETH_ADDRESS,
    abi: WSTETH_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  // Check wstETH allowance for the market contract
  const { data: wstethAllowance, refetch: refetchAllowance } = useReadContract({
    address: WSTETH_ADDRESS,
    abi: WSTETH_ABI,
    functionName: "allowance",
    args: address ? [address, contractAddress as `0x${string}`] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const { writeContractAsync, data: hash, isPending, error: writeError, reset } = useWriteContract();

  // Filter out user rejection errors from writeError
  const displayError = React.useMemo(() => {
    if (!writeError) return null;
    if (isUserRejectionError(writeError)) return null;
    return writeError;
  }, [writeError]);

  const { isSuccess: txSuccess, isLoading: txLoading } = useWaitForTransactionReceipt({ hash });

  // Auto-select wstETH payment if user has sufficient balance
  React.useEffect(() => {
    if (action === "buy" && amount && parseFloat(amount) > 0 && wstethBalance) {
      const amountWei = parseEther(amount);
      // For AMM: amount is shares to buy, need to check if wstethBalance > estimatedCost
      // For Parimutuel: amount is ETH to spend directly
      if (marketType === "amm") {
        // For AMM, use quote data to determine if we have enough wstETH
        setUseWstETH(false); // Will update below based on quote
      } else {
        // For parimutuel, amount is direct wstETH needed
        setUseWstETH(wstethBalance >= amountWei);
      }
    } else {
      setUseWstETH(false);
    }
  }, [action, amount, wstethBalance, marketType]);

  // Refetch balances and allowances when transaction succeeds
  React.useEffect(() => {
    if (txSuccess) {
      refetchWstethBalance();
      refetchAllowance();
    }
  }, [txSuccess, refetchWstethBalance, refetchAllowance]);

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

  // For AMM markets, update useWstETH based on whether user has enough wstETH for the quoted cost
  React.useEffect(() => {
    if (action === "buy" && marketType === "amm" && estimatedCost > 0n && wstethBalance) {
      // Add slippage buffer to estimated cost for comparison
      const slippageMultiplier = BigInt(Math.floor((1 + slippageTolerance / 100) * 10000));
      const wstInMax = (estimatedCost * slippageMultiplier) / 10000n;
      setUseWstETH(wstethBalance >= wstInMax);
    }
  }, [action, marketType, estimatedCost, wstethBalance, slippageTolerance]);

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

  // Fetch PMTuning to calculate intelligent buffer based on market conditions
  const { data: pmTuningData } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: PredictionAMMAbi,
    functionName: "pmTuning",
    args: [marketId],
    query: {
      enabled: marketType === "amm",
    },
  });

  // Fetch wstETH to stETH (≈ ETH) conversion rate
  const { data: stEthPerToken } = useReadContract({
    address: WSTETH_ADDRESS,
    abi: WSTETH_ABI,
    functionName: "stEthPerToken",
  });

  // Fetch current ETH/USD price from Chainlink
  const { data: ethPriceData } = useReadContract({
    address: CHAINLINK_ETH_USD_FEED as `0x${string}`,
    abi: ChainlinkAggregatorV3Abi,
    functionName: "latestRoundData",
  });

  // Calculate wstETH/USD price
  // wstETH value = (stEthPerToken / 1e18) * ETH price
  // stEthPerToken is in 1e18 scale, ETH/USD is in 1e8 scale (8 decimals)
  const wstethUsdPrice = React.useMemo(() => {
    if (!stEthPerToken || !ethPriceData) return null;
    const ethPrice = ethPriceData[1]; // answer from Chainlink (int256, 8 decimals)
    // Convert: (stEthPerToken * ethPrice) / 1e18 gives price in 8 decimals
    const wstethPrice = (stEthPerToken * BigInt(ethPrice.toString())) / parseEther("1");
    return Number(wstethPrice) / 1e8; // Convert to regular number with proper decimals
  }, [stEthPerToken, ethPriceData]);

  // Calculate intelligent buffer based on on-chain market conditions
  // Returns basis points (e.g., 2500 = 25% buffer)
  const calculateIntelligentBuffer = React.useCallback((sharesAmount: bigint) => {
    // Base buffer for pool movements, ETH/wstETH rate changes, and general safety
    let bufferBps = 500; // 5% base safety margin

    // Add PMTuning maximum possible adjustment from on-chain data
    if (pmTuningData) {
      const lateRampMaxBps = pmTuningData[1]; // uint16
      const extremeMaxBps = pmTuningData[2];  // uint16
      // Both adjustments can apply simultaneously, so add them
      const maxTuningBps = Number(lateRampMaxBps) + Number(extremeMaxBps);
      bufferBps += maxTuningBps;
    } else {
      // Conservative fallback: assume max tuning caps from contract (20% total)
      // This ensures safety even if pmTuning read fails
      bufferBps += 2000; // 20% max per PAMM.sol:268
    }

    // Add extra buffer for very small trades due to proportionally higher rounding impact
    // The contract adds fixed +5 wei which matters more for micro amounts
    if (sharesAmount > 0n && sharesAmount < parseEther("0.01")) {
      bufferBps += 500; // +5% extra for trades < 0.01 ETH
    }

    // Minimum buffer: never go below 10% (1000 bps) for safety
    if (bufferBps < 1000) {
      bufferBps = 1000;
    }

    return bufferBps;
  }, [pmTuningData]);

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

  // Handle percentage selection for ETH buys
  const handlePercentageChange = (percentage: number) => {
    if (!ethBalance) return;

    const balance = ethBalance.value;
    // Apply 1% gas discount for MAX (100%)
    const adjustedBalance = percentage === 100
      ? (balance * 99n) / 100n
      : (balance * BigInt(percentage)) / 100n;

    const calculatedAmount = formatEther(adjustedBalance);
    setAmount(calculatedAmount);
  };

  // Clear errors when modal closes and reset position to initialPosition when opening
  React.useEffect(() => {
    if (!isOpen) {
      setLocalError(null);
      reset();
      setShowSlippageSettings(false);
    } else {
      // When modal opens, set position to initialPosition
      setPosition(initialPosition);
    }
  }, [isOpen, reset, initialPosition]);

  // Handle wallet disconnection
  React.useEffect(() => {
    if (!address && isOpen && (isPending || txLoading)) {
      toast.error("Wallet disconnected");
      setLocalError("Wallet disconnected during transaction");
    }
  }, [address, isOpen, isPending, txLoading]);

  // Handle wstETH approval
  const handleApprove = async () => {
    if (!address) {
      toast.error("Please connect your wallet");
      return;
    }

    try {
      setLocalError(null);

      // Approve max uint256 for better UX (one-time approval)
      const maxUint256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

      await writeContractAsync({
        address: WSTETH_ADDRESS,
        abi: WSTETH_ABI,
        functionName: "approve",
        args: [contractAddress as `0x${string}`, maxUint256],
      });

      toast.success("Approval submitted! Waiting for confirmation...");
    } catch (err: any) {
      if (isUserRejectionError(err)) {
        setLocalError(null);
        return;
      }

      console.error("Approval error:", err);
      const errorMessage = err?.shortMessage ?? err?.message ?? err?.reason ?? String(err);
      setLocalError(errorMessage || "Approval failed");
      toast.error(errorMessage || "Approval failed");
    }
  };

  // Check if approval is needed for wstETH trades
  const needsApproval = React.useMemo(() => {
    if (!useWstETH || !address || action !== "buy") return false;

    if (!amount || parseFloat(amount) <= 0) return false;

    const amountWei = parseEther(amount);

    // For AMM, check against estimated cost + slippage
    if (marketType === "amm" && estimatedCost > 0n) {
      const slippageMultiplier = BigInt(Math.floor((1 + slippageTolerance / 100) * 10000));
      const wstInMax = (estimatedCost * slippageMultiplier) / 10000n;
      return !wstethAllowance || wstethAllowance < wstInMax;
    }

    // For parimutuel, check against amount
    return !wstethAllowance || wstethAllowance < amountWei;
  }, [useWstETH, address, action, amount, marketType, estimatedCost, wstethAllowance, slippageTolerance]);

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
          const slippageMultiplier = BigInt(Math.floor((1 + slippageTolerance / 100) * 10000));
          const wstInMax = (estimatedCost * slippageMultiplier) / 10000n;
          const oppInMax = (oppIn * slippageMultiplier) / 10000n;

          const functionName = position === "yes" ? "buyYesViaPool" : "buyNoViaPool";

          if (useWstETH) {
            // Pay with wstETH directly (inIsETH=false)
            // User already has wstETH and allowance is sufficient
            await writeContractAsync({
              address: contractAddress as `0x${string}`,
              abi: PredictionAMMAbi,
              functionName,
              args: [
                marketId,
                amountWei, // yesOut or noOut (shares to buy)
                false, // inIsETH = false (use wstETH directly)
                wstInMax, // wstInMax (slippage protection)
                oppInMax, // oppInMax (slippage protection)
                address, // to
              ],
            });
          } else {
            // Pay with ETH (inIsETH=true)
            // Calculate intelligent ETH buffer based on on-chain market conditions
            // CRITICAL: Contract calculates wstIn on-chain at execution time (not bounded by wstInMax when inIsETH=true)
            // Buffer accounts for:
            // - PMTuning adjustments (read from on-chain, can be 0-20%)
            // - Pool state changes between quote and execution
            // - ETH/wstETH conversion rate fluctuations
            // - Proportionally larger rounding errors for small trades
            // This intelligent approach minimizes excess refunds while ensuring txs never fail
            const bufferBps = calculateIntelligentBuffer(amountWei);
            const bufferMultiplier = BigInt(10000 + bufferBps); // e.g., 12500 = 1.25x

            let ethValue: bigint;
            if (stEthPerToken) {
              // Use actual exchange rate with intelligent buffer: (wstInMax / stEthPerToken * 1e18) * buffer
              ethValue = (wstInMax * parseEther("1") * bufferMultiplier) / (stEthPerToken * 10000n);
            } else {
              // Fallback: use 1.2 ratio with intelligent buffer
              ethValue = (wstInMax * 12n * bufferMultiplier) / 100000n;
            }

            await writeContractAsync({
              address: contractAddress as `0x${string}`,
              abi: PredictionAMMAbi,
              functionName,
              args: [
                marketId,
                amountWei, // yesOut or noOut (shares to buy)
                true, // inIsETH = true
                wstInMax, // wstInMax (slippage protection)
                oppInMax, // oppInMax (slippage protection)
                address, // to
              ],
              value: ethValue,
            });
          }
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-2 pb-4 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            {marketName}
            {isPerpetualOracle && (
              <span title="Perpetual Oracle Resolver">
                <BadgeCheck className="h-5 w-5 text-yellow-500 shrink-0" />
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Trade shares in this prediction market
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Odds Display - Modern Design */}
          <div className="bg-gradient-to-br from-muted/30 to-muted/10 border border-border/50 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold text-base">YES</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold text-2xl">{yesPercent.toFixed(2)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-rose-600 dark:text-rose-400 font-bold text-2xl">{noPercent.toFixed(2)}%</span>
                <span className="text-rose-600 dark:text-rose-400 font-bold text-base">NO</span>
                <div className="w-3 h-3 rounded-full bg-rose-500"></div>
              </div>
            </div>
            <div className="flex h-3 rounded-full overflow-hidden bg-muted/50 shadow-inner">
              <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all" style={{ width: `${yesPercent}%` }} />
              <div className="bg-gradient-to-r from-rose-500 to-rose-600 transition-all" style={{ width: `${noPercent}%` }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t border-border/30">
              <span className="font-mono">{Number(formatEther(displayYes)).toFixed(2)} wstETH</span>
              <span className="font-mono">{Number(formatEther(displayNo)).toFixed(2)} wstETH</span>
            </div>
          </div>

          {/* Trade Interface */}
          <Tabs value={action} onValueChange={(v) => setAction(v as "buy" | "sell")}>
            <TabsList className="grid w-full grid-cols-2 h-11">
              <TabsTrigger value="buy" className="font-semibold">Buy</TabsTrigger>
              <TabsTrigger value="sell" className="font-semibold">Sell</TabsTrigger>
            </TabsList>

            <TabsContent value="buy" className="space-y-5 mt-5">
              {/* Position Selection - Modern Cards */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Select Position</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPosition("yes")}
                    className={`h-14 rounded-lg font-bold text-base transition-all border-2 ${
                      position === "yes"
                        ? "bg-gradient-to-br from-emerald-500 to-emerald-600 border-emerald-600 text-white shadow-md scale-105"
                        : "bg-muted/30 border-border hover:border-emerald-500/50 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                    }`}
                  >
                    YES
                  </button>
                  <button
                    type="button"
                    onClick={() => setPosition("no")}
                    className={`h-14 rounded-lg font-bold text-base transition-all border-2 ${
                      position === "no"
                        ? "bg-gradient-to-br from-rose-500 to-rose-600 border-rose-600 text-white shadow-md scale-105"
                        : "bg-muted/30 border-border hover:border-rose-500/50 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                    }`}
                  >
                    NO
                  </button>
                </div>
              </div>

              {/* Amount Input with Percentage Buttons */}
              <div className="space-y-3">
                <Label htmlFor="amount" className="text-sm font-semibold">
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
                  className="h-14 text-lg font-mono rounded-lg"
                />

                {/* Balance and Payment Method Info */}
                <div className="space-y-2">
                  {/* ETH Balance */}
                  {ethBalance && !useWstETH && (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        ETH Balance: {Number(formatEther(ethBalance.value)).toFixed(4)} ETH
                      </p>
                      <PercentageBlobs
                        value={0}
                        onChange={handlePercentageChange}
                        variant="inline"
                        size="sm"
                        steps={[25, 50, 100]}
                      />
                    </div>
                  )}

                  {/* wstETH Balance and Payment Method */}
                  {wstethBalance !== undefined && wstethBalance > 0n && (
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <p className="text-muted-foreground">
                        wstETH Balance: {Number(formatEther(wstethBalance)).toFixed(4)} wstETH
                      </p>
                      {useWstETH && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                          <BadgeCheck className="h-3 w-3" />
                          Paying with wstETH
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Potential Winnings Display */}
              {amount && parseFloat(amount) > 0 && (() => {
                const amountWei = parseEther(amount);

                if (marketType === "amm") {
                  // For AMM: shares bought = potential payout if win
                  const sharesBought = amountWei;
                  const costWei = estimatedCost > 0n ? estimatedCost : 0n;
                  const profit = sharesBought > costWei ? sharesBought - costWei : 0n;

                  const payoutUsd = wstethUsdPrice ? Number(formatEther(sharesBought)) * wstethUsdPrice : null;
                  const profitUsd = wstethUsdPrice && profit > 0n ? Number(formatEther(profit)) * wstethUsdPrice : null;

                  return (
                    <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-purple-900 dark:text-purple-100">
                          Potential Payout (if {position.toUpperCase()} wins)
                        </span>
                        <div className="text-right">
                          <div className="font-mono font-bold text-base text-purple-900 dark:text-purple-100">
                            {Number(formatEther(sharesBought)).toFixed(4)} wstETH
                          </div>
                          {payoutUsd && (
                            <div className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                              ≈ ${payoutUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          )}
                        </div>
                      </div>
                      {profit > 0n && (
                        <div className="flex items-center justify-between text-sm border-t border-purple-200/50 dark:border-purple-800/50 pt-2">
                          <span className="text-purple-700 dark:text-purple-300">Potential Profit</span>
                          <div className="text-right">
                            <div className="font-mono font-semibold text-green-600 dark:text-green-400">
                              +{Number(formatEther(profit)).toFixed(4)} wstETH
                            </div>
                            {profitUsd && (
                              <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                ≈ +${profitUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                } else {
                  // For Parimutuel: calculate based on pool ratio
                  const currentPositionPool = position === "yes" ? displayYes : displayNo;
                  const totalPool = displayYes + displayNo;

                  // After this bet, position pool increases
                  const newPositionPool = currentPositionPool + amountWei;
                  const newTotalPool = totalPool + amountWei;

                  // If position wins: your share of total pool = (your amount / total position pool) * total pool
                  const potentialPayout = newTotalPool > 0n
                    ? (amountWei * newTotalPool) / newPositionPool
                    : 0n;
                  const profit = potentialPayout > amountWei ? potentialPayout - amountWei : 0n;

                  const payoutUsd = wstethUsdPrice ? Number(formatEther(potentialPayout)) * wstethUsdPrice : null;
                  const profitUsd = wstethUsdPrice && profit > 0n ? Number(formatEther(profit)) * wstethUsdPrice : null;

                  return (
                    <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-purple-900 dark:text-purple-100">
                          Potential Payout (if {position.toUpperCase()} wins)
                        </span>
                        <div className="text-right">
                          <div className="font-mono font-bold text-base text-purple-900 dark:text-purple-100">
                            {Number(formatEther(potentialPayout)).toFixed(4)} wstETH
                          </div>
                          {payoutUsd && (
                            <div className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                              ≈ ${payoutUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          )}
                        </div>
                      </div>
                      {profit > 0n && (
                        <div className="flex items-center justify-between text-sm border-t border-purple-200/50 dark:border-purple-800/50 pt-2">
                          <span className="text-purple-700 dark:text-purple-300">Potential Profit</span>
                          <div className="text-right">
                            <div className="font-mono font-semibold text-green-600 dark:text-green-400">
                              +{Number(formatEther(profit)).toFixed(4)} wstETH
                            </div>
                            {profitUsd && (
                              <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                ≈ +${profitUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-purple-600 dark:text-purple-400 italic border-t border-purple-200/50 dark:border-purple-800/50 pt-2">
                        Estimated based on current pool ratio. Final payout depends on total pool when market resolves.
                      </p>
                    </div>
                  );
                }
              })()}

              {marketType === "amm" && estimatedCost > 0n && amount && parseFloat(amount) > 0 && (() => {
                const amountWei = parseEther(amount);
                const slippageMultiplier = BigInt(Math.floor((1 + slippageTolerance / 100) * 10000));
                const wstInMax = (estimatedCost * slippageMultiplier) / 10000n;

                if (useWstETH) {
                  // Paying with wstETH directly - simpler display
                  return (
                    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Estimated Cost</span>
                        <span className="font-mono font-bold text-base">
                          {Number(formatEther(estimatedCost)).toFixed(6)} wstETH
                        </span>
                      </div>
                      <div className="border-t border-border pt-2 space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Max Cost (with slippage)</span>
                          <span className="font-mono font-semibold">
                            {Number(formatEther(wstInMax)).toFixed(6)} wstETH
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground italic pt-1 border-t border-border/50">
                        Paying with wstETH directly. Any excess is refunded.
                      </p>
                    </div>
                  );
                } else {
                  // Paying with ETH - show buffer calculation
                  const bufferBps = calculateIntelligentBuffer(amountWei);
                  const bufferMultiplier = BigInt(10000 + bufferBps);
                  const bufferPercent = (bufferBps / 100).toFixed(1); // e.g., "25.0"

                  let ethToSend: bigint;
                  if (stEthPerToken) {
                    ethToSend = (wstInMax * parseEther("1") * bufferMultiplier) / (stEthPerToken * 10000n);
                  } else {
                    ethToSend = (wstInMax * 12n * bufferMultiplier) / 100000n;
                  }

                  return (
                    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Estimated Cost</span>
                        <span className="font-mono font-bold text-base">
                          {Number(formatEther(estimatedCost)).toFixed(6)} wstETH
                        </span>
                      </div>
                      <div className="border-t border-border pt-2 space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Max Cost (with slippage)</span>
                          <span className="font-mono text-xs">
                            {Number(formatEther(wstInMax)).toFixed(6)} wstETH
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">ETH to send</span>
                          <span className="font-mono font-semibold">
                            {Number(formatEther(ethToSend)).toFixed(6)} ETH
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground italic pt-1 border-t border-border/50">
                        Extra ETH is refunded as wstETH. Includes {bufferPercent}% intelligent buffer based on market conditions.
                      </p>
                    </div>
                  );
                }
              })()}

              {/* Slippage Settings - Collapsible & Subtle */}
              {marketType === "amm" && (
                <div className="pt-2 border-t border-border/30">
                  <button
                    type="button"
                    onClick={() => setShowSlippageSettings(!showSlippageSettings)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-muted-foreground">Slippage Settings</span>
                    </div>
                    <span className="font-mono font-semibold text-xs">{slippageTolerance}%</span>
                  </button>

                  {showSlippageSettings && (
                    <div className="mt-3 space-y-3 px-3 pb-2">
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
                      <p className="text-xs text-muted-foreground italic">
                        Higher slippage = more price movement tolerance
                      </p>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="sell" className="space-y-5 mt-5">
              {/* Position Selection - Modern Cards */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Select Position</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPosition("yes")}
                    className={`h-14 rounded-lg font-bold text-base transition-all border-2 ${
                      position === "yes"
                        ? "bg-gradient-to-br from-emerald-500 to-emerald-600 border-emerald-600 text-white shadow-md scale-105"
                        : "bg-muted/30 border-border hover:border-emerald-500/50 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                    }`}
                  >
                    YES
                  </button>
                  <button
                    type="button"
                    onClick={() => setPosition("no")}
                    className={`h-14 rounded-lg font-bold text-base transition-all border-2 ${
                      position === "no"
                        ? "bg-gradient-to-br from-rose-500 to-rose-600 border-rose-600 text-white shadow-md scale-105"
                        : "bg-muted/30 border-border hover:border-rose-500/50 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                    }`}
                  >
                    NO
                  </button>
                </div>
              </div>

              {/* Amount Input */}
              <div className="space-y-3">
                <Label htmlFor="sell-amount" className="text-sm font-semibold">
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
                  className="h-14 text-lg font-mono rounded-lg"
                />
                <p className="text-xs text-muted-foreground">
                  Sell your {position.toUpperCase()} shares for wstETH
                </p>
              </div>

              {marketType === "amm" && estimatedCost > 0n && (
                <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Estimated Payout</span>
                    <span className="font-mono font-bold text-base">
                      {Number(formatEther(estimatedCost)).toFixed(6)} wstETH
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground italic border-t border-border/50 pt-2">
                    Payout may vary due to price impact and slippage.
                  </p>
                </div>
              )}

              {/* Slippage Settings - Collapsible & Subtle */}
              {marketType === "amm" && (
                <div className="pt-2 border-t border-border/30">
                  <button
                    type="button"
                    onClick={() => setShowSlippageSettings(!showSlippageSettings)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-muted-foreground">Slippage Settings</span>
                    </div>
                    <span className="font-mono font-semibold text-xs">{slippageTolerance}%</span>
                  </button>

                  {showSlippageSettings && (
                    <div className="mt-3 space-y-3 px-3 pb-2">
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
                      <p className="text-xs text-muted-foreground italic">
                        Higher slippage = more price movement tolerance
                      </p>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {(displayError || localError) && (
            <Alert tone="destructive" className="border-l-4 border-l-red-500">
              <AlertDescription className="break-words text-sm">
                {localError || displayError?.message || "Transaction failed"}
              </AlertDescription>
            </Alert>
          )}

          {txLoading && (
            <Alert className="border-l-4 border-l-blue-500">
              <AlertDescription className="flex items-center gap-2">
                <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span>Transaction is being confirmed…</span>
              </AlertDescription>
            </Alert>
          )}

          {txSuccess && (
            <Alert className="border-l-4 border-l-green-500 bg-green-50 dark:bg-green-950/20">
              <AlertDescription className="text-green-600 dark:text-green-400 font-semibold">
                Trade successful!
              </AlertDescription>
            </Alert>
          )}

          {/* Action Buttons - Modern Design */}
          <div className="flex gap-3 pt-4 border-t border-border/50">
            {needsApproval ? (
              <>
                <Button
                  onClick={handleApprove}
                  disabled={isPending || txLoading || !address}
                  className="flex-1 h-14 font-bold text-base shadow-md hover:shadow-lg transition-all bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
                >
                  {isPending || txLoading ? "Approving…" : "Approve wstETH"}
                </Button>
                <Button
                  variant="outline"
                  onClick={onClose}
                  disabled={isPending || txLoading}
                  className="h-14 px-8 border-2 hover:bg-muted/50"
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={handleTrade}
                  disabled={isPending || txLoading || !address}
                  className={`flex-1 h-14 font-bold text-base shadow-md hover:shadow-lg transition-all ${
                    action === "buy"
                      ? position === "yes"
                        ? "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white"
                        : "bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white"
                      : position === "yes"
                        ? "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white"
                        : "bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white"
                  }`}
                >
                  {isPending || txLoading
                    ? "Processing…"
                    : `${action === "buy" ? "Buy" : "Sell"} ${position.toUpperCase()}`}
                </Button>
                <Button
                  variant="outline"
                  onClick={onClose}
                  disabled={isPending || txLoading}
                  className="h-14 px-8 border-2 hover:bg-muted/50"
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
