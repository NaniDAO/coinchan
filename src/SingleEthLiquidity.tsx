import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { NetworkError } from "./components/NetworkError";
import { SuccessMessage } from "./components/SuccessMessage";
import { CoinSource, ETH_TOKEN, TokenMeta, USDT_POOL_KEY } from "./lib/coins";
import { useTokenSelection } from "./contexts/TokenSelectionContext";
import { Loader2 } from "lucide-react";
import { ZAMMSingleLiqETHAbi, ZAMMSingleLiqETHAddress } from "./constants/ZAMMSingleLiqETH";
import { ZAMMSingleLiqETHV1Abi, ZAMMSingleLiqETHV1Address } from "./constants/ZAMMSingleLiqETHV1";
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
  ZAMMPoolKey,
} from "./lib/swap";
import { useAccount, useChainId, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { mainnet } from "viem/chains";
import { nowSec } from "./lib/utils";
import { formatEther, formatUnits, parseEther } from "viem";
import { ZAMMAbi, ZAMMAddress } from "./constants/ZAAM";
import { handleWalletError, isUserRejectionError } from "./lib/errors";
import { CookbookAddress, CookbookAbi } from "./constants/Cookbook";
import { SlippageSettings } from "./components/SlippageSettings";
import { SwapPanel } from "./components/SwapPanel";
import { useReserves } from "./hooks/use-reserves";

/**
 * Determines if a coin is a cookbook coin based on its ID
 * Cookbook coins have ID < 1000000n
 */
const isCookbookCoin = (coinId: bigint | null): boolean => {
  return coinId !== null && coinId < 1000000n;
};

export const SingleEthLiquidity = () => {
  const { t } = useTranslation();
  /* State */
  /* user inputs */
  const [sellAmt, setSellAmt] = useState("");
  const [, setBuyAmt] = useState("");

  // Use shared token selection context
  const { sellToken, buyToken, setSellToken, setBuyToken } = useTokenSelection();

  const {
    isCustom: isCustomPool,
    isCoinToCoin,
    coinId,
  } = useMemo(() => analyzeTokens(sellToken, buyToken), [sellToken, buyToken]);

  const { mainPoolId } = getPoolIds(sellToken, buyToken, {
    isCustomPool,
    isCoinToCoin,
  });

  // Determine source for reserves based on coin type
  // Custom pools (like USDT) use ZAMM, cookbook coins use COOKBOOK
  const isCookbook = isCookbookCoin(coinId);
  const reserveSource: CoinSource = isCookbook && !isCustomPool ? "COOKBOOK" : "ZAMM";

  const { data: reserves } = useReserves({
    poolId: mainPoolId,
    source: reserveSource,
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
      const tokenId = buyToken.id || 0n;
      const isCookbook = isCookbookCoin(tokenId);

      // Check if this is a custom pool like USDT
      if (buyToken.isCustomPool && buyToken.poolId) {
        poolId = buyToken.poolId;
        console.log("Using custom pool ID for Single-ETH estimation:", poolId.toString());
      } else if (isCookbook) {
        // Cookbook coin pool ID - use CookbookAddress as token1
        poolId = computePoolId(tokenId, SWAP_FEE, CookbookAddress);
        console.log("Using cookbook pool ID for Single-ETH estimation:", poolId.toString());
      } else {
        poolId = computePoolId(tokenId);
      }

      // Fetch fresh reserves for the selected token
      let targetReserves = { ...reserves };

      // If the token ID is different from the current reserves or we have a custom pool or cookbook coin, fetch new reserves
      if (buyToken.id !== coinId || buyToken.isCustomPool || isCookbook) {
        try {
          // Use appropriate ZAMM address based on coin type
          const targetAddress = isCookbook ? CookbookAddress : ZAMMAddress;
          const targetAbi = isCookbook ? CookbookAbi : ZAMMAbi;

          const result = await publicClient?.readContract({
            address: targetAddress,
            abi: targetAbi,
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

      // Check if we're dealing with a custom pool like USDT or cookbook coin
      let targetPoolKey;
      const isCustomPool = buyToken.isCustomPool;
      const isCookbook = isCookbookCoin(targetTokenId);

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
      } else if (isCookbook) {
        // Cookbook coin pool key - use CookbookAddress as token1
        targetPoolKey = computePoolKey(targetTokenId, swapFee, CookbookAddress);
        console.log("Using cookbook pool key for Single-ETH liquidity:", {
          token: buyToken.symbol,
          coinId: targetTokenId.toString(),
          isCookbook: true,
        });
      } else {
        // Regular pool key
        targetPoolKey = computePoolKey(targetTokenId, swapFee) as ZAMMPoolKey;
      }
      const deadline = nowSec() + BigInt(DEADLINE_SEC);
      const ethAmount = parseEther(sellAmt);

      // Get the reserves for the selected token
      let targetReserves = reserves;

      // If the target token is different from coinId, fetch the correct reserves
      if (targetTokenId !== coinId || isCustomPool || isCookbook) {
        try {
          // Get the pool ID for the target token
          let targetPoolId;

          if (isCustomPool && buyToken.poolId) {
            // Use the custom pool ID for USDT-ETH
            targetPoolId = buyToken.poolId;
            console.log("Using custom pool ID for reserves:", targetPoolId.toString());
          } else if (isCookbook) {
            // Cookbook pool ID - use CookbookAddress as token1
            targetPoolId = computePoolId(targetTokenId, swapFee, CookbookAddress);
            console.log("Using cookbook pool ID for reserves:", targetPoolId.toString());
          } else {
            // Regular pool ID
            targetPoolId = computePoolId(targetTokenId, swapFee);
          }

          // Use appropriate ZAMM address based on coin type
          const targetAddress = isCookbook ? CookbookAddress : ZAMMAddress;
          const targetAbi = isCookbook ? CookbookAbi : ZAMMAbi;

          const result = await publicClient.readContract({
            address: targetAddress,
            abi: targetAbi,
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

      // Call addSingleLiqETH on the appropriate contract based on coin type
      const contractAddress = isCookbook ? ZAMMSingleLiqETHV1Address : ZAMMSingleLiqETHAddress;
      const contractAbi = isCookbook ? ZAMMSingleLiqETHV1Abi : ZAMMSingleLiqETHAbi;

      console.log(`Using ${isCookbook ? "ZAMMSingleLiqETHV1" : "ZAMMSingleLiqETH"} contract for ${buyToken.symbol}`, {
        contractAddress,
        isCookbook,
        coinId: targetTokenId.toString(),
      });

      const hash = await writeContractAsync({
        address: contractAddress,
        abi: contractAbi,
        functionName: "addSingleLiqETH",
        args: [
          targetPoolKey as any, // Cast to any to handle union type of ZAMMPoolKey | CookbookPoolKey
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
          title={t("common.provide_eth")}
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
            title={t("common.target_token")}
            selectedToken={buyToken}
            tokens={memoizedNonEthTokens}
            onSelect={handleBuyTokenSelect}
            isEthBalanceFetching={isEthBalanceFetching}
            amount={singleETHEstimatedCoin || "0"}
            onAmountChange={() => {}}
            readOnly={true}
            previewLabel={t("common.estimated")}
            className="mt-2 rounded-b-2xl pt-3 shadow-[0_0_15px_rgba(0,204,255,0.07)]"
          />
        )}
      </div>

      <NetworkError message="manage liquidity" />

      {/* Slippage */}
      <SlippageSettings setSlippageBps={setSingleEthSlippageBps} slippageBps={singleEthSlippageBps} />

      {/* Info box */}
      <div className="text-xs bg-muted/50 border border-primary/30 rounded p-2 mt-2 text-muted-foreground">
        <p className="font-medium mb-1">{t("pool.single_sided_eth_liquidity")}</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>{t("pool.provide_only_eth")}</li>
          <li>{t("pool.half_eth_swapped")}</li>
          <li>{t("pool.remaining_eth_added")}</li>
          <li>{t("pool.earn_fees_from_trades", { fee: Number(SWAP_FEE) / 100 })}</li>
        </ul>
      </div>

      {/* ACTION BUTTON */}
      <button
        onClick={executeSingleETHLiquidity}
        disabled={!isConnected || isPending}
        className={`mt-2 w-full button text-base px-8 py-4 bg-primary text-primary-foreground font-bold rounded-lg transform transition-all duration-200
          ${
            !isConnected || isPending
              ? "opacity-50 cursor-not-allowed"
              : "opacity-100 hover:scale-105 hover:shadow-lg focus:ring-4 focus:ring-primary/50 focus:outline-none"
          }
        `}
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.adding_liquidity")}
          </span>
        ) : (
          t("pool.add")
        )}
      </button>

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
