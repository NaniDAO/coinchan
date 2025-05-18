import { TokenSelector } from "./components/TokenSelector";

export const AddLiquidity = () => {
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

  const executeAddLiquidity = async () => {
    // More specific input validation to catch issues early
    if (!canSwap || !reserves || !address || !publicClient) {
      setTxError("Missing required data for transaction");
      return;
    }

    if (!sellAmt || parseFloat(sellAmt) <= 0) {
      setTxError("Please enter a valid sell amount");
      return;
    }

    if (!buyAmt || parseFloat(buyAmt) <= 0) {
      setTxError("Please enter a valid buy amount");
      return;
    }

    setTxError(null);

    try {
      // Check if we're on mainnet
      if (chainId !== mainnet.id) {
        setTxError("Please connect to Ethereum mainnet to perform this action");
        return;
      }

      // Check if we're dealing with the special USDT token
      let poolKey;
      const isUsdtPool = sellToken.isCustomPool || buyToken?.isCustomPool;

      // Enhanced detection of USDT usage for add liquidity
      // We need to make sure we detect all cases where USDT is being used
      const isUsingUsdt =
        // Standard checks for USDT token address
        (sellToken.isCustomPool && sellToken.token1 === USDT_ADDRESS) ||
        (buyToken?.isCustomPool && buyToken?.token1 === USDT_ADDRESS) ||
        // Additional checks by symbol and ID for redundancy
        sellToken.symbol === "USDT" ||
        buyToken?.symbol === "USDT" ||
        // Check for custom pool with ID=0 (USDT pool)
        (sellToken.isCustomPool && sellToken.id === 0n) ||
        (buyToken?.isCustomPool && buyToken?.id === 0n);

      console.log("Add liquidity with possible USDT:", {
        isUsdtPool,
        isUsingUsdt,
        sellTokenSymbol: sellToken.symbol,
        buyTokenSymbol: buyToken?.symbol,
        sellTokenIsCustom: sellToken.isCustomPool,
        sellTokenAddress: sellToken.token1,
        buyTokenIsCustom: buyToken?.isCustomPool,
        buyTokenAddress: buyToken?.token1,
      });

      // Get the amount of USDT being used
      let usdtAmount = 0n;
      if (isUsingUsdt) {
        console.log("USDT token detected for liquidity addition");

        // Determine which token is USDT and get its amount
        if (
          (sellToken.isCustomPool && sellToken.token1 === USDT_ADDRESS) ||
          sellToken.symbol === "USDT"
        ) {
          usdtAmount = parseUnits(sellAmt, 6); // USDT has 6 decimals
          console.log(
            "Using USDT as sell token with amount:",
            usdtAmount.toString(),
          );
        } else if (
          (buyToken?.isCustomPool && buyToken?.token1 === USDT_ADDRESS) ||
          buyToken?.symbol === "USDT"
        ) {
          usdtAmount = parseUnits(buyAmt, 6); // USDT has 6 decimals
          console.log(
            "Using USDT as buy token with amount:",
            usdtAmount.toString(),
          );
        }

        // Check if we need to verify USDT allowance first
        if (usdtAllowance === null) {
          console.log("USDT allowance is null, checking now...");
          await checkUsdtAllowance();
        }

        // If USDT amount is greater than allowance, request approval
        if (
          usdtAllowance === null ||
          usdtAllowance === 0n ||
          usdtAmount > usdtAllowance
        ) {
          console.log("USDT approval needed for liquidity:", {
            usdtAmount: usdtAmount.toString(),
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
          console.log("USDT already approved for liquidity:", {
            allowance: usdtAllowance.toString(),
            requiredAmount: usdtAmount.toString(),
          });
        }
      }

      if (isUsdtPool) {
        // Use the custom pool key for USDT-ETH pool
        const customToken = sellToken.isCustomPool ? sellToken : buyToken;
        poolKey = customToken?.poolKey || USDT_POOL_KEY;
      } else {
        // Regular pool key
        poolKey = computePoolKey(coinId);
      }

      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      // In ZAMM's design, for all pools:
      // - token0 is always ETH (zeroAddress), id0 is 0
      // - token1 is always the Coin contract (or USDT for custom pool), id1 is the coinId

      // So we need to ensure:
      // - amount0 is the ETH amount (regardless of which input field the user used)
      // - amount1 is the Coin amount

      // Use correct decimals for token1 (6 for USDT, 18 for regular coins)
      const tokenDecimals = isUsdtPool ? 6 : 18;

      const amount0 = isSellETH ? parseEther(sellAmt) : parseEther(buyAmt); // ETH amount
      const amount1 = isSellETH
        ? parseUnits(buyAmt, tokenDecimals)
        : parseUnits(sellAmt, tokenDecimals); // Token amount

      // Verify we have valid amounts
      if (amount0 === 0n || amount1 === 0n) {
        setTxError("Invalid liquidity amounts");
        return;
      }

      // Slippage protection will be calculated after getting exact amounts from ZAMMHelper

      // Check for USDT approvals first if using USDT pool
      if (
        isUsdtPool &&
        !isSellETH &&
        usdtAllowance !== null &&
        amount1 > usdtAllowance
      ) {
        try {
          // First, show a notification about the approval step
          setTxError(
            "Waiting for USDT approval. Please confirm the transaction...",
          );

          // Max approve (uint256 max)
          const maxApproval = 2n ** 256n - 1n;

          // Send the approval transaction
          const approvalHash = await writeContractAsync({
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
            args: [ZAAMAddress, maxApproval],
          });

          // Show a waiting message
          setTxError("USDT approval submitted. Waiting for confirmation...");

          // Wait for the transaction to be mined
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: approvalHash,
          });

          // Check if the transaction was successful
          if (receipt.status === "success") {
            setUsdtAllowance(maxApproval);
            setTxError(null); // Clear the message
          } else {
            setTxError("USDT approval failed. Please try again.");
            return;
          }
        } catch (err) {
          // Use our utility to handle wallet errors
          const errorMsg = handleWalletError(err);
          if (errorMsg) {
            console.error("Failed to approve USDT:", err);
            setTxError("Failed to approve USDT");
          }
          return;
        }
      }

      // Check if the user needs to approve ZAMM as operator for their Coin token
      // This is needed when the user is providing Coin tokens (not just ETH)
      // Since we're always providing Coin tokens in liquidity, we need approval
      // Only needed for regular Coin tokens, not for USDT
      if (!isUsdtPool && isOperator === false) {
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
            setTxError("Failed to approve the liquidity contract as operator");
          }
          return;
        }
      }

      // Use ZAMMHelper to calculate the exact ETH amount to provide
      try {
        // The contract call returns an array of values rather than an object
        const result = await publicClient.readContract({
          address: ZAMMHelperAddress,
          abi: ZAMMHelperAbi,
          functionName: "calculateRequiredETH",
          args: [
            poolKey,
            amount0, // amount0Desired
            amount1, // amount1Desired
          ],
        });

        // Extract the values from the result array
        const [ethAmount, calcAmount0, calcAmount1] = result as [
          bigint,
          bigint,
          bigint,
        ];

        // Detailed logging to help with debugging

        // Calculate minimum amounts based on the actual amounts that will be used by the contract
        const actualAmount0Min = withSlippage(calcAmount0, slippageBps);
        const actualAmount1Min = withSlippage(calcAmount1, slippageBps);

        // Use the ethAmount from ZAMMHelper as the exact value to send
        // IMPORTANT: We should also use the exact calculated amounts for amount0Desired and amount1Desired
        const hash = await writeContractAsync({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "addLiquidity",
          args: [
            poolKey,
            calcAmount0, // use calculated amount0 as amount0Desired
            calcAmount1, // use calculated amount1 as amount1Desired
            actualAmount0Min, // use adjusted min based on calculated amount
            actualAmount1Min, // use adjusted min based on calculated amount
            address, // to
            deadline,
          ],
          value: ethAmount, // Use the exact ETH amount calculated by ZAMMHelper
        });

        setTxHash(hash);
      } catch (calcErr) {
        // Use our utility to handle wallet errors
        const errorMsg = handleWalletError(calcErr);
        if (errorMsg) {
          console.error(
            "Error calling ZAMMHelper.calculateRequiredETH:",
            calcErr,
          );
          setTxError("Failed to calculate exact ETH amount");
        }
        return;
      }
    } catch (err) {
      // Handle errors, but don't display errors for user rejections
      // Use our utility to properly handle wallet errors
      const errorMsg = handleWalletError(err);
      if (errorMsg) {
        console.error("Add liquidity execution error:", err);

        // More specific error messages based on error type
        if (err instanceof Error) {
          if (err.message.includes("insufficient funds")) {
            setTxError("Insufficient funds for this transaction");
          } else if (err.message.includes("InvalidMsgVal")) {
            // This is our critical error where the msg.value doesn't match what the contract expects
            setTxError(
              "Contract rejected ETH value. Please try again with different amounts.",
            );
            console.error(
              "ZAMM contract rejected the ETH value due to strict msg.value validation.",
            );
          } else {
            setTxError("Transaction failed. Please try again.");
          }
        } else {
          setTxError("Unknown error during liquidity provision");
        }
      }
    }
  };

  return (
    <div className="relative flex flex-col">
      {/* SELL/PROVIDE panel */}
      <div
        className={`border-2 border-primary/40 group hover:bg-secondary-foreground ${mode === "liquidity" && liquidityMode === "remove" ? "rounded-md" : "rounded-t-2xl"} p-2 pb-4 focus-within:ring-2 focus-within:ring-primary/60 flex flex-col gap-2 ${mode === "liquidity" && liquidityMode === "remove" ? "mt-2" : ""}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Provide</span>
          <div className={}>
            <TokenSelector
              selectedToken={sellToken}
              tokens={memoizedTokens}
              onSelect={handleSellTokenSelect}
              isEthBalanceFetching={isEthBalanceFetching}
            />
          </div>
        </div>
        <div className="flex justify-between items-center">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder="0.0"
            value={sellAmt}
            onChange={(e) => syncFromSell(e.target.value)}
            className="text-lg sm:text-xl font-medium w-full focus:outline-none h-10 text-right pr-1 bg-transparent dark:text-foreground dark:placeholder-primary/50"
            readOnly={false}
          />
          {/* MAX button for using full balance */}
          {sellToken.balance !== undefined && sellToken.balance > 0n && (
            <button
              className="text-xs bg-primary/10 hover:bg-primary/20 text-primary font-medium px-3 py-1.5 rounded touch-manipulation min-w-[50px] border border-primary/30 shadow-[0_0_5px_rgba(0,204,255,0.15)]"
              onClick={() => {
                // For ETH, leave a small amount for gas
                if (sellToken.id === null) {
                  // Get 99% of ETH balance to leave some for gas
                  const ethAmount =
                    ((sellToken.balance as bigint) * 99n) / 100n;
                  syncFromSell(formatEther(ethAmount));
                } else {
                  // For other tokens, use the full balance with correct decimals
                  // Handle non-standard decimals like USDT (6 decimals)
                  const decimals = sellToken.decimals || 18;
                  syncFromSell(
                    formatUnits(sellToken.balance as bigint, decimals),
                  );
                }
              }}
            >
              MAX
            </button>
          )}
        </div>

        {/* Standard BUY/RECEIVE panel */}
        {buyToken && (
          <div
            className={`border-2 border-primary/40 group rounded-b-2xl p-2 pt-3 focus-within:ring-2 hover:bg-secondary-foreground focus-within:ring-primary/60 shadow-[0_0_15px_rgba(0,204,255,0.07)] flex flex-col gap-2 mt-2`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">And</span>
              <TokenSelector
                selectedToken={buyToken}
                tokens={memoizedTokens}
                onSelect={handleBuyTokenSelect}
                isEthBalanceFetching={isEthBalanceFetching}
              />
            </div>
            <div className="flex justify-between items-center">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0.0"
                value={buyAmt}
                onChange={(e) => syncFromBuy(e.target.value)}
                className="text-lg sm:text-xl font-medium w-full focus:outline-none h-10 text-right pr-1"
                readOnly={false}
              />
            </div>
          </div>
        )}
      </div>
      {/* Network indicator */}
      {isConnected && chainId !== mainnet.id && (
        <div className="text-xs mt-1 px-2 py-1 bg-secondary/70 border border-primary/30 rounded text-foreground">
          <strong>Wrong Network:</strong> Please switch to Ethereum mainnet in
          your wallet to manage liquidity.
        </div>
      )}

      {/* Slippage information - clickable to show settings */}
      <div
        onClick={() => setShowSlippageSettings(!showSlippageSettings)}
        className="text-xs mt-1 px-2 py-1 bg-primary/5 border border-primary/20 rounded text-primary cursor-pointer hover:bg-primary/10 transition-colors"
      >
        <div className="flex justify-between items-center">
          <span>
            <strong>Slippage Tolerance:</strong>${Number(slippageBps) / 100}%
          </span>
          <span className="text-xs text-foreground-secondary">
            {showSlippageSettings ? "▲" : "▼"}
          </span>
        </div>

        {/* Slippage Settings Panel */}
        {showSlippageSettings && (
          <div
            className="mt-2 p-2 bg-primary-background border border-accent rounded-md shadow-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2">
              <div className="flex gap-1 flex-wrap">
                {SLIPPAGE_OPTIONS.map((option) => (
                  <button
                    key={option.value.toString()}
                    onClick={() => setSlippageBps(option.value)}
                    className={`px-2 py-1 text-xs rounded ${
                      slippageBps === option.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-primary"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
                {/* Simple custom slippage input */}
                <div className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-secondary/70 text-foreground">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.1"
                    max="50"
                    step="0.1"
                    placeholder=""
                    className="w-12 bg-transparent outline-none text-center"
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (isNaN(value) || value < 0.1 || value > 50) return;

                      // Convert percentage to basis points
                      const bps = BigInt(Math.floor(value * 100));

                      setSlippageBps(bps);
                    }}
                  />
                  <span>%</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="text-xs bg-muted/50 border border-primary/30 rounded p-2 mt-2 text-muted-foreground">
        <p className="font-medium mb-1">Adding liquidity provides:</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>LP tokens as a proof of your position</li>
          <li>Earn {Number(SWAP_FEE) / 100}% fees from trades</li>
          <li>Withdraw your liquidity anytime</li>
        </ul>
      </div>
      <Button
        onClick={executeAddLiquidity}
        disabled={
          !isConnected ||
          (mode === "liquidity" &&
            liquidityMode === "add" &&
            (!canSwap || !sellAmt)) ||
          isPending
        }
        className="w-full text-base sm:text-lg mt-4 h-12 touch-manipulation dark:bg-primary dark:text-card dark:hover:bg-primary/90 dark:shadow-[0_0_20px_rgba(0,204,255,0.3)]"
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Adding Liquidity…"
                : liquidityMode === "remove"
                  ? "Removing Liquidity…"
                  : "Adding Single-ETH Liquidity…"}
          </span>
        ) : "Add Liquidity"}
      </Button>

      {/* Status and error messages */}
      {/* Show transaction statuses */}
      {txError && txError.includes("Waiting for") && (
        <div className="text-sm text-primary mt-2 flex items-center bg-background/50 p-2 rounded border border-primary/20">
          <Loader2 className="h-3 w-3 animate-spin mr-2" />
          {txError}
        </div>
      )}

      {/* Show actual errors (only if not a user rejection) */}
      {((writeError && !isUserRejectionError(writeError)) ||
        (txError && !txError.includes("Waiting for"))) && (
        <div className="text-sm text-destructive mt-2 bg-background/50 p-2 rounded border border-destructive/20">
          {writeError && !isUserRejectionError(writeError)
            ? writeError.message
            : txError}
        </div>
      )}

      {/* Success message */}
      {isSuccess && (
        <div className="text-sm text-chart-2 mt-2 flex items-center bg-background/50 p-2 rounded border border-chart-2/20">
          <CheckIcon className="h-3 w-3 mr-2" />
          Transaction confirmed!
        </div>
      )}
    </div>
  );
};
