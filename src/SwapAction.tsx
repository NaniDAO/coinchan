import { PoolSwapChart } from "./PoolSwapChart";

export const SwapAction = () => {
  // Function to approve USDT token for spending by ZAMM contract
  const approveUsdtToken = async () => {
    if (!address || !publicClient || !writeContractAsync) {
      setTxError("Wallet connection required");
      return false;
    }

    try {
      // We don't need to set the txError here since it's already set by the caller
      // (to maintain consistent UX with operator approval)
      console.log("Starting USDT approval process");

      // Standard ERC20 approval for a large amount (max uint256 value would be too gas intensive)
      // 2^64 should be plenty for most transactions (18.4 quintillion units)
      const approvalAmount = 2n ** 64n;

      console.log(
        "Requesting approval for USDT amount:",
        approvalAmount.toString(),
      );

      const hash = await writeContractAsync({
        address: USDT_ADDRESS,
        abi: [
          {
            inputs: [
              { internalType: "address", name: "spender", type: "address" },
              { internalType: "uint256", name: "amount", type: "uint256" },
            ],
            name: "approve",
            outputs: [{ internalType: "bool", name: "", type: "bool" }],
            stateMutability: "nonpayable",
            type: "function",
          },
        ],
        functionName: "approve",
        args: [ZAAMAddress, approvalAmount],
      });

      setTxError("USDT approval submitted. Waiting for confirmation...");
      console.log("USDT approval transaction submitted:", hash);

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
      });

      if (receipt.status === "success") {
        console.log("USDT approval successful");
        setTxError(null); // Clear the error message as the approval succeeded

        // Set allowance directly to our approval amount first to ensure UI responsiveness
        const approvalAmount = 2n ** 64n;
        setUsdtAllowance(approvalAmount);

        // Optionally refresh allowance in the background for accuracy
        try {
          // Refresh the allowance directly without calling checkUsdtAllowance
          const allowance = await publicClient.readContract({
            address: USDT_ADDRESS,
            abi: [
              {
                inputs: [
                  { internalType: "address", name: "owner", type: "address" },
                  { internalType: "address", name: "spender", type: "address" },
                ],
                name: "allowance",
                outputs: [
                  { internalType: "uint256", name: "", type: "uint256" },
                ],
                stateMutability: "view",
                type: "function",
              },
            ],
            functionName: "allowance",
            args: [address, ZAAMAddress],
          });

          console.log(
            "Updated USDT allowance after approval:",
            (allowance as bigint).toString(),
          );
          setUsdtAllowance(allowance as bigint);
        } catch (err) {
          console.warn(
            "Failed to refresh USDT allowance, but approval succeeded:",
            err,
          );
          // We already set the allowance above, so this is just for logging
          // No need to set allowance again
        }
        return true;
      } else {
        console.error("USDT approval transaction failed", receipt);
        setTxError("USDT approval failed. Please try again.");
        return false;
      }
    } catch (err) {
      // Handle user rejection separately to avoid alarming errors
      if (isUserRejectionError(err)) {
        console.log("User rejected USDT approval");
        setTxError("USDT approval rejected");
        return false;
      }

      // Use our utility to handle other wallet errors
      const errorMsg = handleWalletError(err);
      setTxError(errorMsg || "Failed to approve USDT");
      console.error("USDT approval error:", err);
      return false;
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
        setTxError("Wallet not connected. Please connect your wallet first.");
        return;
      }

      if (!canSwap || !sellAmt || !publicClient || !buyToken) {
        // Cannot execute swap - missing prerequisites
        // Check swap prerequisites
        setTxError(
          "Cannot execute swap. Please ensure you have selected a token pair and entered an amount.",
        );
        return;
      }

      // Important: For custom pools like USDT, we have to special-case the reserves check
      if (!reserves && !sellToken.isCustomPool && !buyToken.isCustomPool) {
        console.error("Missing reserves for regular pool swap");
        setTxError("Cannot execute swap. No pool reserves available.");
        return;
      }

      // Clear any previous errors
      setTxError(null);

      // Wait a moment to ensure wallet connection is stable
      if (publicClient && !publicClient.getChainId) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (!publicClient.getChainId) {
          setTxError(
            "Wallet connection not fully established. Please wait a moment and try again.",
          );
          return;
        }
      }

      // Check if we're on mainnet
      if (chainId !== mainnet.id) {
        setTxError("Please connect to Ethereum mainnet to perform this action");
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
            ? (sellToken.isCustomPool
                ? sellToken.swapFee
                : buyToken?.swapFee) || SWAP_FEE
            : SWAP_FEE;

        const amountInWei = parseEther(sellAmt || "0");
        const rawOut = reserves
          ? getAmountOut(
              amountInWei,
              reserves.reserve0,
              reserves.reserve1,
              swapFee,
            )
          : 0n;

        if (rawOut === 0n) {
          setTxError("Output amount is zero. Check pool liquidity.");
          return;
        }

        // Create a deadline timestamp
        const deadline = nowSec() + BigInt(DEADLINE_SEC);

        // simulate multicall
        await simulateContractInteraction({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "swapExactIn",
          args: [
            poolKey,
            amountInWei,
            withSlippage(rawOut, slippageBps),
            true,
            address,
            deadline,
          ],
          value: amountInWei,
        });

        const gas = await estimateContractGas({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "swapExactIn",
          args: [
            poolKey,
            amountInWei,
            withSlippage(rawOut, slippageBps),
            true,
            address,
            deadline,
          ],
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
        const isUsdtSwap =
          buyToken?.isCustomPool && buyToken?.token1 === USDT_ADDRESS;

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
          args: [
            poolKey,
            amountInWei,
            withSlippage(rawOut, slippageBps),
            true,
            address,
            deadline,
          ],
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

        const isBuyingUsdt =
          buyToken?.isCustomPool && buyToken?.token1 === USDT_ADDRESS;

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

          // If allowance is null, it hasn't been checked yet - wait for check to complete
          if (usdtAllowance === null) {
            console.log("USDT allowance is null, checking now...");
            await checkUsdtAllowance();
          }

          // Now check if we need approval - force approval dialog to appear for any USDT transaction
          if (
            usdtAllowance === null ||
            usdtAllowance === 0n ||
            amountInUnits > usdtAllowance
          ) {
            console.log("USDT approval needed:", {
              usdtAmount: amountInUnits.toString(),
              allowance: usdtAllowance?.toString() || "0",
            });

            // Maintain consistent UX with operator approval flow
            setTxError(
              "Waiting for USDT approval. Please confirm the transaction...",
            );
            const approved = await approveUsdtToken();
            if (!approved) {
              return; // Stop if approval failed or was rejected
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
            setTxError(
              "Waiting for operator approval. Please confirm the transaction...",
            );

            // Send the approval transaction
            const approvalHash = await writeContractAsync({
              address: CoinsAddress,
              abi: CoinsAbi,
              functionName: "setOperator",
              args: [ZAAMAddress, true],
            });

            // Show a waiting message
            setTxError(
              "Operator approval submitted. Waiting for confirmation...",
            );

            // Wait for the transaction to be mined
            const receipt = await publicClient.waitForTransactionReceipt({
              hash: approvalHash,
            });

            // Check if the transaction was successful
            if (receipt.status === "success") {
              setIsOperator(true);
              setTxError(null); // Clear the message
            } else {
              setTxError("Operator approval failed. Please try again.");
              return;
            }
          } catch (err) {
            // Use our utility to handle wallet errors
            const errorMsg = handleWalletError(err);
            if (errorMsg) {
              console.error("Failed to approve operator:", err);
              setTxError("Failed to approve the swap contract as operator");
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
            const { createCoinSwapMulticall, estimateCoinToCoinOutput } =
              await import("./lib/swap");

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

            const targetPoolData =
              targetPoolResult as unknown as readonly bigint[];
            const targetReserves = {
              reserve0: targetPoolData[0],
              reserve1: targetPoolData[1],
            };

            // Get correct swap fees for both pools
            const sourceSwapFee = sellToken.isCustomPool
              ? sellToken.swapFee || SWAP_FEE
              : SWAP_FEE;
            const targetSwapFee = buyToken?.isCustomPool
              ? buyToken.swapFee || SWAP_FEE
              : SWAP_FEE;

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
              setTxError("Output amount is zero. Check pool liquidity.");
              return;
            }

            // Create the multicall data for coin-to-coin swap via ETH
            // We need to provide custom pool keys for USDT pools
            // Cast to any to avoid TypeScript errors with `0x${string}` format
            const sourcePoolKey =
              sellToken.isCustomPool && sellToken.poolKey
                ? (sellToken.poolKey as any)
                : computePoolKey(sellToken.id!);

            const targetPoolKey =
              buyToken.isCustomPool && buyToken.poolKey
                ? (buyToken.poolKey as any)
                : computePoolKey(buyToken.id!);

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
              setTxError("Failed to execute coin-to-coin swap");
            }
            return;
          }
        }

        // Default path for Coin to ETH swap
        // Get the correct swap fee (custom fee for USDT, default fee for regular tokens)
        const swapFee =
          sellToken.isCustomPool || buyToken?.isCustomPool
            ? (sellToken.isCustomPool
                ? sellToken.swapFee
                : buyToken?.swapFee) || SWAP_FEE
            : SWAP_FEE;

        const rawOut = reserves
          ? getAmountOut(
              amountInUnits,
              reserves.reserve1,
              reserves.reserve0,
              swapFee,
            )
          : 0n;

        if (rawOut === 0n) {
          setTxError("Output amount is zero. Check pool liquidity.");
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
          hasAllowance: isSellingUsdt
            ? usdtAllowance !== null && usdtAllowance >= amountInUnits
            : "N/A",
        });

        // Execute the swap
        const hash = await writeContractAsync({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "swapExactIn",
          args: [
            poolKey,
            amountInUnits,
            withSlippage(rawOut, slippageBps),
            false,
            address,
            deadline,
          ],
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
          setTxError(
            "Wallet connection issue detected. Please refresh the page and try again.",
          );

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
          setTxError(
            "Swap failed due to price movement in low liquidity pool. Try again or use a smaller amount.",
          );
        } else if (errMsg.includes("K(")) {
          setTxError(
            "Swap failed due to pool constraints. This usually happens with large orders in small pools.",
          );
        } else {
          // Default to standard error handling
          const errorMsg = handleWalletError(err);
          if (errorMsg) {
            setTxError(errorMsg);
          }
        }
      } else {
        // Fallback for non-standard errors
        setTxError("An unexpected error occurred. Please try again.");
      }
    }
  };

  return (
    <div className="relative flex flex-col">
      <div className="mt-4 border-t border-primary pt-4">
        <PoolSwapChart buyToken={buyToken} sellToken={sellToken} />
      </div>
    </div>
  );
};
