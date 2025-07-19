import { CheckIcon, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  formatEther,
  formatUnits,
  parseEther,
  parseUnits,
} from "viem";
import { mainnet } from "viem/chains";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSendCalls,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import { FlipActionButton } from "./components/FlipActionButton";
import { NetworkError } from "./components/NetworkError";
import { SlippageSettings } from "./components/SlippageSettings";
import { SwapPanel } from "./components/SwapPanel";
import { LoadingLogo } from "./components/ui/loading-logo";
import { CookbookAddress } from "./constants/Cookbook";
import { useTokenSelection } from "./contexts/TokenSelectionContext";
import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { useBatchingSupported } from "./hooks/use-batching-supported";
import { useReserves } from "./hooks/use-reserves";
import { useErc20Allowance } from "./hooks/use-erc20-allowance";
import { buildSwapCalls } from "./lib/build-swap-calls";
import { CULT_TOKEN, CULT_ADDRESS, ETH_TOKEN } from "./lib/coins";
import { handleWalletError } from "./lib/errors";
import {
  SLIPPAGE_BPS,
  SWAP_FEE,
  getAmountIn,
  getAmountOut,
  getSwapFee,
} from "./lib/swap";
import { cn } from "./lib/utils";

export const CultBuySell = () => {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });

  // State for CULT-specific trading
  const [sellAmt, setSellAmt] = useState("");
  const [buyAmt, setBuyAmt] = useState("");
  const [isSelling, setIsSelling] = useState(false); // true = selling CULT, false = buying CULT
  const [slippageBps, setSlippageBps] = useState<bigint>(SLIPPAGE_BPS);
  
  // Transaction state
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Get token data
  const { tokens, isEthBalanceFetching } = useAllCoins();
  const ethToken = tokens.find(t => t.id === null) || ETH_TOKEN;
  const cultToken = tokens.find(t => t.symbol === "CULT") || CULT_TOKEN;

  // Set up token selection for the context (even though we're fixed to CULT/ETH)
  const { setSellToken, setBuyToken } = useTokenSelection();

  // Initialize tokens on load
  useEffect(() => {
    if (isSelling) {
      setSellToken(cultToken);
      setBuyToken(ethToken);
    } else {
      setSellToken(ethToken);
      setBuyToken(cultToken);
    }
  }, [isSelling, ethToken, cultToken, setSellToken, setBuyToken]);

  // ERC20 allowance for selling CULT
  const {
    allowance: cultAllowance,
    refetchAllowance: refetchCultAllowance,
    approveMax: approveCultMax,
  } = useErc20Allowance({
    token: CULT_ADDRESS,
    spender: CookbookAddress, // CULT uses Cookbook for swaps
  });

  // Get reserves for CULT pool
  const { data: reserves } = useReserves({
    poolId: cultToken.poolId,
    source: "COOKBOOK",
  });

  // Get transaction receipt
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // Batching support
  const batchingSupported = useBatchingSupported();

  // Send transaction hooks
  const { sendTransactionAsync, isPending: isSendTxPending } = useSendTransaction();
  const { sendCalls, isPending: isSendCallsPending } = useSendCalls();

  const isPending = isSendTxPending || isSendCallsPending || isLoading;

  // Calculate amounts based on input
  const syncFromSell = useCallback(async (val: string) => {
    setSellAmt(val);
    if (!reserves || !val || Number.parseFloat(val) <= 0) {
      setBuyAmt("");
      return;
    }

    try {
      if (isSelling) {
        // Selling CULT for ETH
        const cultAmount = parseUnits(val, 18); // CULT has 18 decimals
        const ethAmount = getAmountOut(
          cultAmount,
          reserves.reserve1, // CULT reserves
          reserves.reserve0, // ETH reserves
          cultToken.swapFee || SWAP_FEE
        );
        setBuyAmt(ethAmount === 0n ? "" : formatEther(ethAmount));
      } else {
        // Buying CULT with ETH
        const ethAmount = parseEther(val);
        const cultAmount = getAmountOut(
          ethAmount,
          reserves.reserve0, // ETH reserves
          reserves.reserve1, // CULT reserves
          cultToken.swapFee || SWAP_FEE
        );
        setBuyAmt(cultAmount === 0n ? "" : formatUnits(cultAmount, 18));
      }
    } catch (err) {
      console.error("Error calculating amounts:", err);
      setBuyAmt("");
    }
  }, [reserves, isSelling, cultToken.swapFee]);

  const syncFromBuy = useCallback(async (val: string) => {
    setBuyAmt(val);
    if (!reserves || !val || Number.parseFloat(val) <= 0) {
      setSellAmt("");
      return;
    }

    try {
      if (isSelling) {
        // User wants specific ETH amount, calculate required CULT
        const ethAmount = parseEther(val);
        const cultAmount = getAmountIn(
          ethAmount,
          reserves.reserve1, // CULT reserves
          reserves.reserve0, // ETH reserves
          cultToken.swapFee || SWAP_FEE
        );
        setSellAmt(cultAmount === 0n ? "" : formatUnits(cultAmount, 18));
      } else {
        // User wants specific CULT amount, calculate required ETH
        const cultAmount = parseUnits(val, 18);
        const ethAmount = getAmountIn(
          cultAmount,
          reserves.reserve0, // ETH reserves
          reserves.reserve1, // CULT reserves
          cultToken.swapFee || SWAP_FEE
        );
        setSellAmt(ethAmount === 0n ? "" : formatEther(ethAmount));
      }
    } catch (err) {
      console.error("Error calculating amounts:", err);
      setSellAmt("");
    }
  }, [reserves, isSelling, cultToken.swapFee]);

  // Handle flip between buy/sell
  const handleFlip = useCallback(() => {
    setIsSelling(!isSelling);
    // Clear amounts when flipping
    setSellAmt("");
    setBuyAmt("");
  }, [isSelling]);

  // Execute the swap
  const executeSwap = useCallback(async () => {
    if (!address || !publicClient || !reserves) {
      setError("Missing required data for swap");
      return;
    }

    if (!sellAmt || Number.parseFloat(sellAmt) <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    if (!buyAmt || Number.parseFloat(buyAmt) <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    // Check network
    if (chainId !== mainnet.id) {
      setError("Please connect to Ethereum mainnet");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      // Check CULT allowance if selling CULT
      if (isSelling) {
        const cultAmount = parseUnits(sellAmt, 18);
        if (cultAllowance === undefined || cultAmount > cultAllowance) {
          setError("Waiting for CULT approval. Please confirm the transaction...");
          const approved = await approveCultMax();
          if (!approved) {
            setIsLoading(false);
            return;
          }
          
          // Wait for approval to be mined
          const receipt = await publicClient.waitForTransactionReceipt({ hash: approved });
          if (receipt.status === "success") {
            await refetchCultAllowance();
            setError(null);
          } else {
            setError("CULT approval failed. Please try again.");
            setIsLoading(false);
            return;
          }
        }
      }

      // Build the swap transaction
      const swapCalls = await buildSwapCalls({
        address,
        sellToken: isSelling ? cultToken : ethToken,
        buyToken: isSelling ? ethToken : cultToken,
        sellAmt,
        buyAmt,
        reserves,
        slippageBps,
        recipient: address,
        publicClient,
      });

      if (!swapCalls || swapCalls.length === 0) {
        throw new Error("Failed to build swap transaction");
      }

      // Execute the swap
      if (batchingSupported && swapCalls.length > 1) {
        // Use sendCalls for batched transactions
        sendCalls({
          calls: swapCalls.map(call => ({
            to: call.to,
            data: call.data,
            value: call.value,
          })),
        });
      } else {
        // Use single transaction
        const call = swapCalls[0];
        const hash = await sendTransactionAsync({
          to: call.to,
          data: call.data,
          value: call.value,
        });
        setTxHash(hash);
      }

    } catch (err) {
      const errorMsg = handleWalletError(err);
      if (errorMsg) {
        console.error("Swap execution error:", err);
        setError(errorMsg);
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    address,
    publicClient,
    reserves,
    sellAmt,
    buyAmt,
    chainId,
    isSelling,
    cultAllowance,
    approveCultMax,
    refetchCultAllowance,
    slippageBps,
    cultToken,
    ethToken,
    batchingSupported,
    sendCalls,
    sendTransactionAsync,
  ]);

  // Reset on success
  useEffect(() => {
    if (isSuccess) {
      setSellAmt("");
      setBuyAmt("");
      setTxHash(undefined);
      setError(null);
    }
  }, [isSuccess]);

  const swapFee = getSwapFee(cultToken.swapFee);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <img 
            src="/cult.jpg" 
            alt="CULT" 
            className="w-8 h-8 rounded-full"
          />
          <h1 className="text-2xl font-bold">CULT Trading</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Hyperfinancialized network tribe experiencing technocapital singularity. 
          Trade CULT tokens with advanced ERC20 integration.
        </p>
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span>Contract:</span>
          <code className="bg-muted px-1 rounded">{CULT_ADDRESS}</code>
          <a 
            href="https://cult.inc/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-primary"
          >
            <ExternalLink className="w-3 h-3" />
            cult.inc
          </a>
        </div>
      </div>

      {/* Chart Section - Pending */}
      <div className="bg-muted/30 border border-muted rounded-lg p-8 text-center">
        <LoadingLogo size="sm" />
        <p className="text-sm text-muted-foreground mt-2">Chart coming soon...</p>
      </div>

      {/* Holders Section - Pending */}
      <div className="bg-muted/30 border border-muted rounded-lg p-4 text-center">
        <p className="text-sm text-muted-foreground">Holder analysis pending...</p>
      </div>

      {/* Swap Interface */}
      <div className="relative">
        {/* Sell Panel */}
        <SwapPanel
          title={isSelling ? "Sell CULT" : "Pay with ETH"}
          selectedToken={isSelling ? cultToken : ethToken}
          tokens={[]} // Fixed tokens, no selection
          onSelect={() => {}} // No selection allowed
          isEthBalanceFetching={isEthBalanceFetching}
          amount={sellAmt}
          onAmountChange={syncFromSell}
          showMaxButton={!!(
            (isSelling ? cultToken.balance : ethToken.balance) !== undefined && 
            (isSelling ? cultToken.balance : ethToken.balance)! > 0n
          )}
          onMax={() => {
            const balance = isSelling ? cultToken.balance : ethToken.balance;
            if (balance) {
              if (isSelling) {
                // For CULT, use full balance
                syncFromSell(formatUnits(balance, 18));
              } else {
                // For ETH, leave some for gas
                const ethAmount = (balance * 99n) / 100n;
                syncFromSell(formatEther(ethAmount));
              }
            }
          }}
          className="rounded-t-2xl pb-4"
        />

        {/* Flip Button */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <FlipActionButton onClick={handleFlip} />
        </div>

        {/* Buy Panel */}
        <SwapPanel
          title={isSelling ? "Receive ETH" : "Buy CULT"}
          selectedToken={isSelling ? ethToken : cultToken}
          tokens={[]} // Fixed tokens, no selection
          onSelect={() => {}} // No selection allowed
          isEthBalanceFetching={false}
          amount={buyAmt}
          onAmountChange={syncFromBuy}
          className="mt-2 rounded-b-2xl pt-4 shadow-[0_0_15px_rgba(0,204,255,0.07)]"
        />
      </div>

      <NetworkError message="trade CULT" />

      {/* Trading Info */}
      <div className="text-xs bg-muted/50 border border-primary/30 rounded p-2 text-muted-foreground">
        <div className="flex justify-between items-center mb-2">
          <span>Trading Fee:</span>
          <span className="font-mono">{swapFee}%</span>
        </div>
        <div className="flex justify-between items-center">
          <span>Network:</span>
          <span>Ethereum Mainnet</span>
        </div>
      </div>

      {/* Slippage Settings */}
      <SlippageSettings
        slippageBps={slippageBps}
        setSlippageBps={setSlippageBps}
      />

      {/* Execute Button */}
      <button
        onClick={executeSwap}
        disabled={!isConnected || isPending || !sellAmt || !buyAmt}
        className={cn(
          "w-full button text-base px-8 py-4 bg-primary text-primary-foreground font-bold rounded-lg transform transition-all duration-200",
          !isConnected || isPending || !sellAmt || !buyAmt
            ? "opacity-50 cursor-not-allowed"
            : "opacity-100 hover:scale-105 hover:shadow-lg focus:ring-4 focus:ring-primary/50 focus:outline-none"
        )}
      >
        {isPending ? (
          <span className="flex items-center gap-2 justify-center">
            <LoadingLogo size="sm" />
            {isSelling ? "Selling CULT..." : "Buying CULT..."}
          </span>
        ) : !isConnected ? (
          "Connect Wallet"
        ) : (
          isSelling ? "Sell CULT" : "Buy CULT"
        )}
      </button>

      {/* Status Messages */}
      {error && error.includes("Waiting for") && (
        <div className="text-sm text-primary mt-2 flex items-center bg-background/50 p-2 rounded border border-primary/20">
          <LoadingLogo size="sm" className="mr-2" />
          {error}
        </div>
      )}

      {error && !error.includes("Waiting for") && (
        <div className="text-sm text-destructive mt-2 bg-background/50 p-2 rounded border border-destructive/20">
          {error}
        </div>
      )}

      {isSuccess && (
        <div className="text-sm text-green-600 mt-2 flex items-center bg-background/50 p-2 rounded border border-green-600/20">
          <CheckIcon className="w-4 h-4 mr-2" />
          Transaction successful! Your CULT trade has been completed.
        </div>
      )}

      {/* Tax Information */}
      <div className="text-xs bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded p-3">
        <div className="flex items-start gap-2">
          <span className="text-amber-600 dark:text-amber-400">⚠️</span>
          <div>
            <div className="font-medium text-amber-800 dark:text-amber-300 mb-1">
              Tax Considerations
            </div>
            <p className="text-amber-700 dark:text-amber-400">
              Trading CULT tokens may have tax implications. Please consult with a tax professional 
              and maintain records of all transactions for tax reporting purposes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};