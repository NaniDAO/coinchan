import React, { useState } from "react";
import { parseEther, formatEther, zeroAddress } from "viem";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useReadContracts,
  useBalance,
} from "wagmi";
import { toast } from "sonner";
import {
  PredictionMarketAddress,
  PredictionMarketAbi,
} from "@/constants/PredictionMarket";
import {
  PredictionAMMAbi,
  PredictionAMMAddress,
} from "@/constants/PredictionMarketAMM";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { BadgeCheck, CopyIcon, Settings } from "lucide-react";
import { isPerpetualOracleResolver } from "@/constants/TrustedResolvers";
import { isUserRejectionError } from "@/lib/errors";
import {
  ChainlinkAggregatorV3Abi,
  CHAINLINK_ETH_USD_FEED,
} from "@/constants/ChainlinkAggregator";
import { PercentageBlobs } from "@/components/ui/percentage-blobs";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { WSTETH_ABI, WSTETH_ADDRESS } from "@/constants/WSTETH";
import { trunc } from "@/lib/utils";

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
  onTransactionSuccess?: () => void; // Callback to refresh market data after transactions
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
  onTransactionSuccess,
}) => {
  const isPerpetualOracle = resolver
    ? isPerpetualOracleResolver(resolver)
    : false;
  const { address } = useAccount();
  const [action, setAction] = useState<"buy" | "sell">("buy");
  const [position, setPosition] = useState<"yes" | "no">(initialPosition);
  const [amount, setAmount] = useState("");
  const [slippageTolerance, setSlippageTolerance] = useState(40); // 10% default for AMM markets
  const [localError, setLocalError] = useState<string | null>(null);
  const [showSlippageSettings, setShowSlippageSettings] = useState(false);
  const [useWstETH, setUseWstETH] = useState<boolean>(false); // Auto-set based on balance
  const [showApprovalSuccess, setShowApprovalSuccess] = useState(false);
  const [isApprovingWstETH, setIsApprovingWstETH] = useState(false); // Track if current tx is an approval

  // Fetch user's ETH balance for percentage buttons
  const { data: ethBalance } = useBalance({
    address: address,
  });

  const { data: noId } = useReadContract({
    address: PredictionAMMAddress,
    abi: PredictionAMMAbi,
    functionName: "getNoId",
    args: [marketId],
  });

  // 🔹 Determine current token id for the Sell tab
  const tokenIdForPosition: bigint | undefined =
    position === "yes" ? marketId : (noId ?? 0n);

  // 🔹 Get user's share balance for the current token id (only when selling)
  const { data: userTokenBalance } = useTokenBalance({
    token: {
      id: tokenIdForPosition,
      address: PredictionAMMAddress,
    },
    address: address ? address : zeroAddress,
  });

  // Helper: MAX button handler for selling
  const handleMaxSell = () => {
    if (!userTokenBalance) return;
    // userTokenBalance is a bigint of 18 decimals
    setAmount(formatEther(userTokenBalance));
  };

  // Fetch user's wstETH balance
  const { data: wstethBalance, refetch: refetchWstethBalance } =
    useReadContract({
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

  const {
    writeContractAsync,
    data: hash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract();

  // Filter out user rejection errors from writeError
  const displayError = React.useMemo(() => {
    if (!writeError) return null;
    if (isUserRejectionError(writeError)) return null;
    return writeError;
  }, [writeError]);

  const { isSuccess: txSuccess, isLoading: txLoading } =
    useWaitForTransactionReceipt({ hash });

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
  // Also handle approval success popup and market data refresh
  React.useEffect(() => {
    if (txSuccess) {
      refetchWstethBalance();
      refetchAllowance();

      // If this was an approval transaction, show success popup
      if (isApprovingWstETH) {
        setShowApprovalSuccess(true);
        setIsApprovingWstETH(false);
        // Auto-hide the approval success message after 3 seconds
        setTimeout(() => setShowApprovalSuccess(false), 3000);
      }

      // Refresh market data in parent component
      if (onTransactionSuccess) {
        onTransactionSuccess();
      }
    }
  }, [
    txSuccess,
    refetchWstethBalance,
    refetchAllowance,
    isApprovingWstETH,
    onTransactionSuccess,
  ]);

  // Quote for AMM buy trades
  const sharesAmount =
    amount && parseFloat(amount) > 0 ? parseEther(amount) : 0n;

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
    if (
      action === "buy" &&
      marketType === "amm" &&
      estimatedCost > 0n &&
      wstethBalance
    ) {
      // Add slippage buffer to estimated cost for comparison
      const slippageMultiplier = BigInt(
        Math.floor((1 + slippageTolerance / 100) * 10000),
      );
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

  // Fetch full market data for PAMM (pot, circulating supply, payout calculations)
  const { data: marketData } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: PredictionAMMAbi,
    functionName: "getMarket",
    args: [marketId],
    query: {
      enabled: marketType === "amm",
    },
  });

  // Extract market data: [yesSupply, noSupply, resolver, resolved, outcome, pot, payoutPerShare, desc, closeTs, canClose, rYes, rNo, pYes_num, pYes_den]
  const currentPot = marketData ? marketData[5] : 0n; // pot
  const yesTotalSupply = marketData ? marketData[0] : 0n; // yesSupply (total, includes ZAMM LP + PAMM)
  const noTotalSupply = marketData ? marketData[1] : 0n; // noSupply (total, includes ZAMM LP + PAMM)

  // CRITICAL: Need to calculate TRUE circulating supply by excluding PAMM and ZAMM holdings
  // This matches PAMM.sol _circulating() function (lines 1289-1295)
  const ZAMM_ADDRESS = "0x000000000000040470635EB91b7CE4D132D616eD" as const;

  // Fetch balances held by PAMM and ZAMM to calculate circulating supply
  const { data: excludedBalances } = useReadContracts({
    contracts: [
      {
        address: contractAddress as `0x${string}`,
        abi: PredictionAMMAbi,
        functionName: "balanceOf",
        args: [contractAddress as `0x${string}`, marketId], // PAMM's YES balance
      },
      {
        address: contractAddress as `0x${string}`,
        abi: PredictionAMMAbi,
        functionName: "balanceOf",
        args: [ZAMM_ADDRESS, marketId], // ZAMM's YES balance
      },
      {
        address: contractAddress as `0x${string}`,
        abi: PredictionAMMAbi,
        functionName: "balanceOf",
        args: [contractAddress as `0x${string}`, noId ?? 0n], // PAMM's NO balance
      },
      {
        address: contractAddress as `0x${string}`,
        abi: PredictionAMMAbi,
        functionName: "balanceOf",
        args: [ZAMM_ADDRESS, noId ?? 0n], // ZAMM's NO balance
      },
    ],
    query: {
      enabled: marketType === "amm" && !!noId,
    },
  });

  // Calculate TRUE circulating supply (excludes PAMM and ZAMM, matching contract logic)
  const pammYesBal = excludedBalances?.[0]?.result ?? 0n;
  const zammYesBal = excludedBalances?.[1]?.result ?? 0n;
  const pammNoBal = excludedBalances?.[2]?.result ?? 0n;
  const zammNoBal = excludedBalances?.[3]?.result ?? 0n;

  const yesCirculating = yesTotalSupply - pammYesBal - zammYesBal;
  const noCirculating = noTotalSupply - pammNoBal - zammNoBal;

  // CRITICAL: Fetch resolver fee (PAMM.sol lines 777-784 deducts this from pot before payout)
  const { data: resolverFeeBps } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: PredictionAMMAbi,
    functionName: "resolverFeeBps",
    args: [resolver as `0x${string}`],
    query: {
      enabled: marketType === "amm" && !!resolver,
    },
  });

  // Apply resolver fee to pot (matching PAMM.sol line 779: fee = pot * feeBps / 10_000, then pot -= fee)
  const feeBps = resolverFeeBps ?? 0;
  const potAfterFee = currentPot > 0n && feeBps > 0
    ? (currentPot * BigInt(10000 - feeBps)) / 10000n
    : currentPot;

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
  const wstethUsdPrice = React.useMemo(() => {
    if (!stEthPerToken || !ethPriceData) return null;
    const ethPrice = ethPriceData[1]; // answer from Chainlink (int256, 8 decimals)
    const wstethPrice =
      (stEthPerToken * BigInt(ethPrice.toString())) / parseEther("1");
    return Number(wstethPrice) / 1e8;
  }, [stEthPerToken, ethPriceData]);

  // Calculate intelligent buffer based on on-chain market conditions
  const calculateIntelligentBuffer = React.useCallback(
    (sharesAmount: bigint) => {
      let bufferBps = 500; // 5%

      if (pmTuningData) {
        const lateRampMaxBps = pmTuningData[1]; // uint16
        const extremeMaxBps = pmTuningData[2]; // uint16
        const maxTuningBps = Number(lateRampMaxBps) + Number(extremeMaxBps);
        bufferBps += maxTuningBps;
      } else {
        bufferBps += 2000; // 20% conservative fallback
      }

      if (sharesAmount > 0n && sharesAmount < parseEther("0.01")) {
        bufferBps += 500; // +5% small-trade cushion
      }

      if (bufferBps < 1000) bufferBps = 1000; // min 10%
      return bufferBps;
    },
    [pmTuningData],
  );

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
    const adjustedBalance =
      percentage === 100
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
      setIsApprovingWstETH(true);

      const maxUint256 = BigInt(
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      );

      await writeContractAsync({
        address: WSTETH_ADDRESS,
        abi: WSTETH_ABI,
        functionName: "approve",
        args: [contractAddress as `0x${string}`, maxUint256],
      });

      toast.success("Approval submitted! Waiting for confirmation...");
    } catch (err: any) {
      setIsApprovingWstETH(false);
      if (isUserRejectionError(err)) {
        setLocalError(null);
        return;
      }

      console.error("Approval error:", err);
      const errorMessage =
        err?.shortMessage ?? err?.message ?? err?.reason ?? String(err);
      setLocalError(errorMessage || "Approval failed");
      toast.error(errorMessage || "Approval failed");
    }
  };

  // Check if approval is needed for wstETH trades
  const needsApproval = React.useMemo(() => {
    if (!useWstETH || !address || action !== "buy") return false;

    if (!amount || parseFloat(amount) <= 0) return false;

    const amountWei = parseEther(amount);

    if (marketType === "amm" && estimatedCost > 0n) {
      const slippageMultiplier = BigInt(
        Math.floor((1 + slippageTolerance / 100) * 10000),
      );
      const wstInMax = (estimatedCost * slippageMultiplier) / 10000n;
      return !wstethAllowance || wstethAllowance < wstInMax;
    }

    return !wstethAllowance || wstethAllowance < amountWei;
  }, [
    useWstETH,
    address,
    action,
    amount,
    marketType,
    estimatedCost,
    wstethAllowance,
    slippageTolerance,
  ]);

  const handleTrade = async () => {
    if (!address) {
      toast.error("Please connect your wallet");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setLocalError(null);

    try {
      const amountWei = parseEther(amount);

      if (marketType === "amm") {
        if (action === "buy") {
          const slippageMultiplier = BigInt(
            Math.floor((1 + slippageTolerance / 100) * 10000),
          );
          const wstInMax = (estimatedCost * slippageMultiplier) / 10000n;
          const oppInMax = (oppIn * slippageMultiplier) / 10000n;

          const functionName =
            position === "yes" ? "buyYesViaPool" : "buyNoViaPool";

          if (useWstETH) {
            await writeContractAsync({
              address: contractAddress as `0x${string}`,
              abi: PredictionAMMAbi,
              functionName,
              args: [marketId, amountWei, false, wstInMax, oppInMax, address],
            });
          } else {
            const bufferBps = calculateIntelligentBuffer(amountWei);
            const bufferMultiplier = BigInt(10000 + bufferBps);

            let ethValue: bigint;
            if (stEthPerToken) {
              ethValue =
                (wstInMax * parseEther("1") * bufferMultiplier) /
                (stEthPerToken * 10000n);
            } else {
              ethValue = (wstInMax * 12n * bufferMultiplier) / 100000n;
            }

            await writeContractAsync({
              address: contractAddress as `0x${string}`,
              abi: PredictionAMMAbi,
              functionName,
              args: [marketId, amountWei, true, wstInMax, oppInMax, address],
              value: ethValue,
            });
          }
        } else {
          const slippageMultiplier = BigInt(
            Math.floor((1 - slippageTolerance / 100) * 10000),
          );
          const wstOutMin = (estimatedCost * slippageMultiplier) / 10000n;
          const oppOutMin = (oppIn * slippageMultiplier) / 10000n;

          const functionName =
            position === "yes" ? "sellYesViaPool" : "sellNoViaPool";
          await writeContractAsync({
            address: contractAddress as `0x${string}`,
            abi: PredictionAMMAbi,
            functionName,
            args: [marketId, amountWei, wstOutMin, oppOutMin, address],
          });
        }
      } else {
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
      if (isUserRejectionError(err)) {
        setLocalError(null);
        return;
      }

      console.error("Trade error:", err);

      const errorMessage =
        err?.shortMessage ?? err?.message ?? err?.reason ?? String(err);
      let displayMessage = errorMessage;
      if (errorMessage && errorMessage.length > 200) {
        displayMessage = errorMessage.substring(0, 200) + "...";
      }

      setLocalError(displayMessage || "Transaction failed");
      toast.error(displayMessage || "Transaction failed");
    }
  };

  // For AMM markets, use pool reserves for odds; for parimutuel, use total supply
  let yesPercent: number;
  let noPercent: number;
  let displayYes: bigint;
  let displayNo: bigint;

  if (marketType === "amm" && rYes > 0n && rNo > 0n) {
    const totalReserves = rYes + rNo;
    yesPercent = (Number(rNo) / Number(totalReserves)) * 100;
    noPercent = 100 - yesPercent;
    displayYes = rYes;
    displayNo = rNo;
  } else {
    const totalSupply = yesSupply + noSupply;
    yesPercent =
      totalSupply > 0n ? (Number(yesSupply) / Number(totalSupply)) * 100 : 50;
    noPercent = 100 - yesPercent;
    displayYes = yesSupply;
    displayNo = noSupply;
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

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

          {/* PAMM Payout Explainer - Only for AMM markets */}
          {marketType === "amm" && (
            <Collapsible className="mt-3">
              <CollapsibleTrigger className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                <span>ℹ️</span>
                <span className="font-medium">How do PAMM payouts work?</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs space-y-2">
                <p className="font-semibold text-blue-900 dark:text-blue-100">
                  PAMM uses parimutuel (pool-based) payouts
                </p>
                <ul className="list-disc list-inside space-y-1.5 text-blue-800 dark:text-blue-200">
                  <li>Every trade adds wstETH to a shared pot</li>
                  <li>
                    At resolution, winners split the pot proportionally:{" "}
                    <span className="font-mono bg-blue-100 dark:bg-blue-900/40 px-1 rounded">
                      payout per share = pot ÷ winning shares
                    </span>
                  </li>
                  <li>Your profit depends on both winning AND your average cost vs. final payout per share</li>
                  <li>Earlier positions typically get better returns (like traditional parimutuel betting)</li>
                  <li>You can also exit positions early by selling at current market odds</li>
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )}
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Odds Display - Modern Design */}
          <div className="bg-gradient-to-br from-muted/30 to-muted/10 border border-border/50 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold text-base">
                  YES
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold text-2xl">
                  {yesPercent.toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-rose-600 dark:text-rose-400 font-bold text-2xl">
                  {noPercent.toFixed(2)}%
                </span>
                <span className="text-rose-600 dark:text-rose-400 font-bold text-base">
                  NO
                </span>
                <div className="w-3 h-3 rounded-full bg-rose-500"></div>
              </div>
            </div>
            <div className="flex h-3 rounded-full overflow-hidden bg-muted/50 shadow-inner">
              <div
                className="bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all"
                style={{ width: `${yesPercent}%` }}
              />
              <div
                className="bg-gradient-to-r from-rose-500 to-rose-600 transition-all"
                style={{ width: `${noPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t border-border/30">
              <span className="font-mono">
                {Number(formatEther(displayYes)).toFixed(2)} wstETH
              </span>
              <span className="font-mono">
                {Number(formatEther(displayNo)).toFixed(2)} wstETH
              </span>
            </div>
          </div>

          {/* Trade Interface */}
          <Tabs
            value={action}
            onValueChange={(v) => setAction(v as "buy" | "sell")}
          >
            <TabsList className="grid w-full grid-cols-2 h-11">
              <TabsTrigger value="buy" className="font-semibold">
                Buy
              </TabsTrigger>
              <TabsTrigger value="sell" className="font-semibold">
                Sell
              </TabsTrigger>
            </TabsList>

            <TabsContent value="buy" className="space-y-5 mt-5">
              <div>
                <button
                  onClick={() => copyToClipboard(marketId.toString())}
                  className="flex flex-row justify-between items-center text-xs font-extralight text-wrap max-w-2xl"
                >
                  Market ID: <span>{trunc(marketId.toString(), 8)}</span>
                  <CopyIcon className="ml-2 h-2 w-2" />
                </button>
              </div>
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
                        ETH Balance:{" "}
                        {Number(formatEther(ethBalance.value)).toFixed(4)} ETH
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
                        wstETH Balance:{" "}
                        {Number(formatEther(wstethBalance)).toFixed(4)} wstETH
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
              {amount &&
                parseFloat(amount) > 0 &&
                (() => {
                  const amountWei = parseEther(amount);

                  if (marketType === "amm") {
                    const sharesBought = amountWei;
                    const costWei = estimatedCost > 0n ? estimatedCost : 0n;
                    const profit =
                      sharesBought > costWei ? sharesBought - costWei : 0n;

                    const payoutUsd = wstethUsdPrice
                      ? Number(formatEther(sharesBought)) * wstethUsdPrice
                      : null;
                    const profitUsd =
                      wstethUsdPrice && profit > 0n
                        ? Number(formatEther(profit)) * wstethUsdPrice
                        : null;

                    // Calculate cost per share and projected payout per share
                    // Formula matches PAMM.sol: payoutPerShare = mulDiv(pot, Q, winningCirc) where Q = 1e18
                    const Q = parseEther("1"); // 1e18, same as contract
                    const userAvgCostPerShare = costWei > 0n && sharesBought > 0n
                      ? (costWei * Q) / sharesBought  // Cost in wei per share
                      : 0n;

                    const positionCirculating = position === "yes" ? yesCirculating : noCirculating;
                    const projectedPayoutPerShare = positionCirculating > 0n && potAfterFee > 0n
                      ? (potAfterFee * Q) / positionCirculating  // Payout in wei per share (after resolver fee)
                      : 0n;

                    const isAboveBreakeven = userAvgCostPerShare > projectedPayoutPerShare && projectedPayoutPerShare > 0n;

                    return (
                      <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-purple-900 dark:text-purple-100">
                            Potential Payout (if {position.toUpperCase()} wins)
                          </span>
                          <div className="text-right">
                            <div className="font-mono font-bold text-base text-purple-900 dark:text-purple-100">
                              {Number(formatEther(sharesBought)).toFixed(4)}{" "}
                              wstETH
                            </div>
                            {payoutUsd && (
                              <div className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                                ≈ $
                                {payoutUsd.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                        {profit > 0n && (
                          <div className="flex items-center justify-between text-sm border-t border-purple-200/50 dark:border-purple-800/50 pt-2">
                            <span className="text-purple-700 dark:text-purple-300">
                              Potential Profit
                            </span>
                            <div className="text-right">
                              <div className="font-mono font-semibold text-green-600 dark:text-green-400">
                                +{Number(formatEther(profit)).toFixed(4)} wstETH
                              </div>
                              {profitUsd && (
                                <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                  ≈ +$
                                  {profitUsd.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Payout Analysis */}
                        <div className="space-y-2 text-xs border-t border-purple-200/50 dark:border-purple-800/50 pt-2">
                          <div className="flex items-center justify-between">
                            <span className="text-purple-700 dark:text-purple-300 font-medium">
                              Your Cost Per Share
                            </span>
                            <span className="font-mono text-purple-900 dark:text-purple-100">
                              {Number(formatEther(userAvgCostPerShare)).toFixed(6)} wstETH
                            </span>
                          </div>
                          {projectedPayoutPerShare > 0n && (
                            <>
                              <div className="flex items-center justify-between">
                                <span className="text-purple-700 dark:text-purple-300 font-medium">
                                  Payout/Share (if resolved now)
                                </span>
                                <span className="font-mono text-purple-900 dark:text-purple-100">
                                  {Number(formatEther(projectedPayoutPerShare)).toFixed(6)} wstETH
                                </span>
                              </div>
                              {feeBps > 0 && (
                                <div className="text-[10px] text-purple-600 dark:text-purple-400 italic">
                                  (After {(feeBps / 100).toFixed(2)}% resolver fee)
                                </div>
                              )}
                            </>
                          )}

                          {/* Position Status - Only show if significantly above breakeven */}
                          {isAboveBreakeven && userAvgCostPerShare > projectedPayoutPerShare * 11n / 10n && (
                            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded p-2 mt-2">
                              <p className="text-blue-700 dark:text-blue-300 text-[11px] leading-relaxed">
                                💡 <span className="font-medium">Heads up:</span> For this position to be profitable at current odds,
                                more traders would need to bet on the opposite side to grow the pot.
                                Alternatively, you can sell now at market odds or wait for the odds to improve.
                              </p>
                            </div>
                          )}

                          <p className="text-purple-600 dark:text-purple-400 italic pt-1 text-[11px]">
                            Payouts are determined by the final pot size divided by winning shares (parimutuel style)
                          </p>
                        </div>
                      </div>
                    );
                  } else {
                    const currentPositionPool =
                      position === "yes" ? displayYes : displayNo;
                    const totalPool = displayYes + displayNo;

                    const newPositionPool = currentPositionPool + amountWei;
                    const newTotalPool = totalPool + amountWei;

                    const potentialPayout =
                      newTotalPool > 0n
                        ? (amountWei * newTotalPool) / newPositionPool
                        : 0n;
                    const profit =
                      potentialPayout > amountWei
                        ? potentialPayout - amountWei
                        : 0n;

                    const payoutUsd = wstethUsdPrice
                      ? Number(formatEther(potentialPayout)) * wstethUsdPrice
                      : null;
                    const profitUsd =
                      wstethUsdPrice && profit > 0n
                        ? Number(formatEther(profit)) * wstethUsdPrice
                        : null;

                    return (
                      <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-purple-900 dark:text-purple-100">
                            Potential Payout (if {position.toUpperCase()} wins)
                          </span>
                          <div className="text-right">
                            <div className="font-mono font-bold text-base text-purple-900 dark:text-purple-100">
                              {Number(formatEther(potentialPayout)).toFixed(4)}{" "}
                              wstETH
                            </div>
                            {payoutUsd && (
                              <div className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                                ≈ $
                                {payoutUsd.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                        {profit > 0n && (
                          <div className="flex items-center justify-between text-sm border-t border-purple-200/50 dark:border-purple-800/50 pt-2">
                            <span className="text-purple-700 dark:text-purple-300">
                              Potential Profit
                            </span>
                            <div className="text-right">
                              <div className="font-mono font-semibold text-green-600 dark:text-green-400">
                                +{Number(formatEther(profit)).toFixed(4)} wstETH
                              </div>
                              {profitUsd && (
                                <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                  ≈ +$
                                  {profitUsd.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        <p className="text-xs text-purple-600 dark:text-purple-400 italic border-t border-purple-200/50 dark:border-purple-800/50 pt-2">
                          Estimated based on current pool ratio. Final payout
                          depends on total pool when market resolves.
                        </p>
                      </div>
                    );
                  }
                })()}

              {marketType === "amm" &&
                estimatedCost > 0n &&
                amount &&
                parseFloat(amount) > 0 &&
                (() => {
                  const amountWei = parseEther(amount);
                  const slippageMultiplier = BigInt(
                    Math.floor((1 + slippageTolerance / 100) * 10000),
                  );
                  const wstInMax =
                    (estimatedCost * slippageMultiplier) / 10000n;

                  if (useWstETH) {
                    return (
                      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">
                            Estimated Cost
                          </span>
                          <span className="font-mono font-bold text-base">
                            {Number(formatEther(estimatedCost)).toFixed(6)}{" "}
                            wstETH
                          </span>
                        </div>
                        <div className="border-t border-border pt-2 space-y-1.5 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              Max Cost (with slippage)
                            </span>
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
                    const bufferBps = calculateIntelligentBuffer(amountWei);
                    const bufferMultiplier = BigInt(10000 + bufferBps);
                    const bufferPercent = (bufferBps / 100).toFixed(1);

                    let ethToSend: bigint;
                    if (stEthPerToken) {
                      ethToSend =
                        (wstInMax * parseEther("1") * bufferMultiplier) /
                        (stEthPerToken * 10000n);
                    } else {
                      ethToSend = (wstInMax * 12n * bufferMultiplier) / 100000n;
                    }

                    return (
                      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-muted-foreground">
                            Estimated Cost
                          </span>
                          <span className="font-mono font-bold text-base">
                            {Number(formatEther(estimatedCost)).toFixed(6)}{" "}
                            wstETH
                          </span>
                        </div>
                        <div className="border-t border-border pt-2 space-y-1.5 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              Max Cost (with slippage)
                            </span>
                            <span className="font-mono text-xs">
                              {Number(formatEther(wstInMax)).toFixed(6)} wstETH
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              ETH to send
                            </span>
                            <span className="font-mono font-semibold">
                              {Number(formatEther(ethToSend)).toFixed(6)} ETH
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground italic pt-1 border-t border-border/50">
                          Extra ETH is refunded as wstETH. Includes{" "}
                          {bufferPercent}% intelligent buffer based on market
                          conditions.
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
                    onClick={() =>
                      setShowSlippageSettings(!showSlippageSettings)
                    }
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-muted-foreground">
                        Slippage Settings
                      </span>
                    </div>
                    <span className="font-mono font-semibold text-xs">
                      {slippageTolerance}%
                    </span>
                  </button>

                  {showSlippageSettings && (
                    <div className="mt-3 space-y-3 px-3 pb-2">
                      <Slider
                        id="slippage"
                        min={0.1}
                        max={100}
                        step={0.1}
                        value={[slippageTolerance]}
                        onValueChange={(value) =>
                          setSlippageTolerance(value[0])
                        }
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0.1%</span>
                        <span>100%</span>
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

              {/* Amount Input + MAX + Balance */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="sell-amount"
                    className="text-sm font-semibold"
                  >
                    {marketType === "amm"
                      ? "Shares to Sell"
                      : "Amount (shares)"}
                  </Label>

                  {/* Balance display (only when we have it) */}
                  {action === "sell" &&
                    tokenIdForPosition !== undefined &&
                    userTokenBalance !== undefined && (
                      <span className="text-xs text-muted-foreground">
                        Balance:{" "}
                        <span className="font-mono">
                          {Number(formatEther(userTokenBalance ?? 0n)).toFixed(
                            6,
                          )}
                        </span>
                      </span>
                    )}
                </div>

                <div className="flex gap-2">
                  <Input
                    id="sell-amount"
                    type="number"
                    step="0.001"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.1"
                    className="h-14 text-lg font-mono rounded-lg flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleMaxSell}
                    disabled={
                      !userTokenBalance || userTokenBalance === 0n || !address
                    }
                    className="h-14 px-4 border-2 font-bold"
                    title="Sell your full balance"
                  >
                    MAX
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Sell your {position.toUpperCase()} shares for wstETH
                </p>
              </div>

              {marketType === "amm" && estimatedCost > 0n && (
                <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">
                      Estimated Payout
                    </span>
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
                    onClick={() =>
                      setShowSlippageSettings(!showSlippageSettings)
                    }
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-muted-foreground">
                        Slippage Settings
                      </span>
                    </div>
                    <span className="font-mono font-semibold text-xs">
                      {slippageTolerance}%
                    </span>
                  </button>

                  {showSlippageSettings && (
                    <div className="mt-3 space-y-3 px-3 pb-2">
                      <Slider
                        id="slippage-sell"
                        min={0.1}
                        max={20}
                        step={0.1}
                        value={[slippageTolerance]}
                        onValueChange={(value) =>
                          setSlippageTolerance(value[0])
                        }
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

          {showApprovalSuccess && (
            <Alert className="border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-950/20 animate-in slide-in-from-top-2 duration-300">
              <AlertDescription className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-semibold">
                <BadgeCheck className="h-5 w-5" />
                <div>
                  <div>wstETH Approved!</div>
                  <div className="text-xs font-normal mt-1 text-blue-600/80 dark:text-blue-400/80">
                    You can now proceed to buy shares
                  </div>
                </div>
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
