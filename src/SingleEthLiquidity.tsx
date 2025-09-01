import { CheckIcon, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits, parseEther } from "viem";
import { mainnet } from "viem/chains";
import { useAccount, useChainId, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { NetworkError } from "./components/NetworkError";
import { SlippageSettings } from "./components/SlippageSettings";
import { SwapPanel } from "./components/SwapPanel";
import { WlfiSwapPanel } from "./components/WlfiSwapPanel";
import { CookbookAbi, CookbookAddress } from "./constants/Cookbook";
import { ZAMMAbi, ZAMMAddress } from "./constants/ZAAM";
import { ZAMMSingleLiqETHAbi, ZAMMSingleLiqETHAddress } from "./constants/ZAMMSingleLiqETH";
import { ZAMMSingleLiqETHV1Abi, ZAMMSingleLiqETHV1Address } from "./constants/ZAMMSingleLiqETHV1";
import { CULTSingleLiqETHAbi, CULTSingleLiqETHAddress } from "./constants/CULTSingleLiqETH";
import { CheckTheChainAbi, CheckTheChainAddress } from "./constants/CheckTheChain";
import { useTokenSelection } from "./contexts/TokenSelectionContext";
import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { useReserves } from "./hooks/use-reserves";
import { determineReserveSource, isCookbookCoin } from "./lib/coin-utils";
import { ETH_TOKEN, type TokenMeta, USDT_POOL_KEY, CULT_POOL_KEY, CULT_POOL_ID, WLFI_ADDRESS, WLFI_POOL_KEY, WLFI_POOL_ID, ENS_POOL_KEY, ENS_POOL_ID } from "./lib/coins";
import { handleWalletError, isUserRejectionError } from "./lib/errors";
import {
  DEADLINE_SEC,
  SINGLE_ETH_SLIPPAGE_BPS,
  SWAP_FEE,
  type ZAMMPoolKey,
  analyzeTokens,
  computePoolId,
  computePoolKey,
  getAmountOut,
  getPoolIds,
  withSlippage,
} from "./lib/swap";
import { nowSec, formatNumber } from "./lib/utils";

// Helper function to calculate square root for LP token calculation
const sqrt = (value: bigint): bigint => {
  if (value < 0n) {
    throw new Error("Square root of negative numbers is not supported");
  }
  if (value === 0n) return 0n;

  let z = value;
  let x = value / 2n + 1n;
  while (x < z) {
    z = x;
    x = (value / x + x) / 2n;
  }
  return z;
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

  // Check if we're in WLFI context
  const isWLFIPool = useMemo(
    () =>
      sellToken?.symbol === "WLFI" ||
      buyToken?.symbol === "WLFI" ||
      (buyToken?.token1 === WLFI_ADDRESS),
    [sellToken, buyToken],
  );

  // Determine source for reserves based on coin type using shared utility
  const reserveSource = determineReserveSource(coinId, isCustomPool);

  const { data: reserves } = useReserves({
    poolId: mainPoolId,
    source: reserveSource,
  });

  // Removed unused poolInfo fetch - we'll fetch it dynamically in syncFromSell

  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);

  const [singleEthSlippageBps, setSingleEthSlippageBps] = useState<bigint>(
    buyToken?.symbol === "CULT" || buyToken?.symbol === "ENS" ? 1000n : SINGLE_ETH_SLIPPAGE_BPS,
  );
  const [singleETHEstimatedCoin, setSingleETHEstimatedCoin] = useState<string>("");
  const [estimatedLpTokens, setEstimatedLpTokens] = useState<string>("");
  const [estimatedPoolShare, setEstimatedPoolShare] = useState<string>("");

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

    // Update slippage for CULT, ENS, and WLFI tokens to 10%
    if (buyToken?.symbol === "CULT" || buyToken?.symbol === "ENS" || buyToken?.symbol === "WLFI") {
      setSingleEthSlippageBps(1000n); // 10% for CULT, ENS, and WLFI
    } else {
      setSingleEthSlippageBps(SINGLE_ETH_SLIPPAGE_BPS); // Default 5% for other tokens
    }
  }, [sellToken.id, buyToken?.id, buyToken?.symbol]);

  /* helpers to sync amounts */
  const syncFromSell = async (val: string) => {
    // Single-ETH liquidity mode - estimate the token amount the user will get
    setSellAmt(val);

    // Emit event for ENS wrapper to listen (only for ENS)
    if (buyToken?.symbol === "ENS") {
      window.dispatchEvent(new CustomEvent("ensZapEthAmountChange", { detail: { amount: val } }));
    }
    // Allow custom pools like USDT with id=0
    if (!reserves || !val || !buyToken || (buyToken.id === null && !buyToken.isCustomPool)) {
      setSingleETHEstimatedCoin("");
      setEstimatedLpTokens("");
      setEstimatedPoolShare("");
      return;
    }

    try {
      // Get the pool ID for the selected token pair
      let poolId;
      const tokenId = buyToken.id || 0n;
      const isCookbook = isCookbookCoin(tokenId);
      const isWLFI = buyToken.symbol === "WLFI";
      const isENS = buyToken.symbol === "ENS";
      const isCULT = buyToken.symbol === "CULT";

      // Check if this is a custom pool like USDT, WLFI, ENS, CULT
      if (isWLFI) {
        poolId = buyToken.poolId || WLFI_POOL_ID;
      } else if (isENS) {
        poolId = buyToken.poolId || ENS_POOL_ID;
      } else if (isCULT) {
        poolId = buyToken.poolId || CULT_POOL_ID;
      } else if (buyToken.isCustomPool && buyToken.poolId) {
        poolId = buyToken.poolId;
      } else if (isCookbook) {
        // Cookbook coin pool ID - use CookbookAddress as token1
        poolId = computePoolId(tokenId, SWAP_FEE, CookbookAddress);
      } else {
        poolId = computePoolId(tokenId);
      }

      // Fetch fresh reserves for the selected token
      let targetReserves = { ...reserves };

      // If the token ID is different from the current reserves or we have a custom pool or cookbook coin, fetch new reserves
      if (buyToken.id !== coinId || buyToken.isCustomPool || isCookbook) {
        try {
          // Use appropriate ZAMM address based on coin type
          const targetAddress = (isCookbook || isWLFI || isENS || isCULT) ? CookbookAddress : ZAMMAddress;
          const targetAbi = (isCookbook || isWLFI || isENS || isCULT) ? CookbookAbi : ZAMMAbi;

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
              blockTimestampLast: targetReserves?.blockTimestampLast || 0,
              price0CumulativeLast: targetReserves?.price0CumulativeLast || 0n,
              price1CumulativeLast: targetReserves?.price1CumulativeLast || 0n,
              kLast: targetReserves?.kLast || 0n,
              supply: targetReserves?.supply || 0n,
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

      // Estimate how many tokens we'll get for half the ETH
      let estimatedTokens: bigint;

      if (buyToken.symbol === "CULT") {
        // For CULT, use Uniswap V3 price from CheckTheChain
        try {
          const cultPriceData = await publicClient?.readContract({
            address: CheckTheChainAddress,
            abi: CheckTheChainAbi,
            functionName: "checkPriceInETH",
            args: ["CULT"],
          });

          if (!cultPriceData) {
            throw new Error("Unable to fetch CULT price data");
          }

          // Price is returned as uint256 with 18 decimals
          // e.g., 245052318810 = 0.00000024505231881 ETH per CULT
          const cultPriceInETH = cultPriceData[0] as bigint;

          if (cultPriceInETH === 0n) {
            throw new Error("Unable to fetch CULT price");
          }

          // Calculate CULT amount: ETH amount / CULT price
          estimatedTokens = (halfEthAmount * 10n ** 18n) / cultPriceInETH;
        } catch (err) {
          console.error("Failed to fetch CULT price from CheckTheChain:", err);
          // Fallback to pool-based calculation
          estimatedTokens = getAmountOut(halfEthAmount, targetReserves.reserve0, targetReserves.reserve1, swapFee);
        }
      } else {
        estimatedTokens = getAmountOut(halfEthAmount, targetReserves.reserve0, targetReserves.reserve1, swapFee);
      }

      // Update the estimated coin display
      if (estimatedTokens === 0n) {
        setSingleETHEstimatedCoin("");
      } else {
        // Use correct decimals for the token (6 for USDT, 18 for regular tokens)
        const tokenDecimals = buyToken?.isCustomPool ? buyToken.decimals || 18 : 18;

        const formattedTokens = formatUnits(estimatedTokens, tokenDecimals);
        setSingleETHEstimatedCoin(formattedTokens);

        // Calculate LP tokens that will be minted
        // For CULT and other special pools, we need to fetch the pool info for the specific pool
        if (halfEthAmount > 0n && estimatedTokens > 0n) {
          try {
            // Use the same address and ABI we used above for fetching reserves
            const poolAddress = isCookbook ? CookbookAddress : ZAMMAddress;
            const poolAbi = isCookbook ? CookbookAbi : ZAMMAbi;

            // Fetch pool info for the specific pool being used
            const poolInfoResult = await publicClient?.readContract({
              address: poolAddress,
              abi: poolAbi,
              functionName: "pools",
              args: [poolId],
            });

            if (poolInfoResult) {
              const poolData = poolInfoResult as unknown as readonly bigint[];
              const totalSupply = poolData[6] as bigint; // Total LP supply at index 6

              if (totalSupply > 0n && targetReserves.reserve0 > 0n && targetReserves.reserve1 > 0n) {
                // From AMM: liquidity = min(mulDiv(amount0, supply, reserve0), mulDiv(amount1, supply, reserve1))
                const lpFromEth = (halfEthAmount * totalSupply) / targetReserves.reserve0;
                const lpFromToken = (estimatedTokens * totalSupply) / targetReserves.reserve1;
                const lpTokensToMint = lpFromEth < lpFromToken ? lpFromEth : lpFromToken;

                setEstimatedLpTokens(formatUnits(lpTokensToMint, 18));

                // Calculate pool share percentage
                const newTotalSupply = totalSupply + lpTokensToMint;
                const poolShareBps = (lpTokensToMint * 10000n) / newTotalSupply;
                setEstimatedPoolShare(`${(Number(poolShareBps) / 100).toFixed(2)}%`);
              } else if (totalSupply === 0n) {
                // First liquidity provider - from AMM: liquidity = sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY
                const MINIMUM_LIQUIDITY = 1000n;
                const lpTokens = sqrt(halfEthAmount * estimatedTokens) - MINIMUM_LIQUIDITY;
                setEstimatedLpTokens(formatUnits(lpTokens, 18));
                setEstimatedPoolShare("100%");
              }
            }
          } catch (err) {
            console.error("Error calculating LP tokens:", err);
            setEstimatedLpTokens("");
            setEstimatedPoolShare("");
          }
        }
      }
    } catch (err) {
      console.error("Error estimating LP-ZAP token amount:", err);
      setSingleETHEstimatedCoin("");
      setEstimatedLpTokens("");
      setEstimatedPoolShare("");
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

    // For custom pools like USDT, WLFI, ENS, CULT, allow buyToken.id to be 0n
    // Check if buyToken exists and has proper properties
    const isSpecialToken = buyToken?.symbol === "WLFI" || buyToken?.symbol === "ENS" || 
                          buyToken?.symbol === "CULT" || buyToken?.symbol === "USDT";
    if (!buyToken || (!buyToken?.isCustomPool && !isSpecialToken && buyToken?.id === null)) {
      setTxError("Please select a valid target token");
      return;
    }

    if (!sellAmt || Number.parseFloat(sellAmt) <= 0) {
      setTxError("Please enter a valid ETH amount");
      return;
    }

    // Validate ETH balance
    const ethRequired = parseEther(sellAmt);
    if (sellToken.balance && sellToken.balance < ethRequired) {
      setTxError("Insufficient ETH balance");
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
      let targetTokenId: bigint;
      try {
        targetTokenId =
          typeof buyToken.id === "bigint"
            ? buyToken.id
            : buyToken.id !== null && buyToken.id !== undefined
              ? BigInt(String(buyToken.id))
              : 0n;
      } catch (error) {
        console.error("Failed to convert token ID to BigInt:", error);
        setTxError(t("errors.invalid_token_id"));
        return;
      }

      // Get correct swap fee for the token (30bps for USDT, default 100bps for regular tokens)
      const swapFee = buyToken.swapFee ?? SWAP_FEE;

      // Check if we're dealing with a custom pool like USDT, CULT, or cookbook coin
      let targetPoolKey;
      const isCustomPool = buyToken.isCustomPool;
      const isCookbook = isCookbookCoin(targetTokenId);
      const isCULT = buyToken.symbol === "CULT";
      const isWLFI = buyToken.symbol === "WLFI";
      const isENS = buyToken.symbol === "ENS";

      if (isWLFI) {
        // Use the WLFI pool key for WLFI-ETH
        targetPoolKey = buyToken.poolKey || WLFI_POOL_KEY;
      } else if (isENS) {
        // Use the ENS pool key for ENS-ETH
        targetPoolKey = buyToken.poolKey || ENS_POOL_KEY;
      } else if (isCULT) {
        // Use the CULT pool key for CULT-ETH (already in Cookbook format with feeOrHook)
        targetPoolKey = CULT_POOL_KEY;
      } else if (isCustomPool) {
        // Use the custom pool key for USDT-ETH
        targetPoolKey = buyToken.poolKey || USDT_POOL_KEY;
      } else if (isCookbook) {
        // Cookbook coin pool key - use CookbookAddress as token1
        targetPoolKey = computePoolKey(targetTokenId, swapFee, CookbookAddress);
      } else {
        // Regular pool key
        targetPoolKey = computePoolKey(targetTokenId, swapFee) as ZAMMPoolKey;
      }
      const deadline = nowSec() + BigInt(DEADLINE_SEC);
      const ethAmount = parseEther(sellAmt);

      // Get the reserves for the selected token
      let targetReserves = reserves;

      // If the target token is different from coinId, fetch the correct reserves
      if (targetTokenId !== coinId || isCustomPool || isCookbook || isCULT || isWLFI || isENS) {
        try {
          // Get the pool ID for the target token
          let targetPoolId;

          if (isWLFI) {
            // Use the WLFI pool ID
            targetPoolId = buyToken.poolId || WLFI_POOL_ID;
          } else if (isENS) {
            // Use the ENS pool ID
            targetPoolId = buyToken.poolId || ENS_POOL_ID;
          } else if (isCULT) {
            // Use the CULT pool ID
            targetPoolId = CULT_POOL_ID;
          } else if (isCustomPool && buyToken.poolId) {
            // Use the custom pool ID for USDT-ETH
            targetPoolId = buyToken.poolId;
          } else if (isCookbook) {
            // Cookbook pool ID - use CookbookAddress as token1
            targetPoolId = computePoolId(targetTokenId, swapFee, CookbookAddress);
          } else {
            // Regular pool ID
            targetPoolId = computePoolId(targetTokenId, swapFee);
          }

          // Use appropriate ZAMM address based on coin type
          const targetAddress = (isCookbook || isWLFI || isENS || isCULT) ? CookbookAddress : ZAMMAddress;
          const targetAbi = (isCookbook || isWLFI || isENS || isCULT) ? CookbookAbi : ZAMMAbi;

          const result = await publicClient?.readContract({
            address: targetAddress,
            abi: targetAbi,
            functionName: "pools",
            args: [targetPoolId],
          });

          const poolData = result as unknown as readonly bigint[];
          targetReserves = {
            reserve0: poolData[0],
            reserve1: poolData[1],
            blockTimestampLast: reserves?.blockTimestampLast || 0,
            price0CumulativeLast: reserves?.price0CumulativeLast || 0n,
            price1CumulativeLast: reserves?.price1CumulativeLast || 0n,
            kLast: reserves?.kLast || 0n,
            supply: reserves?.supply || 0n,
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
      let estimatedTokens: bigint;

      if (isCULT) {
        // For CULT, use Uniswap V3 price from CheckTheChain
        try {
          const cultPriceData = await publicClient?.readContract({
            address: CheckTheChainAddress,
            abi: CheckTheChainAbi,
            functionName: "checkPriceInETH",
            args: ["CULT"],
          });

          if (!cultPriceData) {
            throw new Error("Unable to fetch CULT price data");
          }

          const cultPriceInETH = cultPriceData[0] as bigint;

          if (cultPriceInETH === 0n) {
            throw new Error("Unable to fetch CULT price");
          }

          // Calculate CULT amount: ETH amount / CULT price
          estimatedTokens = (halfEthAmount * 10n ** 18n) / cultPriceInETH;
        } catch (err) {
          console.error("Failed to fetch CULT price from CheckTheChain:", err);
          // Fallback to pool-based calculation
          estimatedTokens = getAmountOut(halfEthAmount, targetReserves.reserve0, targetReserves.reserve1, swapFee);
        }
      } else {
        estimatedTokens = getAmountOut(halfEthAmount, targetReserves.reserve0, targetReserves.reserve1, swapFee);
      }

      // Apply higher slippage tolerance for Single-ETH operations
      const minTokenAmount = withSlippage(estimatedTokens, singleEthSlippageBps);

      // Min amounts for the addLiquidity portion with higher slippage for less liquid pools
      const amount0Min = withSlippage(halfEthAmount, singleEthSlippageBps);

      const amount1Min = withSlippage(estimatedTokens, singleEthSlippageBps);

      // Call addSingleLiqETH on the appropriate contract based on coin type
      const contractAddress = isCULT
        ? CULTSingleLiqETHAddress
        : isCookbook
          ? ZAMMSingleLiqETHV1Address
          : ZAMMSingleLiqETHAddress;
      const contractAbi = isCULT ? CULTSingleLiqETHAbi : isCookbook ? ZAMMSingleLiqETHV1Abi : ZAMMSingleLiqETHAbi;

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
        console.error("Unknown error in LP-ZAP liquidity:", err);
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
        {isWLFIPool ? (
          <WlfiSwapPanel
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
            className="mb-2"
          />
        ) : (
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
        )}

        {/* ALL BUY/RECEIVE panels */}
        {buyToken && (
          isWLFIPool ? (
            <WlfiSwapPanel
              title={t("common.target_token", { token: buyToken.symbol })}
              selectedToken={buyToken}
              tokens={memoizedNonEthTokens}
              onSelect={handleBuyTokenSelect}
              isEthBalanceFetching={isEthBalanceFetching}
              amount={singleETHEstimatedCoin || "0"}
              onAmountChange={() => {}}
              readOnly={true}
              previewLabel={t("common.estimated")}
              className="mt-2"
            />
          ) : (
            <SwapPanel
              title={t("common.target_token", { token: buyToken.symbol })}
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
          )
        )}
      </div>

      <NetworkError message="manage liquidity" />

      {/* Slippage */}
      <SlippageSettings setSlippageBps={setSingleEthSlippageBps} slippageBps={singleEthSlippageBps} />

      {/* LP Tokens and Pool Share Estimation */}
      {estimatedLpTokens && estimatedPoolShare && (
        <div className="mt-2 p-3 bg-muted/30 border border-primary/20 rounded-lg">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm text-muted-foreground">{t("common.estimated_lp_tokens")}:</span>
            <span className="font-mono text-sm">{formatNumber(parseFloat(estimatedLpTokens), 6)} LP</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t("cult.pool_share")}:</span>
            <span className="font-mono text-sm">{estimatedPoolShare}</span>
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="text-xs bg-muted/50 border border-primary/30 rounded p-2 mt-2 text-muted-foreground">
        <p className="font-medium mb-1">{t("pool.single_sided_eth_liquidity")}</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>{t("pool.provide_only_eth")}</li>
          <li>{t("pool.half_eth_swapped")}</li>
          <li>{t("pool.remaining_eth_added")}</li>
          <li>{t("pool.earn_fees_from_trades", { fee: Number(buyToken?.swapFee ?? SWAP_FEE) / 100 })}</li>
          {buyToken && buyToken.symbol === "CULT" && (
            <>
              <li className="text-primary">Using CULT-optimized LP-ZAP contract</li>
              <li className="text-primary">Default slippage increased to 10% for CULT liquidity</li>
            </>
          )}
        </ul>
      </div>

      {/* ACTION BUTTON */}
      <button
        onClick={executeSingleETHLiquidity}
        disabled={
          !isConnected ||
          isPending ||
          !sellAmt ||
          parseFloat(sellAmt) === 0 ||
          (sellToken.balance !== undefined && parseEther(sellAmt || "0") > sellToken.balance)
        }
        className={`mt-2 w-full button text-base px-8 py-4 font-bold rounded-lg transform transition-all duration-200
          ${isWLFIPool 
            ? "bg-gradient-to-r from-amber-500 to-amber-600 dark:from-yellow-500 dark:to-yellow-600 hover:from-amber-600 hover:to-amber-700 dark:hover:from-yellow-600 dark:hover:to-yellow-700 text-white dark:text-black shadow-lg shadow-amber-500/30 dark:shadow-yellow-500/30"
            : "bg-primary text-primary-foreground"
          }
          ${
            !isConnected ||
            isPending ||
            !sellAmt ||
            parseFloat(sellAmt) === 0 ||
            (sellToken.balance !== undefined && parseEther(sellAmt || "0") > sellToken.balance)
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
      {txHash && !isSuccess && (
        <div className="text-sm text-primary mt-2 bg-background/50 p-2 rounded border border-primary/20">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("common.status_confirming")}...
            </span>
            <a
              href={`https://etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
            >
              <span className="font-mono text-xs">
                {txHash.slice(0, 6)}...{txHash.slice(-4)}
              </span>
              <span className="text-xs">↗</span>
            </a>
          </div>
        </div>
      )}
      {isSuccess && (
        <div className="text-sm text-chart-2 mt-2 bg-background/50 p-2 rounded border border-chart-2/20">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckIcon className="h-3 w-3" />
              {t("common.status_success")}!
            </span>
            {txHash && (
              <a
                href={`https://etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-chart-2 hover:text-chart-2/80 transition-colors"
              >
                <span className="font-mono text-xs">
                  {txHash.slice(0, 6)}...{txHash.slice(-4)}
                </span>
                <span className="text-xs">↗</span>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
