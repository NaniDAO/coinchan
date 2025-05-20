import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PoolSwapChart } from "./PoolSwapChart";
import { Loader2 } from "lucide-react";
import { Button } from "./components/ui/button";
import { SuccessMessage } from "./components/SuccessMessage";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { useTranslation } from "react-i18next";
import {
  analyzeTokens,
  computePoolId,
  computePoolKey,
  DEADLINE_SEC,
  getAmountIn,
  getAmountOut,
  getPoolIds,
  SLIPPAGE_BPS,
  SWAP_FEE,
  withSlippage,
  getSwapFee,
} from "./lib/swap";
import { NetworkError } from "./components/NetworkError";
import { useOperatorStatus } from "./hooks/use-operator-status";
import { useAccount, useChainId, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { handleWalletError, isUserRejectionError } from "./lib/errors";
import { ETH_TOKEN, TokenMeta, USDT_ADDRESS, USDT_POOL_ID, USDT_POOL_KEY } from "./lib/coins";
import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { ZAAMAbi, ZAAMAddress } from "./constants/ZAAM";
import { mainnet } from "viem/chains";
import { nowSec } from "./lib/utils";
import { estimateContractGas, simulateContractInteraction } from "@/lib/simulate";
import { CoinsAbi, CoinsAddress } from "./constants/Coins";
import { SlippageSettings } from "./components/SlippageSettings";
import { FlipActionButton } from "./components/FlipActionButton";
import { SwapPanel } from "./components/SwapPanel";
import { useReserves } from "./hooks/use-reserves";
import { useErc20Allowance } from "./hooks/use-erc20-allowance";

export const SwapAction = () => {
  const { t } = useTranslation();
  const { address, isConnected } = useAccount();
  const { data: isOperator, refetch: refetchOperator } = useOperatorStatus(address);
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
  const { writeContractAsync, isPending, error: writeError } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const {
    allowance: usdtAllowance,
    refetchAllowance: refetchUsdtAllowance,
    approveMax: approveUsdtMax,
  } = useErc20Allowance({
    token: USDT_ADDRESS,
    spender: ZAAMAddress,
  });
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
        const inWei = getAmountIn(outUnits, reserves.reserve0, reserves.reserve1, SWAP_FEE);
        setSellAmt(inWei === 0n ? "" : formatEther(inWei));
      } else {
        // Coin → ETH path (calculate Coin input)
        const outWei = parseEther(val || "0");
        const inUnits = getAmountIn(outWei, reserves.reserve1, reserves.reserve0, SWAP_FEE);
        // Use correct decimals for the sell token (6 for USDT, 18 for regular coins)
        const sellTokenDecimals = sellToken?.decimals || 18;
        setSellAmt(inUnits === 0n ? "" : formatUnits(inUnits, sellTokenDecimals));
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
          const sourceSwapFee = sellToken.isCustomPool ? sellToken.swapFee || SWAP_FEE : SWAP_FEE;
          const targetSwapFee = buyToken?.isCustomPool ? buyToken.swapFee || SWAP_FEE : SWAP_FEE;

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
          setBuyAmt(amountOut === 0n ? "" : formatUnits(amountOut, buyTokenDecimals));
        } catch (err) {
          console.error("Error estimating coin-to-coin output:", err);
          setBuyAmt("");
        }
      } else if (isSellETH) {
        // ETH → Coin path
        const inWei = parseEther(val || "0");
        const outUnits = getAmountOut(inWei, reserves.reserve0, reserves.reserve1, SWAP_FEE);
        // Use correct decimals for the buy token (6 for USDT, 18 for regular coins)
        const buyTokenDecimals = buyToken?.decimals || 18;
        setBuyAmt(outUnits === 0n ? "" : formatUnits(outUnits, buyTokenDecimals));
      } else {
        // Coin → ETH path
        // Use correct decimals for the sell token (6 for USDT, 18 for regular coins)
        const sellTokenDecimals = sellToken?.decimals || 18;
        const inUnits = parseUnits(val || "0", sellTokenDecimals);
        const outWei = getAmountOut(inUnits, reserves.reserve1, reserves.reserve0, SWAP_FEE);
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
        setTxError(t('errors.wallet_connection'));
        return;
      }

      if (!canSwap || !sellAmt || !publicClient || !buyToken) {
        // Cannot execute swap - missing prerequisites
        // Check swap prerequisites
        setTxError(t('swap.enter_amount'));
        return;
      }

      // Important: For custom pools like USDT, we have to special-case the reserves check
      if (!reserves && !sellToken.isCustomPool && !buyToken.isCustomPool) {
        console.error("Missing reserves for regular pool swap");
        setTxError(t('errors.network_error'));
        return;
      }

      // Clear any previous errors
      setTxError(null);

      // Wait a moment to ensure wallet connection is stable
      if (publicClient && !publicClient.getChainId) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (!publicClient.getChainId) {
          setTxError(t('errors.wallet_connection'));
          return;
        }
      }

      // Check if we're on mainnet
      if (chainId !== mainnet.id) {
        setTxError(t('errors.network_error'));
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

      if (isSellETH) {
        // Get the correct swap fee (custom fee for USDT, default fee for regular tokens)
        const swapFee =
          sellToken.isCustomPool || buyToken?.isCustomPool
            ? (sellToken.isCustomPool ? sellToken.swapFee : buyToken?.swapFee) || SWAP_FEE
            : SWAP_FEE;

        const amountInWei = parseEther(sellAmt || "0");
        const rawOut = reserves ? getAmountOut(amountInWei, reserves.reserve0, reserves.reserve1, swapFee) : 0n;

        if (rawOut === 0n) {
          setTxError(t('swap.insufficient_balance'));
          return;
        }

        // Create a deadline timestamp
        const deadline = nowSec() + BigInt(DEADLINE_SEC);

        // simulate multicall
        await simulateContractInteraction({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "swapExactIn",
          args: [poolKey, amountInWei, withSlippage(rawOut, slippageBps), true, address, deadline],
          value: amountInWei,
        });

        const gas = await estimateContractGas({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "swapExactIn",
          args: [poolKey, amountInWei, withSlippage(rawOut, slippageBps), true, address, deadline],
          value: amountInWei,
        });

        // Simulation complete

        // Create a safe version of poolKey for logging
        const safePoolKey = {
          id0: poolKey.id0.toString(),
          id1: poolKey.id1.toString(),
          token0: poolKey.token0,
          token1: poolKey.token1,
          swapFee: poolKey.swapFee.toString(),
        };

        // Check if this is a direct ETH->USDT swap
        const isUsdtSwap = buyToken?.isCustomPool && buyToken?.token1 === USDT_ADDRESS;

        console.log("Executing ETH->Coin swap with:", {
          poolKey: JSON.stringify(safePoolKey),
          amountIn: amountInWei.toString(),
          minOut: withSlippage(rawOut, slippageBps).toString(),
          fee: poolKey.swapFee.toString(),
          fromETH: true,
          isUsdtSwap,
        });

        const hash = await writeContractAsync({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "swapExactIn",
          args: [poolKey, amountInWei, withSlippage(rawOut, slippageBps), true, address, deadline],
          value: amountInWei,
          gas: gas,
        });
        setTxHash(hash);
      } else {
        // Check if we're dealing with USDT (custom token)
        // Improved detection to make sure we don't miss USDT tokens
        const isSellingUsdt =
          (sellToken.isCustomPool && sellToken.token1 === USDT_ADDRESS) ||
          // Double-check by symbol as a fallback
          sellToken.symbol === "USDT" ||
          // Also check ID=0 which is used for USDT
          (sellToken.isCustomPool && sellToken.id === 0n);

        const isBuyingUsdt = buyToken?.isCustomPool && buyToken?.token1 === USDT_ADDRESS;

        console.log("Direct swap involving:", {
          sellToken: sellToken.symbol,
          buyToken: buyToken?.symbol,
          sellTokenId: sellToken.id?.toString(),
          isCustomPool: sellToken.isCustomPool,
          token1Address: sellToken.token1,
          usdtAddress: USDT_ADDRESS,
          isSellingUsdt,
          isBuyingUsdt,
          currentAllowance: usdtAllowance?.toString() || "null",
        });

        const decimals = sellToken.decimals || 18;

        // Parse with correct decimals (6 for USDT, 18 for regular tokens)
        const amountInUnits = parseUnits(sellAmt || "0", decimals);

        // Special case for USDT: Check and approve USDT allowance
        if (isSellingUsdt) {
          console.log("Checking USDT allowance before swap");

          // If allowance is undefined, it hasn't been checked yet - wait for check to complete
          if (usdtAllowance === undefined) {
            console.log("USDT allowance is null, checking now...");
            await refetchUsdtAllowance();
          }

          // Now check if we need approval - force approval dialog to appear for any USDT transaction
          if (usdtAllowance === undefined || usdtAllowance === 0n || amountInUnits > usdtAllowance) {
            console.log("USDT approval needed:", {
              usdtAmount: amountInUnits.toString(),
              allowance: usdtAllowance?.toString() || "0",
            });

            // Maintain consistent UX with operator approval flow
            setTxError(`${t('common.waiting')} ${t('common.approve')}...`);
            const approved = await approveUsdtMax();

            if (approved === undefined) {
              return; // Stop if approval failed or was rejected
            } else {
              // wait for tx success
              const receipt = await publicClient.waitForTransactionReceipt({
                hash: approved,
              });

              if (receipt.status === "success") {
                await refetchUsdtAllowance();
              } else {
                return;
              }
            }
          } else {
            console.log("USDT already approved:", {
              allowance: usdtAllowance.toString(),
              requiredAmount: amountInUnits.toString(),
            });
          }
        }

        // Approve ZAAM as operator if needed (for regular tokens, not USDT)
        if (!isSellingUsdt && isOperator === false) {
          try {
            // First, show a notification about the approval step
            setTxError(`${t('common.waiting')} ${t('common.approve')}...`);

            // Send the approval transaction
            const approvalHash = await writeContractAsync({
              address: CoinsAddress,
              abi: CoinsAbi,
              functionName: "setOperator",
              args: [ZAAMAddress, true],
            });

            // Show a waiting message
            setTxError(t('notifications.transaction_sent'));

            // Wait for the transaction to be mined
            const receipt = await publicClient.waitForTransactionReceipt({
              hash: approvalHash,
            });

            // Check if the transaction was successful
            if (receipt.status === "success") {
              await refetchOperator();
              setTxError(null); // Clear the message
            } else {
              setTxError(t('errors.transaction_error'));
              return;
            }
          } catch (err) {
            // Use our utility to handle wallet errors
            const errorMsg = handleWalletError(err);
            if (errorMsg) {
              console.error("Failed to approve operator:", err);
              setTxError(t('errors.transaction_error'));
            }
            return;
          }
        }

        // If we have two different Coin IDs, use the multicall path for Coin to Coin swap
        if (
          buyToken?.id !== null &&
          buyToken?.id !== undefined &&
          sellToken.id !== null &&
          buyToken.id !== sellToken.id
        ) {
          try {
            // Import our helper dynamically to avoid circular dependencies
            const { createCoinSwapMulticall, estimateCoinToCoinOutput } = await import("./lib/swap");

            // Fetch target coin reserves
            let targetPoolId;
            if (buyToken.isCustomPool && buyToken.poolId) {
              // Use the custom pool ID for USDT-ETH
              targetPoolId = buyToken.poolId;
            } else {
              // Regular pool ID
              targetPoolId = computePoolId(buyToken.id!);
            }

            const targetPoolResult = await publicClient.readContract({
              address: ZAAMAddress,
              abi: ZAAMAbi,
              functionName: "pools",
              args: [targetPoolId],
            });

            const targetPoolData = targetPoolResult as unknown as readonly bigint[];
            const targetReserves = {
              reserve0: targetPoolData[0],
              reserve1: targetPoolData[1],
            };

            // Get correct swap fees for both pools
            const sourceSwapFee = sellToken.isCustomPool ? sellToken.swapFee || SWAP_FEE : SWAP_FEE;
            const targetSwapFee = buyToken?.isCustomPool ? buyToken.swapFee || SWAP_FEE : SWAP_FEE;

            // Estimate the final output amount and intermediate ETH amount
            const {
              amountOut,
              withSlippage: minAmountOut,
              ethAmountOut,
            } = estimateCoinToCoinOutput(
              sellToken.id!,
              buyToken.id!,
              amountInUnits,
              reserves || { reserve0: 0n, reserve1: 0n }, // source reserves
              targetReserves, // target reserves
              slippageBps, // Use current slippage setting
              sourceSwapFee, // Pass source pool fee (could be 30n for USDT)
              targetSwapFee, // Pass target pool fee (could be 30n for USDT)
            );

            if (amountOut === 0n) {
              setTxError(t('swap.output_zero'));
              return;
            }

            // Create the multicall data for coin-to-coin swap via ETH
            // We need to provide custom pool keys for USDT pools
            // Cast to any to avoid TypeScript errors with `0x${string}` format
            const sourcePoolKey =
              sellToken.isCustomPool && sellToken.poolKey ? (sellToken.poolKey as any) : computePoolKey(sellToken.id!);

            const targetPoolKey =
              buyToken.isCustomPool && buyToken.poolKey ? (buyToken.poolKey as any) : computePoolKey(buyToken.id!);

            const multicallData = createCoinSwapMulticall(
              sellToken.id!,
              buyToken.id!,
              amountInUnits,
              ethAmountOut, // Pass the estimated ETH output for the second swap
              minAmountOut,
              address,
              sourcePoolKey, // Custom source pool key
              targetPoolKey, // Custom target pool key
            );

            // Log the calls we're making for debugging
            // simulate multicall
            await simulateContractInteraction({
              address: ZAAMAddress,
              abi: ZAAMAbi,
              functionName: "multicall",
              args: [multicallData],
            });

            const gas = await estimateContractGas({
              address: ZAAMAddress,
              abi: ZAAMAbi,
              functionName: "multicall",
              args: [multicallData],
            });

            // Simulation complete
            // Simulation complete

            // Create safe versions of pool keys for logging
            const safeSourcePoolKey = {
              id0: sourcePoolKey.id0.toString(),
              id1: sourcePoolKey.id1.toString(),
              token0: sourcePoolKey.token0,
              token1: sourcePoolKey.token1,
              swapFee: sourcePoolKey.swapFee.toString(),
            };

            const safeTargetPoolKey = {
              id0: targetPoolKey.id0.toString(),
              id1: targetPoolKey.id1.toString(),
              token0: targetPoolKey.token0,
              token1: targetPoolKey.token1,
              swapFee: targetPoolKey.swapFee.toString(),
            };

            console.log("Executing Coin->Coin swap with:", {
              sourcePoolKey: JSON.stringify(safeSourcePoolKey),
              targetPoolKey: JSON.stringify(safeTargetPoolKey),
              sourceSwapFee: sourceSwapFee.toString(),
              targetSwapFee: targetSwapFee.toString(),
              amountIn: amountInUnits.toString(),
              ethEstimate: ethAmountOut.toString(),
              minOut: minAmountOut.toString(),
            });

            // Execute the multicall transaction
            const hash = await writeContractAsync({
              address: ZAAMAddress,
              abi: ZAAMAbi,
              functionName: "multicall",
              args: [multicallData],
              gas,
            });

            setTxHash(hash);
            return;
          } catch (err) {
            // Use our utility to handle wallet errors
            const errorMsg = handleWalletError(err);
            if (errorMsg) {
              console.error("Error in multicall swap:", err);
              setTxError(t('errors.coin_to_coin_swap_failed'));
            }
            return;
          }
        }

        // Default path for Coin to ETH swap
        // Get the correct swap fee (custom fee for USDT, default fee for regular tokens)
        const swapFee =
          sellToken.isCustomPool || buyToken?.isCustomPool
            ? (sellToken.isCustomPool ? sellToken.swapFee : buyToken?.swapFee) || SWAP_FEE
            : SWAP_FEE;

        const rawOut = reserves ? getAmountOut(amountInUnits, reserves.reserve1, reserves.reserve0, swapFee) : 0n;

        if (rawOut === 0n) {
          setTxError(t('swap.insufficient_balance'));
          return;
        }

        // Create a deadline timestamp
        const deadline = nowSec() + BigInt(DEADLINE_SEC);

        // Add debugging info
        console.log("Executing Coin->ETH swap with:", {
          poolKey: JSON.stringify({
            id0: poolKey.id0.toString(),
            id1: poolKey.id1.toString(),
            token0: poolKey.token0,
            token1: poolKey.token1,
            swapFee: poolKey.swapFee.toString(),
          }),
          amountIn: amountInUnits.toString(),
          minOut: withSlippage(rawOut, slippageBps).toString(),
          isSellingUsdt,
          hasAllowance: isSellingUsdt ? usdtAllowance !== undefined && usdtAllowance >= amountInUnits : "N/A",
        });

        // Execute the swap
        const hash = await writeContractAsync({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "swapExactIn",
          args: [poolKey, amountInUnits, withSlippage(rawOut, slippageBps), false, address, deadline],
        });
        setTxHash(hash);
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
      if (typeof err === "object" && err !== null && "message" in err && typeof err.message === "string") {
        const errMsg = err.message;

        // Handle wallet connection errors
        if (errMsg.includes("getChainId") || errMsg.includes("connector") || errMsg.includes("connection")) {
          // Wallet connection issue
          setTxError(t('errors.wallet_connection_refresh'));

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
          setTxError(t('errors.insufficient_output_amount'));
        } else if (errMsg.includes("K(")) {
          setTxError(t('errors.pool_constraints'));
        } else {
          // Default to standard error handling
          const errorMsg = handleWalletError(err);
          if (errorMsg) {
            setTxError(errorMsg);
          }
        }
      } else {
        // Fallback for non-standard errors
        setTxError(t('errors.unexpected'));
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
          title={t('common.sell')}
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
            title={t('common.buy')}
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
      <NetworkError message={t('swap.title')} />

      {/* Slippage information - clickable to show settings */}
      <SlippageSettings setSlippageBps={setSlippageBps} slippageBps={slippageBps} />

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
              <span className="bg-chart-5/20 text-chart-5 px-1 rounded mr-1">{t('swap.route')}</span>
              {sellToken.symbol} {t('common.to')} ETH {t('common.to')} {buyToken?.symbol}
            </span>
          ) : (
            <span>
              {t('pool.title')}: {formatEther(reserves.reserve0).substring(0, 8)} ETH /{" "}
              {formatUnits(
                reserves.reserve1,
                // Use the correct decimals for the token (6 for USDT, 18 for others)
                isCustomPool ? (sellToken.isCustomPool ? sellToken.decimals || 18 : buyToken?.decimals || 18) : 18,
              ).substring(0, 8)}{" "}
              {coinId ? tokens.find((t) => t.id === coinId)?.symbol || "Token" : buyToken?.symbol}
            </span>
          )}
          <span>
            {t('swap.price_impact')}:{" "}
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
            {t('common.loading')}
          </span>
        ) : (
          t('common.swap')
        )}
      </Button>

      {/* Status and error messages */}
      {/* Show transaction statuses */}
      {txError && txError.includes(t('common.waiting')) && (
        <div className="text-sm text-primary mt-2 flex items-center bg-background/50 p-2 rounded border border-primary/20">
          <Loader2 className="h-3 w-3 animate-spin mr-2" />
          {txError}
        </div>
      )}

      {/* Show actual errors (only if not a user rejection) */}
      {((writeError && !isUserRejectionError(writeError)) || (txError && !txError.includes(t('common.waiting')))) && (
        <div className="text-sm text-destructive mt-2 bg-background/50 p-2 rounded border border-destructive/20">
          {writeError && !isUserRejectionError(writeError) ? writeError.message : txError}
        </div>
      )}

      {/* Success message */}
      {isSuccess && <SuccessMessage />}

      <div className="mt-4 border-t border-primary pt-4">
        <PoolSwapChart buyToken={buyToken} sellToken={sellToken} prevPair={prevPairRef.current} />
      </div>
    </div>
  );
};
