import { NetworkError } from "./components/NetworkError";
import { SuccessMessage } from "./components/SuccessMessage";

export const SingleEthLiquidity = () => {
  // Execute Single-Sided ETH Liquidity Provision
  const executeSingleETHLiquidity = async () => {
    // Validate inputs
    if (!address || !publicClient) {
      setTxError("Missing required data for transaction");
      return;
    }

    // For custom pools like USDT, allow buyToken.id to be 0n
    if (!buyToken?.isCustomPool && !buyToken?.id) {
      setTxError("Please select a valid target token");
      return;
    }

    if (!sellAmt || parseFloat(sellAmt) <= 0) {
      setTxError("Please enter a valid ETH amount");
      return;
    }

    setTxError(null);

    try {
      // Check if we're on mainnet
      if (chainId !== mainnet.id) {
        setTxError("Please connect to Ethereum mainnet to perform this action");
        return;
      }

      // Make sure buyToken.id is properly processed as a BigInt
      // This ensures both searched and manually selected tokens work the same
      const targetTokenId =
        typeof buyToken.id === "bigint"
          ? buyToken.id
          : buyToken.id !== null && buyToken.id !== undefined
            ? BigInt(String(buyToken.id))
            : 0n; // Fallback to 0n if ID is null/undefined (shouldn't happen based on validation)

      // Check if we're dealing with a custom pool like USDT
      let targetPoolKey;
      const isCustomPool = buyToken.isCustomPool;

      if (isCustomPool) {
        // Use the custom pool key for USDT-ETH
        targetPoolKey = buyToken.poolKey || USDT_POOL_KEY;
        console.log("Using custom pool key for Single-ETH liquidity:", {
          token: buyToken.symbol,
          poolKey: JSON.stringify({
            id0: targetPoolKey.id0.toString(),
            id1: targetPoolKey.id1.toString(),
            token0: targetPoolKey.token0,
            token1: targetPoolKey.token1,
            swapFee: targetPoolKey.swapFee.toString(),
          }),
        });
      } else {
        // Regular pool key
        targetPoolKey = computePoolKey(targetTokenId);
      }
      const deadline = nowSec() + BigInt(DEADLINE_SEC);
      const ethAmount = parseEther(sellAmt);

      // Get the reserves for the selected token
      let targetReserves = reserves;

      // If the target token is different from coinId, fetch the correct reserves
      if (targetTokenId !== coinId || isCustomPool) {
        try {
          // Get the pool ID for the target token
          let targetPoolId;

          if (isCustomPool && buyToken.poolId) {
            // Use the custom pool ID for USDT-ETH
            targetPoolId = buyToken.poolId;
            console.log(
              "Using custom pool ID for reserves:",
              targetPoolId.toString(),
            );
          } else {
            // Regular pool ID
            targetPoolId = computePoolId(targetTokenId);
          }

          const result = await publicClient.readContract({
            address: ZAAMAddress,
            abi: ZAAMAbi,
            functionName: "pools",
            args: [targetPoolId],
          });

          const poolData = result as unknown as readonly bigint[];
          targetReserves = {
            reserve0: poolData[0],
            reserve1: poolData[1],
          };
        } catch (err) {
          console.error(
            `Failed to fetch reserves for ${buyToken.symbol}:`,
            err,
          );
          setTxError(
            `Failed to get pool data for ${buyToken.symbol}. Please try again.`,
          );
          return;
        }
      }

      if (
        !targetReserves ||
        targetReserves.reserve0 === 0n ||
        targetReserves.reserve1 === 0n
      ) {
        setTxError(
          `No liquidity available for ${buyToken.symbol}. Please select another token.`,
        );
        return;
      }

      // Half of the ETH will be swapped to tokens by the contract
      const halfEthAmount = ethAmount / 2n;

      // Get correct swap fee for the token (30bps for USDT, default 100bps for regular tokens)
      const swapFee = isCustomPool ? buyToken.swapFee || SWAP_FEE : SWAP_FEE;
      console.log(
        `Using swap fee: ${Number(swapFee) / 100}% for ${buyToken.symbol} in single-ETH liquidity`,
      );

      // Estimate how many tokens we'll get for half the ETH
      const estimatedTokens = getAmountOut(
        halfEthAmount,
        targetReserves.reserve0,
        targetReserves.reserve1,
        swapFee,
      );

      // Apply higher slippage tolerance for Single-ETH operations
      const minTokenAmount = withSlippage(
        estimatedTokens,
        singleEthSlippageBps,
      );

      // Min amounts for the addLiquidity portion with higher slippage for less liquid pools
      const amount0Min = withSlippage(estimatedTokens, singleEthSlippageBps);

      const amount1Min = withSlippage(estimatedTokens, singleEthSlippageBps);

      // Call addSingleLiqETH on the ZAMMSingleLiqETH contract
      const hash = await writeContractAsync({
        address: ZAMMSingleLiqETHAddress,
        abi: ZAMMSingleLiqETHAbi,
        functionName: "addSingleLiqETH",
        args: [
          targetPoolKey,
          minTokenAmount, // Minimum tokens from swap
          amount0Min, // Minimum ETH for liquidity
          amount1Min, // Minimum tokens for liquidity
          address, // LP tokens receiver
          deadline,
        ],
        value: ethAmount, // Send the full ETH amount
      });

      setTxHash(hash);
    } catch (err: unknown) {
      // Enhanced error handling with specific messages for common failure cases
      if (
        typeof err === "object" &&
        err !== null &&
        "message" in err &&
        typeof err.message === "string"
      ) {
        if (err.message.includes("InsufficientOutputAmount")) {
          console.error("Slippage too high in low liquidity pool:", err);
          setTxError(
            "Slippage too high in low liquidity pool. Try again with a smaller amount or use a pool with more liquidity.",
          );
        } else if (err.message.includes("K(")) {
          console.error("Pool balance constraints not satisfied:", err);
          setTxError(
            "Pool balance constraints not satisfied. This usually happens with extreme price impact in low liquidity pools.",
          );
        } else {
          // Default to standard error handling
          const errorMsg = handleWalletError(err);
          if (errorMsg) {
            console.error("Single-sided ETH liquidity execution error:", err);
            setTxError(errorMsg);
          }
        }
      } else {
        // Fallback for non-standard errors
        console.error("Unknown error in Single-ETH liquidity:", err);
        setTxError("An unexpected error occurred. Please try again.");
      }
    }
  };

  return (
    <div>
      {/* SELL + FLIP + BUY panel container */}
      <div className="relative flex flex-col">
        {/* SELL/PROVIDE panel */}
        <div
          className={`border-2 border-primary/40 group hover:bg-secondary-foreground ${mode === "liquidity" && liquidityMode === "remove" ? "rounded-md" : "rounded-t-2xl"} p-2 pb-4 focus-within:ring-2 focus-within:ring-primary/60 flex flex-col gap-2 ${mode === "liquidity" && liquidityMode === "remove" ? "mt-2" : ""}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {mode === "swap"
                ? "Sell"
                : liquidityMode === "add"
                  ? "Provide"
                  : liquidityMode === "remove"
                    ? "You'll Receive (ETH)"
                    : "Provide ETH"}
            </span>
            {/* Render both options but hide one with CSS for hook stability */}
            <>
              {/* ETH-only display for Single-ETH mode */}
              <div
                className={`flex items-center gap-2 bg-transparent border border-primary rounded-md px-2 py-1 ${mode === "liquidity" && liquidityMode === "single-eth" ? "" : "hidden"}`}
              >
                <div className="w-8 h-8 overflow-hidden rounded-full">
                  <img
                    src={ETH_TOKEN.tokenUri}
                    alt="ETH"
                    className="w-8 h-8 object-cover"
                  />
                </div>
                <div className="flex flex-col">
                  <span className="font-medium">ETH</span>
                  <div className="text-xs font-medium text-gray-700 min-w-[50px] h-[14px]">
                    {sellToken.balance !== undefined
                      ? formatEther(sellToken.balance)
                      : "0"}
                    {isEthBalanceFetching && (
                      <span
                        className="text-xs text-primary ml-1"
                        style={{ animation: "pulse 1.5s infinite" }}
                      >
                        ·
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Token selector for all other modes */}
              <div
                className={
                  mode === "liquidity" && liquidityMode === "single-eth"
                    ? "hidden"
                    : ""
                }
              >
                <TokenSelector
                  selectedToken={sellToken}
                  tokens={memoizedTokens}
                  onSelect={handleSellTokenSelect}
                  isEthBalanceFetching={isEthBalanceFetching}
                />
                {/* Removed hidden balance update for debugging that was causing errors */}
              </div>
            </>
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
              readOnly={mode === "liquidity" && liquidityMode === "remove"}
            />
            {mode === "liquidity" && liquidityMode === "remove" && (
              <span className="text-xs text-primary font-medium">Preview</span>
            )}
            {/* MAX button for using full balance */}
            {sellToken.balance !== undefined &&
              sellToken.balance > 0n &&
              (mode === "swap" ||
                (mode === "liquidity" &&
                  (liquidityMode === "add" ||
                    liquidityMode === "single-eth"))) && (
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
        </div>

        {/* FLIP button - only shown in swap mode */}
        {mode === "swap" && (
          <button
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 p-3 rounded-full shadow-xl
            bg-primary hover:bg-primary/80 focus:bg-primary/90 active:scale-95
            shadow-[0_0_15px_rgba(0,204,255,0.3)]
            focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all z-10 touch-manipulation"
            onClick={flipTokens}
          >
            <ArrowDownUp className="h-5 w-5 text-background" />
          </button>
        )}

        {/* ALL BUY/RECEIVE panels - rendering conditionally with CSS for hook stability */}
        {buyToken && (
          <>
            {/* Single-ETH mode panel */}
            <div
              className={`border-2 border-primary/40 group rounded-b-2xl p-2 pt-3 focus-within:ring-2 hover:bg-secondary-foreground focus-within:ring-primary/60 shadow-[0_0_15px_rgba(0,204,255,0.07)] flex flex-col gap-2 mt-2 ${mode === "liquidity" && liquidityMode === "single-eth" ? "" : "hidden"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Target Token
                </span>
                <TokenSelector
                  selectedToken={buyToken}
                  tokens={memoizedNonEthTokens} // Using pre-memoized non-ETH tokens
                  onSelect={handleBuyTokenSelect}
                  isEthBalanceFetching={isEthBalanceFetching}
                />
              </div>
              <div className="flex justify-between items-center">
                <div className="text-xl font-medium w-full">
                  {singleETHEstimatedCoin || "0"}
                </div>
                <span className="text-xs text-primary font-medium">
                  Estimated
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Half of your ETH will be swapped for {buyToken.symbol} and
                paired with the remaining ETH.
              </div>
            </div>

            {/* Standard BUY/RECEIVE panel */}
            <div
              className={`border-2 border-primary/40 group rounded-b-2xl p-2 pt-3 focus-within:ring-2 hover:bg-secondary-foreground focus-within:ring-primary/60 shadow-[0_0_15px_rgba(0,204,255,0.07)] flex flex-col gap-2 mt-2 ${!(mode === "liquidity" && liquidityMode === "single-eth") ? "" : "hidden"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {mode === "swap"
                    ? "Buy"
                    : liquidityMode === "add"
                      ? "And"
                      : `You'll Receive (${buyToken.symbol})`}
                </span>
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
                  readOnly={mode === "liquidity" && liquidityMode === "remove"}
                />
                {mode === "liquidity" && liquidityMode === "remove" && (
                  <span className="text-xs text-chart-5 font-medium">
                    Preview
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Network indicator */}
      {isConnected && chainId !== mainnet.id && (
        <div className="text-xs mt-1 px-2 py-1 bg-secondary/70 border border-primary/30 rounded text-foreground">
          <strong>Wrong Network:</strong> Please switch to Ethereum mainnet in
          your wallet to {mode === "swap" ? "swap tokens" : "manage liquidity"}
        </div>
      )}
      <NetworkError message={}

      {/* Slippage information - clickable to show settings */}
      <div
        onClick={() => setShowSlippageSettings(!showSlippageSettings)}
        className="text-xs mt-1 px-2 py-1 bg-primary/5 border border-primary/20 rounded text-primary cursor-pointer hover:bg-primary/10 transition-colors"
      >
        <div className="flex justify-between items-center">
          <span>
            <strong>Slippage Tolerance:</strong>{" "}
            {Number(singleEthSlippageBps) / 100}%
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
                    onClick={() => setSingleEthSlippageBps(option.value)}
                    className={`px-2 py-1 text-xs rounded ${
                      singleEthSlippageBps === option.value
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

                      setSingleEthSlippageBps(bps);
                    }}
                  />
                  <span>%</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="font-medium mb-1">Single-Sided ETH Liquidity:</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>Provide only ETH to participate in a pool</li>
          <li>Half your ETH is swapped to tokens automatically</li>
          <li>Remaining ETH + tokens are added as liquidity</li>
          <li>Earn {Number(SWAP_FEE) / 100}% fees from trades</li>
        </ul>
      </div>

      {/* Pool information */}
      {canSwap && reserves && (
        <div className="text-xs text-foreground flex justify-between px-1 mt-1">
          {mode === "swap" &&
          isCoinToCoin &&
          !isDirectUsdtEthSwap &&
          // Extra sanity check - don't show multihop if one token is ETH and the other is USDT
          !(
            (sellToken.id === null && buyToken?.symbol === "USDT") ||
            (buyToken?.id === null && sellToken.symbol === "USDT")
          ) ? (
            <span className="flex items-center">
              <span className="bg-chart-5/20 text-chart-5 px-1 rounded mr-1">
                Multi-hop
              </span>
              {sellToken.symbol} → ETH → {buyToken?.symbol}
            </span>
          ) : (
            <span>
              Pool: {formatEther(reserves.reserve0).substring(0, 8)} ETH /{" "}
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
            Fee:{" "}
            {
              // For USDT direct swaps, show the 0.3% fee
              isCustomPool &&
              // Direct USDT-ETH swaps are not multihop
              ((sellToken.id === null &&
                buyToken?.isCustomPool &&
                buyToken?.token1 === USDT_ADDRESS) ||
                (buyToken?.id === null &&
                  sellToken.isCustomPool &&
                  sellToken.token1 === USDT_ADDRESS) ||
                // Other direct USDT swaps
                !isCoinToCoin)
                ? "0.3%"
                : // For multihop swaps, show double fee
                  mode === "swap" && isCoinToCoin
                  ? (Number(SWAP_FEE) * 2) / 100 + "%"
                  : // Default 1% fee for regular swaps
                    Number(SWAP_FEE) / 100 + "%"
            }
          </span>
        </div>
      )}

      {/* ACTION BUTTON */}
      <Button
        onClick={
          executeSingleETHLiquidity // Single-ETH mode
        }
        disabled={
          !isConnected ||
          (liquidityMode === "single-eth" &&
            (!canSwap || !sellAmt || !reserves)) ||
          isPending
        }
        className="w-full text-base sm:text-lg mt-4 h-12 touch-manipulation dark:bg-primary dark:text-card dark:hover:bg-primary/90 dark:shadow-[0_0_20px_rgba(0,204,255,0.3)]"
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Adding Single-ETH Liquidity…
          </span>
        ) : (
          "Add Single-ETH Liquidity"
        )}
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
      {isSuccess && <SuccessMessage />}
    </div>
  );
};
