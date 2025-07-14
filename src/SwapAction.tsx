import { Link } from "@tanstack/react-router";
import { CheckIcon, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  encodeFunctionData,
  formatEther,
  formatUnits,
  isAddress,
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
import { useReadContract } from "wagmi";
import { PoolSwapChart } from "./PoolSwapChart";
import { FlipActionButton } from "./components/FlipActionButton";
import { NetworkError } from "./components/NetworkError";
import { SlippageSettings } from "./components/SlippageSettings";
import { SwapPanel } from "./components/SwapPanel";
import { LoadingLogo } from "./components/ui/loading-logo";
import { CoinsAbi, CoinsAddress } from "./constants/Coins";
import { CookbookAbi, CookbookAddress } from "./constants/Cookbook";
import { useTokenSelection } from "./contexts/TokenSelectionContext";
import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { useBatchingSupported } from "./hooks/use-batching-supported";
import { useReserves } from "./hooks/use-reserves";
import { buildSwapCalls } from "./lib/build-swap-calls";
import type { TokenMeta } from "./lib/coins";
import { handleWalletError, isUserRejectionError } from "./lib/errors";
import {
  SLIPPAGE_BPS,
  SWAP_FEE,
  analyzeTokens,
  getAmountIn,
  getAmountOut,
  getPoolIds,
  getSwapFee,
} from "./lib/swap";
import { cn } from "./lib/utils";

export const SwapAction = () => {
  const { t } = useTranslation();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({
    chainId,
  });
  const { tokens, isEthBalanceFetching } = useAllCoins();

  /* State */
  /* user inputs */
  const [sellAmt, setSellAmt] = useState("");
  const [buyAmt, setBuyAmt] = useState("");
  const [customRecipient, setCustomRecipient] = useState<string>("");
  const [showRecipientInput, setShowRecipientInput] = useState(false);

  // Use shared token selection context
  const { sellToken, buyToken, setSellToken, setBuyToken, flipTokens } =
    useTokenSelection();

  /* Limit order specific state */
  const [swapMode, setSwapMode] = useState<"instant" | "limit">("instant");
  const [partialFill, setPartialFill] = useState(false);
  const [deadline, setDeadline] = useState(2); // days

  const {
    isSellETH,
    isCustom: isCustomPool,
    isCoinToCoin,
    coinId,
    isDirectUsdtEth: isDirectUsdtEthSwap,
    canSwap,
  } = useMemo(() => analyzeTokens(sellToken, buyToken), [sellToken, buyToken]);

  /* Calculate pool reserves */
  const { mainPoolId, targetPoolId } = getPoolIds(sellToken, buyToken, {
    isCustomPool: isCustomPool,
    isCoinToCoin: isCoinToCoin,
  });

  const { data: reserves } = useReserves({
    poolId: mainPoolId,
    source: sellToken?.id === null ? buyToken?.source : sellToken.source,
  });
  const { data: targetReserves } = useReserves({
    poolId: targetPoolId,
    source: buyToken?.source,
  });

  const [slippageBps, setSlippageBps] = useState<bigint>(SLIPPAGE_BPS);

  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);
  const {
    sendTransactionAsync,
    isPending,
    error: writeError,
  } = useSendTransaction();
  const { sendCalls } = useSendCalls();
  const isBatchingSupported = useBatchingSupported();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const prevPairRef = useRef<string | null>(null);

  const memoizedTokens = useMemo(() => tokens, [tokens]);

  // Check operator status for limit orders (needed for non-ETH token sales)
  const { data: isOperator } = useReadContract({
    address: CoinsAddress,
    abi: CoinsAbi,
    functionName: "isOperator",
    args: address ? [address, CookbookAddress] : undefined,
    chainId: mainnet.id,
    query: {
      enabled: !!address && swapMode === "limit" && sellToken.id !== null,
    },
  });

  // Note: Previously used for flip button positioning, now using centered layout

  // Reset UI state when tokens change
  useEffect(() => {
    // Reset transaction data
    setTxHash(undefined);
    setTxError(null);

    // Reset amounts
    setSellAmt("");
    setBuyAmt("");
    
    // Reset recipient input
    setCustomRecipient("");
    setShowRecipientInput(false);
  }, [sellToken.id, buyToken?.id]);

  useEffect(() => {
    if (tokens.length && sellToken.id === null /* ETH */) {
      // pick the ETH entry from tokens
      const ethToken = tokens.find((t) => t.id === null);
      if (ethToken) setSellToken(ethToken);
    }
  }, [tokens]);

  useEffect(() => {
    if (!buyToken && tokens.length > 1) {
      setBuyToken(tokens[1]);
    }
  }, [tokens, buyToken]);

  // Reset amounts when switching between instant and limit modes
  useEffect(() => {
    setSellAmt("");
    setBuyAmt("");
    setTxHash(undefined);
    setTxError(null);
    // Reset recipient when switching modes
    setCustomRecipient("");
    setShowRecipientInput(false);
  }, [swapMode]);

  const syncFromBuy = async (val: string) => {
    setBuyAmt(val);

    // Only sync amounts in instant mode
    if (swapMode === "limit") return;

    if (!canSwap || !reserves) return setSellAmt("");

    try {
      // Different calculation paths based on swap type
      if (isCoinToCoin) {
        // Calculating input from output for coin-to-coin is very complex
        // Would require a recursive solver to find the right input amount
        // For UI simplicity, we'll just clear the input and let the user adjust
        setSellAmt("");

        // Optional: Show a notification that this direction is not supported
      } else if (isSellETH) {
        // ETH → Coin path (calculate ETH input)
        // Use correct decimals for the buy token (6 for USDT, 18 for regular coins)
        const buyTokenDecimals = buyToken?.decimals || 18;
        const outUnits = parseUnits(val || "0", buyTokenDecimals);
        const inWei = getAmountIn(
          outUnits,
          reserves.reserve0,
          reserves.reserve1,
          buyToken?.swapFee ?? SWAP_FEE,
        );
        setSellAmt(inWei === 0n ? "" : formatEther(inWei));
      } else {
        // Coin → ETH path (calculate Coin input)
        const outWei = parseEther(val || "0");
        const inUnits = getAmountIn(
          outWei,
          reserves.reserve1,
          reserves.reserve0,
          buyToken?.swapFee ?? SWAP_FEE,
        );
        // Use correct decimals for the sell token (6 for USDT, 18 for regular coins)
        const sellTokenDecimals = sellToken?.decimals || 18;
        setSellAmt(
          inUnits === 0n ? "" : formatUnits(inUnits, sellTokenDecimals),
        );
      }
    } catch {
      setSellAmt("");
    }
  };

  /* helpers to sync amounts */
  const syncFromSell = async (val: string) => {
    // Regular Add Liquidity or Swap mode
    setSellAmt(val);

    // Only sync amounts in instant mode
    if (swapMode === "limit") return;

    if (!canSwap || !reserves) return setBuyAmt("");
    try {
      // Different calculation paths based on swap type
      if (isCoinToCoin && targetReserves && buyToken?.id && sellToken.id) {
        // For coin-to-coin swaps, we need to estimate a two-hop swap
        try {
          // Dynamically import helper to avoid circular dependencies
          const { estimateCoinToCoinOutput } = await import("./lib/swap");

          // Use correct decimals for the sell token (6 for USDT, 18 for regular coins)
          const sellTokenDecimals = sellToken?.decimals || 18;
          const inUnits = parseUnits(val || "0", sellTokenDecimals);

          // Get correct swap fees for both pools
          const sourceSwapFee = sellToken.isCustomPool
            ? sellToken.swapFee || SWAP_FEE
            : SWAP_FEE;
          const targetSwapFee = buyToken?.isCustomPool
            ? buyToken.swapFee || SWAP_FEE
            : SWAP_FEE;

          // Pass custom swap fees for USDT or other custom pools
          const { amountOut } = estimateCoinToCoinOutput(
            sellToken.id,
            buyToken.id,
            inUnits,
            reserves,
            targetReserves,
            slippageBps, // Pass the current slippage tolerance setting
            sourceSwapFee, // Pass source pool fee (could be 30n for USDT)
            targetSwapFee, // Pass target pool fee (could be 30n for USDT)
          );

          // Use correct decimals for the buy token (6 for USDT, 18 for regular coins)
          const buyTokenDecimals = buyToken?.decimals || 18;
          setBuyAmt(
            amountOut === 0n ? "" : formatUnits(amountOut, buyTokenDecimals),
          );
        } catch (err) {
          console.error("Error estimating coin-to-coin output:", err);
          setBuyAmt("");
        }
      } else if (isSellETH) {
        // ETH → Coin path
        const inWei = parseEther(val || "0");
        const outUnits = getAmountOut(
          inWei,
          reserves.reserve0,
          reserves.reserve1,
          buyToken?.swapFee ?? SWAP_FEE,
        );

        // Use correct decimals for the buy token (6 for USDT, 18 for regular coins)
        const buyTokenDecimals = buyToken?.decimals || 18;
        setBuyAmt(
          outUnits === 0n ? "" : formatUnits(outUnits, buyTokenDecimals),
        );
      } else {
        // Coin → ETH path
        // Use correct decimals for the sell token (6 for USDT, 18 for regular coins)
        const sellTokenDecimals = sellToken?.decimals || 18;
        const inUnits = parseUnits(val || "0", sellTokenDecimals);
        const outWei = getAmountOut(
          inUnits,
          reserves.reserve1,
          reserves.reserve0,
          SWAP_FEE,
        );
        setBuyAmt(outWei === 0n ? "" : formatEther(outWei));
      }
    } catch {
      setBuyAmt("");
    }
  };

  const executeSwap = async () => {
    try {
      // Ensure wallet is connected before proceeding
      if (!isConnected || !address) {
        setTxError(t("errors.wallet_connection"));
        return;
      }

      if (!canSwap || !sellAmt || !publicClient || !buyToken) {
        // Cannot execute swap - missing prerequisites
        // Check swap prerequisites
        setTxError(t("swap.enter_amount"));
        return;
      }

      // Important: For custom pools like USDT, we have to special-case the reserves check
      if (!reserves && !sellToken.isCustomPool && !buyToken.isCustomPool) {
        console.error("Missing reserves for regular pool swap");
        setTxError(t("errors.network_error"));
        return;
      }

      // Clear any previous errors
      setTxError(null);
      
      // Validate custom recipient address if provided
      if (customRecipient && customRecipient.trim() !== "") {
        if (!isAddress(customRecipient)) {
          setTxError(t("errors.invalid_address") || "Invalid recipient address format");
          return;
        }
      }

      // Wait a moment to ensure wallet connection is stable
      if (publicClient && !publicClient.getChainId) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (!publicClient.getChainId) {
          setTxError(t("errors.wallet_connection"));
          return;
        }
      }

      // Check if we're on mainnet
      if (chainId !== mainnet.id) {
        setTxError(t("errors.network_error"));
        return;
      }

      if (reserves === undefined) {
        throw new Error("Reserves not found");
      }

      const calls = await buildSwapCalls({
        address,
        sellToken,
        buyToken,
        sellAmt: sellAmt,
        buyAmt: buyAmt,
        reserves,
        slippageBps,
        targetReserves,
        publicClient,
        recipient: customRecipient && customRecipient.trim() !== "" ? customRecipient as `0x${string}` : undefined,
      });

      if (calls.length === 0) {
        throw new Error("No swap calls generated");
      }

      if (calls.length === 1) {
        const hash = await sendTransactionAsync({
          account: address,
          chainId: mainnet.id,
          data: calls[0].data,
          to: calls[0].to,
          value: calls[0].value,
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
        });

        if (receipt.status === "success") {
        } else {
          throw new Error("Transaction failed");
        }
      }

      if (calls.length > 1) {
        // Either approval or setOperator call is there
        if (isBatchingSupported) {
          sendCalls({ calls });
        } else {
          // sequentially execute while waiting for each transaction to be mined
          for (const call of calls) {
            const hash = await sendTransactionAsync({
              to: call.to,
              value: call.value,
              data: call.data,
              chainId: mainnet.id,
            });

            const receipt = await publicClient.waitForTransactionReceipt({
              hash,
            });

            if (receipt.status === "success") {
            } else {
              throw new Error("Swap execution failed");
            }
          }
        }
      }
    } catch (err: unknown) {
      console.error("Swap execution error:", err);

      // Try to log more details about the error
      if (err instanceof Error) {
        console.error("Error details:", {
          name: err.name,
          message: err.message,
          stack: err.stack,
        });
      }

      // Enhanced error handling with specific messages for common swap failure cases
      if (
        typeof err === "object" &&
        err !== null &&
        "message" in err &&
        typeof err.message === "string"
      ) {
        const errMsg = err.message;

        // Handle wallet connection errors
        if (
          errMsg.includes("getChainId") ||
          errMsg.includes("connector") ||
          errMsg.includes("connection")
        ) {
          // Wallet connection issue
          setTxError(t("errors.wallet_connection_refresh"));

          // Log structured debug info
          const errorInfo = {
            type: "wallet_connection_error",
            message: errMsg,
            isConnected,
            hasChainId: !!chainId,
            hasPublicClient: !!publicClient,
            hasAccount: !!address,
          };
          // Show error info in console
          console.error("Wallet connection error:", errorInfo);
        } else if (errMsg.includes("InsufficientOutputAmount")) {
          setTxError(t("errors.insufficient_output_amount"));
        } else if (errMsg.includes("K(")) {
          setTxError(t("errors.pool_constraints"));
        } else {
          // Default to standard error handling
          const errorMsg = handleWalletError(err);
          if (errorMsg) {
            setTxError(errorMsg);
          }
        }
      } else {
        // Fallback for non-standard errors
        setTxError(t("errors.unexpected"));
      }
    }
  };

  const createOrder = async () => {
    try {
      if (!isConnected || !address || !buyToken || !sellAmt || !buyAmt) {
        setTxError(t("swap.enter_amount"));
        return;
      }

      // Clear any previous errors
      setTxError(null);

      // Check if we're on mainnet
      if (chainId !== mainnet.id) {
        setTxError(t("errors.network_error"));
        return;
      }

      // Calculate deadline (convert days to seconds from now)
      const deadlineSeconds =
        Math.floor(Date.now() / 1000) + deadline * 24 * 60 * 60;

      // Prepare token addresses and IDs
      const tokenInAddress =
        sellToken.id === null
          ? "0x0000000000000000000000000000000000000000"
          : sellToken.id < 1000000n
            ? CookbookAddress
            : CoinsAddress;
      const tokenOutAddress =
        buyToken.id === null
          ? "0x0000000000000000000000000000000000000000"
          : buyToken.id < 1000000n
            ? CookbookAddress
            : CoinsAddress;
      const idIn = sellToken.id || 0n;
      const idOut = buyToken.id || 0n;

      // Parse amounts with correct decimals
      const sellTokenDecimals = sellToken.decimals || 18;
      const buyTokenDecimals = buyToken.decimals || 18;
      const amtIn = parseUnits(sellAmt, sellTokenDecimals);
      const amtOut = parseUnits(buyAmt, buyTokenDecimals);

      // For ETH orders, we need to send the ETH value
      const value = sellToken.id === null ? amtIn : 0n;

      // Create the calls array for order creation
      const calls: Array<{
        to: `0x${string}`;
        data: `0x${string}`;
        value?: bigint;
      }> = [];

      // For non-ETH, non-cookbook tokens, ensure operator approval first
      if (sellToken.id !== null && sellToken.id >= 1000000n && !isOperator) {
        const approvalData = encodeFunctionData({
          abi: CoinsAbi,
          functionName: "setOperator",
          args: [CookbookAddress, true],
        });
        calls.push({
          to: CoinsAddress,
          data: approvalData,
        });
      }

      // Encode the makeOrder function call
      const makeOrderData = encodeFunctionData({
        abi: CookbookAbi,
        functionName: "makeOrder",
        args: [
          tokenInAddress,
          idIn,
          amtIn,
          tokenOutAddress,
          idOut,
          amtOut,
          BigInt(deadlineSeconds),
          partialFill,
        ],
      });

      calls.push({
        to: CookbookAddress,
        data: makeOrderData,
        value,
      });

      // Execute the calls (approval + order creation)
      if (calls.length === 1) {
        // Just the order creation
        const orderHash = await sendTransactionAsync({
          to: calls[0].to,
          data: calls[0].data,
          value: calls[0].value,
          account: address,
          chainId: mainnet.id,
        });

        const receipt = await publicClient!.waitForTransactionReceipt({
          hash: orderHash,
        });

        if (receipt.status === "success") {
          setTxHash(orderHash);
        } else {
          throw new Error("Transaction failed");
        }
      } else {
        // Approval + order creation
        if (isBatchingSupported) {
          // Use batching if supported
          sendCalls({ calls });
        } else {
          // Sequential execution
          for (const call of calls) {
            const hash = await sendTransactionAsync({
              to: call.to,
              value: call.value,
              data: call.data,
              chainId: mainnet.id,
            });

            const receipt = await publicClient!.waitForTransactionReceipt({
              hash,
            });

            if (receipt.status === "success") {
              // Set hash only for the final order creation transaction
              if (call === calls[calls.length - 1]) {
                setTxHash(hash);
              }
            } else {
              throw new Error("Transaction failed");
            }
          }
        }
      }
    } catch (err: unknown) {
      console.error("Order creation error:", err);
      const errorMsg = handleWalletError(err);
      if (errorMsg) {
        setTxError(errorMsg);
      }
    }
  };

  // Enhanced flip handler that preserves local state
  const handleFlipTokens = () => {
    if (!buyToken) return;

    // Clear any errors when flipping tokens
    if (txError) setTxError(null);

    // Reset input values to prevent stale calculations
    setSellAmt("");
    setBuyAmt("");

    // Use context flip function
    flipTokens();

    // Ensure wallet connection is properly tracked during token swaps
    // This helps avoid "lost connection" errors when rapidly changing tokens
    if (address && isConnected) {
      sessionStorage.setItem("lastConnectedAddress", address);
    }
  };

  const handleBuyTokenSelect = useCallback(
    (token: TokenMeta) => {
      // Clear any errors when changing tokens
      if (txError) setTxError(null);
      // Reset input values to prevent stale calculations
      setSellAmt("");
      setBuyAmt("");
      // Set the new token
      setBuyToken(token);
    },
    [txError],
  );

  // Enhanced token selection handlers with error clearing, memoized to prevent re-renders
  const handleSellTokenSelect = useCallback(
    (token: TokenMeta) => {
      // Clear any errors when changing tokens
      if (txError) setTxError(null);
      // Reset input values to prevent stale calculations
      setSellAmt("");
      setBuyAmt("");
      // Set the new token
      setSellToken(token);
    },
    [txError],
  );

  return (
    <div className="relative w-full flex flex-col">
      {/* Terminal Mode Toggle */}
      <div className="flex items-center justify-center mb-4">
        <div className="inline-flex gap-1 border-2 border-border bg-muted p-0.5">
          <button
            onClick={() => setSwapMode("instant")}
            className={`px-3 py-1.5 text-xs font-bold uppercase cursor-pointer transition-all duration-100 font-body hover:opacity-80 focus:ring-2 focus:ring-primary/50 focus:outline-none ${
              swapMode === "instant"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {t("swap.instant")}
          </button>
          <button
            onClick={() => setSwapMode("limit")}
            className={`px-3 py-1.5 text-xs font-bold uppercase cursor-pointer transition-all duration-100 font-body hover:opacity-80 focus:ring-2 focus:ring-primary/50 focus:outline-none ${
              swapMode === "limit"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {t("swap.limit_order")}
          </button>
        </div>
      </div>

      {/* SELL + FLIP + BUY panel container */}
      <div className="relative flex flex-col">
        {/* SELL panel */}
        <SwapPanel
          title={t("common.sell")}
          selectedToken={sellToken}
          tokens={memoizedTokens}
          onSelect={handleSellTokenSelect}
          isEthBalanceFetching={isEthBalanceFetching}
          amount={sellAmt}
          onAmountChange={syncFromSell}
          showMaxButton={!!(sellToken.balance && sellToken.balance > 0n)}
          onMax={() => {
            if (sellToken.id === null) {
              const ethAmount = ((sellToken.balance as bigint) * 99n) / 100n;
              syncFromSell(formatEther(ethAmount));
            } else {
              const decimals = sellToken.decimals || 18;
              syncFromSell(formatUnits(sellToken.balance as bigint, decimals));
            }
          }}
          showPercentageSlider={true}
          className="pb-4"
        />

        {/* FLIP button - absolutely positioned */}
        <div
          className={cn(
            "absolute left-1/2 -translate-x-1/2 z-10",
            !!(sellToken.balance && sellToken.balance > 0n)
              ? "top-[63%]"
              : "top-[50%]",
          )}
        >
          <FlipActionButton onClick={handleFlipTokens} className="" />
        </div>

        {/* BUY panel */}
        {buyToken && (
          <SwapPanel
            title={t("common.buy")}
            selectedToken={buyToken}
            tokens={memoizedTokens}
            onSelect={handleBuyTokenSelect}
            isEthBalanceFetching={isEthBalanceFetching}
            amount={buyAmt}
            onAmountChange={syncFromBuy}
            className="pt-4"
          />
        )}
      </div>
      
      {/* Custom Recipient Input - Subtle dropdown */}
      <div className="mt-3">
        <button
          onClick={() => setShowRecipientInput(!showRecipientInput)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <span>{showRecipientInput ? "▼" : "▶"}</span>
          {t("swap.custom_recipient") || "Custom recipient"}
        </button>
        
        {showRecipientInput && (
          <div className="mt-2 space-y-2">
            <input
              type="text"
              placeholder={`${t("swap.recipient_address") || "Recipient address"} (${t("common.optional") || "optional"})`}
              value={customRecipient}
              onChange={(e) => setCustomRecipient(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {customRecipient && (
              <p className={`text-xs ${
                isAddress(customRecipient) 
                  ? "text-muted-foreground" 
                  : "text-destructive"
              }`}>
                {isAddress(customRecipient)
                  ? `${t("swap.recipient_note") || "Output will be sent to"}: ${customRecipient.slice(0, 6)}...${customRecipient.slice(-4)}`
                  : t("errors.invalid_address") || "Invalid address format"
                }
              </p>
            )}
          </div>
        )}
      </div>
      
      {/* Network indicator */}
      <NetworkError message={t("swap.title")} />

      {/* Limit Order Settings */}
      {swapMode === "limit" && (
        <div className="mt-4 p-3 bg-background/50 rounded-lg border border-primary/20">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-foreground">
              {t("common.order_settings")}
            </span>
          </div>

          <div className="space-y-3">
            {/* Partial Fill Toggle */}
            <div className="flex items-center justify-between">
              <label className="text-sm text-muted-foreground">
                {t("common.allow_partial_fill")}
              </label>
              <button
                onClick={() => setPartialFill(!partialFill)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  partialFill ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-background transition-transform ${
                    partialFill ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Deadline Selector */}
            <div className="flex items-center justify-between">
              <label className="text-sm text-muted-foreground dark:text-gray-300">
                {t("common.expires_in")}
              </label>
              <select
                value={deadline}
                onChange={(e) => setDeadline(Number(e.target.value))}
                className="bg-background border border-primary/20 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value={1}>{t("common.one_day")}</option>
                <option value={2}>{t("common.two_days")}</option>
                <option value={7}>{t("common.one_week")}</option>
                <option value={30}>{t("common.one_month")}</option>
              </select>
            </div>

            {/* Exchange Rate Display */}
            {sellAmt && buyAmt && buyToken && (
              <div className="pt-2 border-t border-primary/10">
                <div className="text-xs text-muted-foreground dark:text-gray-300">
                  Rate: 1 {sellToken.symbol} ={" "}
                  {(
                    Number.parseFloat(buyAmt) / Number.parseFloat(sellAmt)
                  ).toFixed(6)}{" "}
                  {buyToken.symbol}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slippage information - only show in instant mode */}
      {swapMode === "instant" && (
        <SlippageSettings
          setSlippageBps={setSlippageBps}
          slippageBps={slippageBps}
        />
      )}

      {/* Pool information - only show in instant mode */}
      {swapMode === "instant" && canSwap && reserves && (
        <div className="text-xs text-foreground flex justify-between px-1 mt-1">
          {isCoinToCoin &&
          !isDirectUsdtEthSwap &&
          // Extra sanity check - don't show multihop if one token is ETH and the other is USDT
          !(
            (sellToken.id === null && buyToken?.symbol === "USDT") ||
            (buyToken?.id === null && sellToken.symbol === "USDT")
          ) ? (
            <span className="flex items-center">
              <span className="bg-chart-5/20 text-chart-5 px-1 rounded mr-1">
                {t("swap.route")}
              </span>
              {sellToken.symbol} {t("common.to")} ETH {t("common.to")}{" "}
              {buyToken?.symbol}
            </span>
          ) : (
            <span>
              {t("pool.title")}:{" "}
              {formatEther(reserves.reserve0).substring(0, 8)} ETH /{" "}
              {formatUnits(
                reserves.reserve1,
                // Use the correct decimals for the token (6 for USDT, 18 for others)
                isCustomPool
                  ? sellToken.isCustomPool
                    ? sellToken.decimals || 18
                    : buyToken?.decimals || 18
                  : 18,
              ).substring(0, 8)}{" "}
              {coinId
                ? tokens.find((t) => t.id === coinId)?.symbol || "Token"
                : buyToken?.symbol}
            </span>
          )}
          <span>
            {t("common.fee")}:{" "}
            {getSwapFee({
              isCustomPool: isCustomPool,
              sellToken,
              buyToken,
              isCoinToCoin,
            })}
          </span>
        </div>
      )}

      {/* ACTION BUTTON */}
      <button
        onClick={swapMode === "instant" ? executeSwap : createOrder}
        disabled={
          !isConnected ||
          !sellAmt ||
          isPending ||
          (swapMode === "instant" && !canSwap) ||
          (swapMode === "limit" && (!buyAmt || !buyToken))
        }
        className={`mt-2 button text-base px-8 py-4 bg-primary text-primary-foreground font-bold rounded-lg transform transition-all duration-200
          ${
            !isConnected ||
            !sellAmt ||
            isPending ||
            (swapMode === "instant" && !canSwap) ||
            (swapMode === "limit" && (!buyAmt || !buyToken))
              ? "opacity-50 cursor-not-allowed"
              : "opacity-100 hover:scale-105 hover:shadow-lg focus:ring-4 focus:ring-primary/50 focus:outline-none"
          }
        `}
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <LoadingLogo className="m-0 p-0 h-6 w-6" size="sm" />
            {t("common.loading")}
          </span>
        ) : swapMode === "instant" ? (
          t("common.swap")
        ) : (
          t("common.create_order")
        )}
      </button>

      {/* Status and error messages */}
      {/* Show transaction statuses */}
      {txError && txError.includes(t("common.waiting")) && (
        <div className="text-sm text-primary mt-2 flex items-center bg-background/50 p-2 rounded border border-primary/20">
          <LoadingLogo size="sm" className="mr-2 scale-75" />
          {txError}
        </div>
      )}

      {/* Show actual errors (only if not a user rejection) */}
      {((writeError && !isUserRejectionError(writeError)) ||
        (txError && !txError.includes(t("common.waiting")))) && (
        <div className="text-sm text-destructive mt-2 bg-background/50 p-2 rounded border border-destructive/20">
          {writeError && !isUserRejectionError(writeError)
            ? writeError.message
            : txError}
        </div>
      )}

      {/* Success message */}
      {isSuccess && (
        <div className="text-sm text-chart-2 mt-2 flex items-center justify-between bg-background/50 p-2 rounded border border-chart-2/20">
          <div className="flex items-center">
            <CheckIcon className="h-3 w-3 mr-2" />
            {swapMode === "limit"
              ? t("swap.order_created")
              : "Transaction confirmed!"}
          </div>
          {swapMode === "limit" && (
            <Link
              to="/orders"
              className="flex items-center gap-1 text-chart-2 hover:text-chart-2/80 transition-colors text-xs"
            >
              {t("swap.view_orders")}
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      )}

      <div className="mt-4 border-t border-primary pt-4">
        <PoolSwapChart
          buyToken={buyToken}
          sellToken={sellToken}
          prevPair={prevPairRef.current}
        />
      </div>
    </div>
  );
};
