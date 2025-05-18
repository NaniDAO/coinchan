import { useCallback, useEffect, useMemo, useState } from "react";
import { NetworkError } from "./components/NetworkError";
import { SuccessMessage } from "./components/SuccessMessage";
import { ETH_TOKEN, TokenMeta, USDT_POOL_ID, USDT_POOL_KEY } from "./lib/coins";
import { Button } from "./components/ui/button";
import { Loader2 } from "lucide-react";
import {
  ZAMMSingleLiqETHAbi,
  ZAMMSingleLiqETHAddress,
} from "./constants/ZAMMSingleLiqETH";
import {
  computePoolId,
  computePoolKey,
  DEADLINE_SEC,
  getAmountOut,
  SINGLE_ETH_SLIPPAGE_BPS,
  SWAP_FEE,
  withSlippage,
} from "./lib/swap";
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { mainnet } from "viem/chains";
import { nowSec } from "./lib/utils";
import { formatEther, formatUnits, parseEther } from "viem";
import { ZAAMAbi, ZAAMAddress } from "./constants/ZAAM";
import { handleWalletError, isUserRejectionError } from "./lib/errors";
import { SlippageSettings } from "./components/SlippageSettings";
import { TokenSelector } from "./components/TokenSelector";

export const SingleEthLiquidity = () => {
  /* State */
  /* user inputs */
  const [sellAmt, setSellAmt] = useState("");
  const [, setBuyAmt] = useState("");

  const [sellToken, setSellToken] = useState<TokenMeta>(ETH_TOKEN);
  const [buyToken, setBuyToken] = useState<TokenMeta | null>(null);

  const [reserves, setReserves] = useState<{
    reserve0: bigint;
    reserve1: bigint;
  } | null>(null);

  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);

  const [singleEthSlippageBps, setSingleEthSlippageBps] = useState<bigint>(
    SINGLE_ETH_SLIPPAGE_BPS,
  );
  const [singleETHEstimatedCoin, setSingleETHEstimatedCoin] =
    useState<string>("");

  const { tokens, isEthBalanceFetching } = useAllCoins();

  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const {
    writeContractAsync,
    isPending,
    error: writeError,
  } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const publicClient = usePublicClient({
    chainId,
  });
  const { data: ethBalance } = useBalance({
    chainId,
  });

  const isSellETH = sellToken.id === null;
  // For custom USDT-ETH pool, we need special logic to determine if it's a multihop
  // Check if either token is USDT by symbol instead of relying on token1
  const isSellUSDT = sellToken.isCustomPool && sellToken.symbol === "USDT";
  const isBuyUSDT = buyToken?.isCustomPool && buyToken?.symbol === "USDT";

  // USDT-ETH direct swaps (either direction) should NOT be treated as multihop
  const isDirectUsdtEthSwap =
    // ETH <-> USDT direct swap
    (sellToken.id === null && isBuyUSDT) ||
    (buyToken?.id === null && isSellUSDT);

  // Log the direct USDT swap detection for debugging
  if (sellToken.isCustomPool || buyToken?.isCustomPool) {
    console.log("ETH-USDT Swap Detection:", {
      isDirectUsdtEthSwap,
      sellIsETH: sellToken.id === null,
      buyIsETH: buyToken?.id === null,
      sellIsCustom: sellToken.isCustomPool,
      buyIsCustom: buyToken?.isCustomPool,
      isSellUSDT,
      isBuyUSDT,
      sellSymbol: sellToken.symbol,
      buySymbol: buyToken?.symbol,
    });
  }

  // Ensure coinId is always a valid bigint, never undefined
  // Special case: if dealing with a custom pool like USDT, we need to use 0n but mark it as valid
  const isCustomPool = sellToken?.isCustomPool || buyToken?.isCustomPool;
  let coinId;

  if (isCustomPool) {
    // For custom pools, use the non-ETH token's ID
    if (isSellETH) {
      coinId = buyToken?.id ?? 0n;
    } else {
      coinId = sellToken?.id ?? 0n;
    }
    console.log("Using custom pool coinId:", coinId?.toString());
  } else {
    // For regular pools, ensure valid non-zero ID
    coinId =
      (isSellETH
        ? buyToken?.id !== undefined
          ? buyToken.id
          : 0n
        : sellToken.id) ?? 0n;
  }
  // Create a memoized version of tokens that doesn't change with every render
  const memoizedTokens = useMemo(() => tokens, [tokens]);
  // Also create a memoized version of non-ETH tokens to avoid conditional hook calls
  const memoizedNonEthTokens = useMemo(
    () => memoizedTokens.filter((token) => token.id !== null),
    [memoizedTokens],
  );

  // Fetch reserves directly
  useEffect(() => {
    const fetchReserves = async () => {
      // Check if we're dealing with a custom pool (like USDT)
      const isCustomPool = sellToken?.isCustomPool || buyToken?.isCustomPool;

      // Skip fetch for invalid params, but explicitly allow custom pools even with id: 0n
      if (!publicClient) {
        // Skip if no publicClient available
        return;
      }

      // For regular coins (not custom pools), skip if coinId is invalid
      if (!isCustomPool && (!coinId || coinId === 0n)) {
        // Skip reserves fetch for invalid regular coin params
        return;
      }

      // Log for debugging
      console.log(
        "Fetching reserves for:",
        isCustomPool ? "custom pool" : `coinId: ${coinId}`,
      );

      try {
        let poolId;

        // Use the custom pool ID for USDT or similar custom pools
        if (isCustomPool) {
          const customToken = sellToken?.isCustomPool ? sellToken : buyToken;
          poolId = customToken?.poolId || USDT_POOL_ID;
        } else {
          // Regular pool ID
          poolId = computePoolId(coinId);
        }

        const result = await publicClient.readContract({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "pools",
          args: [poolId],
        });

        // Handle the returned data structure correctly
        // The contract might return more fields than just the reserves
        // Cast to unknown first, then extract the reserves from the array
        const poolData = result as unknown as readonly bigint[];

        setReserves({
          reserve0: poolData[0],
          reserve1: poolData[1],
        });
      } catch (err) {
        // Failed to fetch reserves
        setReserves(null);
      }
    };

    fetchReserves();
  }, [
    coinId,
    publicClient,
    sellToken?.isCustomPool,
    buyToken?.isCustomPool,
    sellToken?.poolId,
    buyToken?.poolId,
  ]);

  // When switching to single-eth mode, ensure ETH is selected as the sell token
  // and set a default target token if none is selected
  useEffect(() => {
    // If current sell token is not ETH, set it to ETH
    if (sellToken.id !== null) {
      // Find ETH token in tokens list
      const ethToken = tokens.find((t) => t.id === null);

      if (ethToken) {
        // Create a new ETH token but ensure it has the correct balance
        // Use our tracked ethBalance instead of potentially incorrect token.balance
        const safeEthToken = {
          ...ethToken,
          balance:
            ethBalance !== undefined ? ethBalance.value : ethToken.balance,
        };

        // Set the sell token to ETH with the safe balance
        setSellToken(safeEthToken);
      }
    } else if (
      sellToken.id === null &&
      ethBalance !== undefined &&
      sellToken.balance !== ethBalance.value
    ) {
      // If ETH is already selected but has wrong balance, update it
      setSellToken((prev) => ({
        ...prev,
        balance: ethBalance.value,
      }));
    }

    // If no target token is selected or it's ETH (but not a custom pool like USDT), set a default non-ETH token
    if (!buyToken || (buyToken.id === null && !buyToken.isCustomPool)) {
      // Find the first non-ETH token with the highest liquidity
      // Also include custom pools like USDT even if their ID is 0
      const defaultTarget = tokens.find(
        (token) => token.id !== null || token.isCustomPool,
      );
      if (defaultTarget) {
        setBuyToken(defaultTarget);
      }
    }
  }, [tokens, sellToken, buyToken, ethBalance]);

  // Reset UI state when tokens change
  useEffect(() => {
    // Reset transaction data
    setTxHash(undefined);
    setTxError(null);

    // Reset amounts
    setSellAmt("");
    setBuyAmt("");
  }, [sellToken.id, buyToken?.id]);

  /* helpers to sync amounts */
  const syncFromSell = async (val: string) => {
    // Single-ETH liquidity mode - estimate the token amount the user will get
    setSellAmt(val);
    // Allow custom pools like USDT with id=0
    if (
      !reserves ||
      !val ||
      !buyToken ||
      (buyToken.id === null && !buyToken.isCustomPool)
    ) {
      setSingleETHEstimatedCoin("");
      return;
    }

    try {
      // Get the pool ID for the selected token pair
      let poolId;

      // Check if this is a custom pool like USDT
      if (buyToken.isCustomPool && buyToken.poolId) {
        poolId = buyToken.poolId;
        console.log(
          "Using custom pool ID for Single-ETH estimation:",
          poolId.toString(),
        );
      } else {
        poolId = computePoolId(buyToken.id || 0n);
      }

      // Fetch fresh reserves for the selected token
      let targetReserves = { ...reserves };

      // If the token ID is different from the current reserves or we have a custom pool, fetch new reserves
      if (buyToken.id !== coinId || buyToken.isCustomPool) {
        try {
          const result = await publicClient?.readContract({
            address: ZAAMAddress,
            abi: ZAAMAbi,
            functionName: "pools",
            args: [poolId],
          });

          // If we have a result, use it; otherwise fall back to current reserves
          if (result) {
            const poolData = result as unknown as readonly bigint[];
            targetReserves = {
              reserve0: poolData[0],
              reserve1: poolData[1],
            };
          }
        } catch (err) {
          console.error(
            `Failed to fetch reserves for target token ${buyToken.id}:`,
            err,
          );
          // Continue with existing reserves as fallback
        }
      }

      // The contract will use half of the ETH to swap for tokens
      const halfEthAmount = parseEther(val || "0") / 2n;

      // Get correct swap fee for the token (30bps for USDT, default 100bps for regular tokens)
      const swapFee = buyToken?.isCustomPool
        ? buyToken.swapFee || SWAP_FEE
        : SWAP_FEE;

      console.log("Single-ETH estimation using:", {
        token: buyToken.symbol,
        ethAmount: formatEther(halfEthAmount),
        reserve0: formatEther(targetReserves.reserve0),
        reserve1: formatUnits(targetReserves.reserve1, buyToken.decimals || 18),
        swapFee: `${Number(swapFee) / 100}%`,
        isCustomPool: buyToken.isCustomPool,
      });

      // Estimate how many tokens we'll get for half the ETH
      const estimatedTokens = getAmountOut(
        halfEthAmount,
        targetReserves.reserve0,
        targetReserves.reserve1,
        swapFee,
      );

      // Update the estimated coin display
      if (estimatedTokens === 0n) {
        setSingleETHEstimatedCoin("");
      } else {
        // Use correct decimals for the token (6 for USDT, 18 for regular tokens)
        const tokenDecimals = buyToken?.isCustomPool
          ? buyToken.decimals || 18
          : 18;

        const formattedTokens = formatUnits(estimatedTokens, tokenDecimals);
        setSingleETHEstimatedCoin(formattedTokens);
      }
    } catch (err) {
      console.error("Error estimating Single-ETH token amount:", err);
      setSingleETHEstimatedCoin("");
    }
    return;
  };

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

  return (
    <div>
      {/* SELL + FLIP + BUY panel container */}
      <div className="relative flex flex-col">
        {/* SELL/PROVIDE panel */}
        <div
          className={`border-2 border-primary/40 group hover:bg-secondary-foreground rounded-t-2xl p-2 pb-4 focus-within:ring-2 focus-within:ring-primary/60 flex flex-col gap-2`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Provide ETH</span>
            {/* Render both options but hide one with CSS for hook stability */}
            {/* ETH-only display for Single-ETH mode */}
            <div
              className={`flex items-center gap-2 bg-transparent border border-primary rounded-md px-2 py-1`}
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
        </div>

        {/* ALL BUY/RECEIVE panels - rendering conditionally with CSS for hook stability */}
        {buyToken && (
          <div
            className={`border-2 border-primary/40 group rounded-b-2xl p-2 pt-3 focus-within:ring-2 hover:bg-secondary-foreground focus-within:ring-primary/60 shadow-[0_0_15px_rgba(0,204,255,0.07)] flex flex-col gap-2 mt-2`}
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
              Half of your ETH will be swapped for {buyToken.symbol} and paired
              with the remaining ETH.
            </div>
          </div>
        )}
      </div>

      <NetworkError message={"manage liquidity"} />

      {/* Slippage information - clickable to show settings */}
      <SlippageSettings
        setSlippageBps={setSingleEthSlippageBps}
        slippageBps={singleEthSlippageBps}
      />

      <div>
        <p className="font-medium mb-1">Single-Sided ETH Liquidity:</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>Provide only ETH to participate in a pool</li>
          <li>Half your ETH is swapped to tokens automatically</li>
          <li>Remaining ETH + tokens are added as liquidity</li>
          <li>Earn {Number(SWAP_FEE) / 100}% fees from trades</li>
        </ul>
      </div>

      {/* ACTION BUTTON */}
      <Button
        onClick={
          executeSingleETHLiquidity // Single-ETH mode
        }
        disabled={!isConnected || isPending}
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
