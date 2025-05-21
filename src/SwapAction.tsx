import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PoolSwapChart } from "./PoolSwapChart";
import { Loader2 } from "lucide-react";
import { Button } from "./components/ui/button";
import { SuccessMessage } from "./components/SuccessMessage";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { useTranslation } from "react-i18next";
import {
  analyzeTokens,
  computePoolKey,
  getAmountIn,
  getAmountOut,
  getPoolIds,
  SLIPPAGE_BPS,
  SWAP_FEE,
  getSwapFee,
} from "./lib/swap";
import { NetworkError } from "./components/NetworkError";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSendCalls,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import { handleWalletError, isUserRejectionError } from "./lib/errors";
import { ETH_TOKEN, TokenMeta, USDT_POOL_ID, USDT_POOL_KEY } from "./lib/coins";
import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { mainnet } from "viem/chains";
import { SlippageSettings } from "./components/SlippageSettings";
import { FlipActionButton } from "./components/FlipActionButton";
import { SwapPanel } from "./components/SwapPanel";
import { useReserves } from "./hooks/use-reserves";
import { buildSwapCalls } from "./lib/build-swap-calls";
import { useBatchingSupported } from "./hooks/use-batching-supported";

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

  const [sellToken, setSellToken] = useState<TokenMeta>(ETH_TOKEN);
  const [buyToken, setBuyToken] = useState<TokenMeta | null>(null);

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
  });
  const { data: targetReserves } = useReserves({
    poolId: targetPoolId,
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

  // Reset UI state when tokens change
  useEffect(() => {
    // Reset transaction data
    setTxHash(undefined);
    setTxError(null);

    // Reset amounts
    setSellAmt("");
    setBuyAmt("");
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

  const syncFromBuy = async (val: string) => {
    setBuyAmt(val);
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
          SWAP_FEE,
        );
        setSellAmt(inWei === 0n ? "" : formatEther(inWei));
      } else {
        // Coin → ETH path (calculate Coin input)
        const outWei = parseEther(val || "0");
        const inUnits = getAmountIn(
          outWei,
          reserves.reserve1,
          reserves.reserve0,
          SWAP_FEE,
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
          SWAP_FEE,
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
      console.log("Starting swap execution with tokens:", {
        sellToken: sellToken.symbol,
        buyToken: buyToken?.symbol,
        sellTokenId: sellToken.id?.toString() || "null (ETH)",
        buyTokenId: buyToken?.id?.toString() || "null (ETH)",
        isCustomPoolSwap: isCustomPool,
        isDirectUsdtEthSwap: isDirectUsdtEthSwap || false,
        isCoinToCoin: isCoinToCoin,
      });

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

      // Check if we're dealing with the special USDT token
      let poolKey;
      if (sellToken.isCustomPool || buyToken?.isCustomPool) {
        // Use the custom pool key for USDT-ETH pool
        const customToken = sellToken.isCustomPool ? sellToken : buyToken;
        poolKey = customToken?.poolKey || USDT_POOL_KEY;
        // Create a safe version of poolKey for logging
        const safePoolKey = {
          id0: poolKey.id0.toString(),
          id1: poolKey.id1.toString(),
          token0: poolKey.token0,
          token1: poolKey.token1,
          swapFee: poolKey.swapFee.toString(),
        };
        console.log(
          "Using custom pool key:",
          JSON.stringify(safePoolKey),
          "with poolId:",
          customToken?.poolId?.toString() || USDT_POOL_ID.toString(),
        );
      } else {
        // Regular pool key
        poolKey = computePoolKey(coinId);
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
      });

      console.log("SwapCalls:", calls);

      if (calls.length === 0) {
        console.log("SwapCalls: [No swap calls generated]");
        throw new Error("No swap calls generated");
      }

      if (calls.length > 1) {
        // Either approval or setOperator call is there
        if (isBatchingSupported) {
          console.log("SwapCalls: [Batching Supported, Sending Calls]");
          sendCalls({ calls });
        } else {
          console.log(
            "SwapCalls: [Batching Not Supported, Sequentially Executing Calls]",
          );

          // sequentially execute while waiting for each transaction to be mined
          for (const call of calls) {
            console.log("SwapCalls: [Executing Call]", call);
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
              console.log("Transaction successful");
            } else {
              console.error("Transaction failed");
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

  const flipTokens = () => {
    if (!buyToken) return;

    // Clear any errors when flipping tokens
    if (txError) setTxError(null);

    // Reset input values to prevent stale calculations
    setSellAmt("");
    setBuyAmt("");

    // Enhanced flip with better state handling
    const tempToken = sellToken;
    setSellToken(buyToken);
    setBuyToken(tempToken);

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
    <div className="relative flex flex-col">
      {/* SELL + FLIP + BUY panel container */}
      {/* SELL/PROVIDE panel */}
      <div className="relative flex flex-col">
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
          className="rounded-t-2xl pb-4"
        />
        {/* FLIP button - only shown in swap mode */}
        <FlipActionButton onClick={flipTokens} />
        {buyToken && (
          <SwapPanel
            title={t("common.buy")}
            selectedToken={buyToken}
            tokens={memoizedTokens}
            onSelect={handleBuyTokenSelect}
            isEthBalanceFetching={isEthBalanceFetching}
            amount={buyAmt}
            onAmountChange={syncFromBuy}
            className="mt-2 rounded-b-2xl pt-3 shadow-[0_0_15px_rgba(0,204,255,0.07)]"
          />
        )}
      </div>
      {/* Network indicator */}
      <NetworkError message={t("swap.title")} />

      {/* Slippage information - clickable to show settings */}
      <SlippageSettings
        setSlippageBps={setSlippageBps}
        slippageBps={slippageBps}
      />

      {/* Pool information */}
      {canSwap && reserves && (
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
            {t("swap.price_impact")}:{" "}
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
      <Button
        onClick={executeSwap}
        disabled={!isConnected || !canSwap || !sellAmt || isPending}
        className="w-full text-base sm:text-lg mt-4 h-12 touch-manipulation dark:bg-primary dark:text-card dark:hover:bg-primary/90 dark:shadow-[0_0_20px_rgba(0,204,255,0.3)]"
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </span>
        ) : (
          t("common.swap")
        )}
      </Button>

      {/* Status and error messages */}
      {/* Show transaction statuses */}
      {txError && txError.includes(t("common.waiting")) && (
        <div className="text-sm text-primary mt-2 flex items-center bg-background/50 p-2 rounded border border-primary/20">
          <Loader2 className="h-3 w-3 animate-spin mr-2" />
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
      {isSuccess && <SuccessMessage />}

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
