import { useCallback, useEffect, useMemo, useState } from "react";
import { NetworkError } from "./components/NetworkError";
import { SuccessMessage } from "./components/SuccessMessage";
import { ETH_TOKEN, TokenMeta, USDT_POOL_KEY } from "./lib/coins";
import { Button } from "./components/ui/button";
import { Loader2 } from "lucide-react";
import { ZAMMSingleLiqETHAbi, ZAMMSingleLiqETHAddress } from "./constants/ZAMMSingleLiqETH";
import {
  analyzeTokens,
  computePoolId,
  computePoolKey,
  DEADLINE_SEC,
  getAmountOut,
  getPoolIds,
  SINGLE_ETH_SLIPPAGE_BPS,
  SWAP_FEE,
  withSlippage,
} from "./lib/swap";
import { useAccount, useChainId, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { mainnet } from "viem/chains";
import { nowSec } from "./lib/utils";
import { formatEther, formatUnits, parseEther } from "viem";
import { ZAMMAbi, ZAMMAddress } from "./constants/ZAAM";
import { handleWalletError, isUserRejectionError } from "./lib/errors";
import { SlippageSettings } from "./components/SlippageSettings";
import { SwapPanel } from "./components/SwapPanel";
import { useReserves } from "./hooks/use-reserves";

export const SingleEthLiquidity = () => {
  /* State */
  /* user inputs */
  const [sellAmt, setSellAmt] = useState("");
  const [, setBuyAmt] = useState("");

  const [sellToken, setSellToken] = useState<TokenMeta>(ETH_TOKEN);
  const [buyToken, setBuyToken] = useState<TokenMeta | null>(null);

  const {
    isCustom: isCustomPool,
    isCoinToCoin,
    coinId,
  } = useMemo(() => analyzeTokens(sellToken, buyToken), [sellToken, buyToken]);

  const { mainPoolId } = getPoolIds(sellToken, buyToken, {
    isCustomPool,
    isCoinToCoin,
  });

  const { data: reserves } = useReserves({
    poolId: mainPoolId,
  });

  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);

  const [singleEthSlippageBps, setSingleEthSlippageBps] = useState<bigint>(SINGLE_ETH_SLIPPAGE_BPS);
  const [singleETHEstimatedCoin, setSingleETHEstimatedCoin] = useState<string>("");

  const { tokens, isEthBalanceFetching } = useAllCoins();

  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync, isPending, error: writeError } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const publicClient = usePublicClient({
    chainId,
  });

  // Create a memoized version of tokens that doesn't change with every render
  const memoizedTokens = useMemo(() => tokens, [tokens]);
  // Also create a memoized version of non-ETH tokens to avoid conditional hook calls
  const memoizedNonEthTokens = useMemo(() => memoizedTokens.filter((token) => token.id !== null), [memoizedTokens]);

  // When switching to single-eth mode, ensure ETH is selected as the sell token
  // and set a default target token if none is selected
  useEffect(() => {
    // If ETH is already selected but has wrong balance, update it
    if (tokens.length && sellToken.id === null /* ETH */) {
      // pick the ETH entry from tokens
      const ethToken = tokens.find((t) => t.id === null);
      if (ethToken) setSellToken(ethToken);
    }

    // If no target token is selected or it's ETH (but not a custom pool like USDT), set a default non-ETH token
    if (!buyToken || (buyToken.id === null && !buyToken.isCustomPool)) {
      // Find the first non-ETH token with the highest liquidity
      // Also include custom pools like USDT even if their ID is 0
      const defaultTarget = tokens.find((token) => token.id !== null || token.isCustomPool);
      if (defaultTarget) {
        setBuyToken(defaultTarget);
      }
    }
  }, [tokens, sellToken, buyToken]);

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
    if (!reserves || !val || !buyToken || (buyToken.id === null && !buyToken.isCustomPool)) {
      setSingleETHEstimatedCoin("");
      return;
    }

    try {
      // Get the pool ID for the selected token pair
      let poolId;

      // Check if this is a custom pool like USDT
      if (buyToken.isCustomPool && buyToken.poolId) {
        poolId = buyToken.poolId;
        console.log("Using custom pool ID for Single-ETH estimation:", poolId.toString());
      } else {
        poolId = computePoolId(buyToken.id || 0n);
      }

      // Fetch fresh reserves for the selected token
      let targetReserves = { ...reserves };

      // If the token ID is different from the current reserves or we have a custom pool, fetch new reserves
      if (buyToken.id !== coinId || buyToken.isCustomPool) {
        try {
          const result = await publicClient?.readContract({
            address: ZAMMAddress,
            abi: ZAMMAbi,
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
          console.error(`Failed to fetch reserves for target token ${buyToken.id}:`, err);
          // Continue with existing reserves as fallback
        }
      }

      // The contract will use half of the ETH to swap for tokens
      const halfEthAmount = parseEther(val || "0") / 2n;

      // Get correct swap fee for the token (30bps for USDT, default 100bps for regular tokens)
      const swapFee = buyToken.swapFee ?? SWAP_FEE;
      console.log("Single-ETH estimation using:", {
        token: buyToken.symbol,
        ethAmount: formatEther(halfEthAmount),
        reserve0: formatEther(targetReserves.reserve0),
        reserve1: formatUnits(targetReserves.reserve1, buyToken.decimals || 18),
        swapFee: `${Number(swapFee) / 100}%`,
        isCustomPool: buyToken.isCustomPool,
      });

      // Estimate how many tokens we'll get for half the ETH
      const estimatedTokens = getAmountOut(halfEthAmount, targetReserves.reserve0, targetReserves.reserve1, swapFee);

      // Update the estimated coin display
      if (estimatedTokens === 0n) {
        setSingleETHEstimatedCoin("");
      } else {
        // Use correct decimals for the token (6 for USDT, 18 for regular tokens)
        const tokenDecimals = buyToken?.isCustomPool ? buyToken.decimals || 18 : 18;

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

      // Get correct swap fee for the token (30bps for USDT, default 100bps for regular tokens)
      const swapFee = buyToken.swapFee ?? SWAP_FEE;
      console.log(`Using swap fee: ${Number(swapFee) / 100}% for ${buyToken.symbol} in single-ETH liquidity`);

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
        targetPoolKey = computePoolKey(targetTokenId, swapFee);
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
            console.log("Using custom pool ID for reserves:", targetPoolId.toString());
          } else {
            // Regular pool ID
            targetPoolId = computePoolId(targetTokenId, swapFee);
          }

          const result = await publicClient.readContract({
            address: ZAMMAddress,
            abi: ZAMMAbi,
            functionName: "pools",
            args: [targetPoolId],
          });

          const poolData = result as unknown as readonly bigint[];
          targetReserves = {
            reserve0: poolData[0],
            reserve1: poolData[1],
          };
        } catch (err) {
          console.error(`Failed to fetch reserves for ${buyToken.symbol}:`, err);
          setTxError(`Failed to get pool data for ${buyToken.symbol}. Please try again.`);
          return;
        }
      }

      if (!targetReserves || targetReserves.reserve0 === 0n || targetReserves.reserve1 === 0n) {
        setTxError(`No liquidity available for ${buyToken.symbol}. Please select another token.`);
        return;
      }

      // Half of the ETH will be swapped to tokens by the contract
      const halfEthAmount = ethAmount / 2n;

      // Estimate how many tokens we'll get for half the ETH
      const estimatedTokens = getAmountOut(halfEthAmount, targetReserves.reserve0, targetReserves.reserve1, swapFee);

      // Apply higher slippage tolerance for Single-ETH operations
      const minTokenAmount = withSlippage(estimatedTokens, singleEthSlippageBps);

      // Min amounts for the addLiquidity portion with higher slippage for less liquid pools
      const amount0Min = withSlippage(halfEthAmount, singleEthSlippageBps);

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
      if (typeof err === "object" && err !== null && "message" in err && typeof err.message === "string") {
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
      {/* SELL + FLIP + BUY (Provide ETH + Target Token) container */}
      <div className="relative flex flex-col">
        <SwapPanel
          title="Provide ETH"
          selectedToken={{
            ...ETH_TOKEN,
            balance: sellToken.balance,
            id: null,
            decimals: 18,
          }}
          tokens={[
            {
              ...ETH_TOKEN,
              balance: sellToken.balance,
              id: null,
              decimals: 18,
            },
          ]}
          onSelect={() => {}}
          isEthBalanceFetching={isEthBalanceFetching}
          amount={sellAmt}
          onAmountChange={syncFromSell}
          showMaxButton={!!(sellToken.balance && sellToken.balance > 0n)}
          onMax={() => {
            // leave a bit for gas
            const ethAmount = ((sellToken.balance as bigint) * 99n) / 100n;
            syncFromSell(formatEther(ethAmount));
          }}
          className="rounded-t-2xl pb-4"
        />

        {/* ALL BUY/RECEIVE panels */}
        {buyToken && (
          <SwapPanel
            title="Target Token"
            selectedToken={buyToken}
            tokens={memoizedNonEthTokens}
            onSelect={handleBuyTokenSelect}
            isEthBalanceFetching={isEthBalanceFetching}
            amount={singleETHEstimatedCoin || "0"}
            onAmountChange={() => {}}
            readOnly={true}
            previewLabel="Estimated"
            className="mt-2 rounded-b-2xl pt-3 shadow-[0_0_15px_rgba(0,204,255,0.07)]"
          />
        )}
      </div>

      <NetworkError message="manage liquidity" />

      {/* Slippage */}
      <SlippageSettings setSlippageBps={setSingleEthSlippageBps} slippageBps={singleEthSlippageBps} />

      {/* Info box */}
      <div className="text-xs bg-muted/50 border border-primary/30 rounded p-2 mt-2 text-muted-foreground">
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
        onClick={executeSingleETHLiquidity}
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

      {/* Status & errors */}
      {txError && txError.includes("Waiting for") && (
        <div className="text-sm text-primary mt-2 flex items-center bg-background/50 p-2 rounded border border-primary/20">
          <Loader2 className="h-3 w-3 animate-spin mr-2" />
          {txError}
        </div>
      )}
      {((writeError && !isUserRejectionError(writeError)) || (txError && !txError.includes("Waiting for"))) && (
        <div className="text-sm text-destructive mt-2 bg-background/50 p-2 rounded border border-destructive/20">
          {writeError && !isUserRejectionError(writeError) ? writeError.message : txError}
        </div>
      )}
      {isSuccess && <SuccessMessage />}
    </div>
  );
};
