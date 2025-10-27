import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { useAccount, useChainId, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { SlippageSettings } from "./components/SlippageSettings";
import { SuccessMessage } from "./components/SuccessMessage";
import { SwapPanel } from "./components/SwapPanel";
import { WlfiSwapPanel } from "./components/WlfiSwapPanel";
import { WLFI_ADDRESS } from "./lib/coins";
import { CoinsAddress } from "./constants/Coins";
import { CookbookAbi, CookbookAddress } from "./constants/Cookbook";
import { ZAMMAbi, ZAMMAddress } from "./constants/ZAAM";
import { useTokenSelection } from "./contexts/TokenSelectionContext";
import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { useReserves } from "./hooks/use-reserves";
import { determineReserveSource, isCookbookCoin } from "./lib/coin-utils";
import {
  type TokenMeta,
  USDT_POOL_ID,
  USDT_POOL_KEY,
  CULT_POOL_ID,
  CULT_POOL_KEY,
  WLFI_POOL_ID,
  WLFI_POOL_KEY,
  ENS_POOL_ID,
  ENS_POOL_KEY,
  JPYC_POOL_ID,
} from "./lib/coins";
import { handleWalletError, isUserRejectionError } from "./lib/errors";
import {
  DEADLINE_SEC,
  SLIPPAGE_BPS,
  SWAP_FEE,
  type ZAMMPoolKey,
  analyzeTokens,
  computePoolId,
  computePoolKey,
  getPoolIds,
  withSlippage,
} from "./lib/swap";
import { nowSec } from "./lib/utils";

export const RemoveLiquidity = () => {
  const { t } = useTranslation();
  // Use shared token selection context
  const { sellToken, buyToken, setSellToken, setBuyToken } = useTokenSelection();

  const [lpTokenBalance, setLpTokenBalance] = useState<bigint>(0n);
  const [lpBurnAmount, setLpBurnAmount] = useState<string>("");

  const {
    isCustom: isCustomPool,
    isCoinToCoin,
    coinId,
  } = useMemo(() => analyzeTokens(sellToken, buyToken), [sellToken, buyToken]);
  const { mainPoolId } = getPoolIds(sellToken, buyToken, {
    isCustomPool: isCustomPool,
    isCoinToCoin: isCoinToCoin,
  });

  // Check if we're in WLFI context
  const isWLFIPool = useMemo(
    () =>
      sellToken?.symbol === "WLFI" ||
      buyToken?.symbol === "WLFI" ||
      sellToken?.token1 === WLFI_ADDRESS ||
      buyToken?.token1 === WLFI_ADDRESS,
    [sellToken, buyToken],
  );

  // Override for ENS, WLFI, and JPYC
  const isENS = sellToken?.symbol === "ENS" || buyToken?.symbol === "ENS";
  const isWLFI = sellToken?.symbol === "WLFI" || buyToken?.symbol === "WLFI";
  const isJPYC = sellToken?.symbol === "JPYC" || buyToken?.symbol === "JPYC";
  const actualPoolId = isENS ? ENS_POOL_ID : isWLFI ? WLFI_POOL_ID : isJPYC ? JPYC_POOL_ID : mainPoolId;

  // Determine source for reserves based on coin type using shared utility
  const reserveSource = isENS || isWLFI || isJPYC ? "COOKBOOK" : determineReserveSource(coinId, isCustomPool);

  const { data: reserves } = useReserves({
    poolId: actualPoolId,
    source: reserveSource,
  });

  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const chainId = useChainId();

  const { tokens, isEthBalanceFetching } = useAllCoins();

  /* State */

  /* user inputs */
  const [sellAmt, setSellAmt] = useState("");
  const [buyAmt, setBuyAmt] = useState("");
  const [slippageBps, setSlippageBps] = useState<bigint>(SLIPPAGE_BPS);

  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);

  const { writeContractAsync, isPending, error: writeError } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const memoizedTokens = useMemo(() => tokens, [tokens]);

  // Fetch LP token balance when a pool is selected and user is connected
  useEffect(() => {
    const fetchLpBalance = async () => {
      // Special handling for custom pools like USDT-ETH which may have ID=0
      const isCustomPool = sellToken?.isCustomPool || buyToken?.isCustomPool;

      // Check for special tokens that need handling regardless of coinId
      const isSpecialToken =
        sellToken?.symbol === "WLFI" ||
        buyToken?.symbol === "WLFI" ||
        sellToken?.symbol === "ENS" ||
        buyToken?.symbol === "ENS" ||
        sellToken?.symbol === "CULT" ||
        buyToken?.symbol === "CULT";

      // Don't early return for custom pools with ID=0 or special tokens
      if (!address || !publicClient) return;
      if (!isCustomPool && !isSpecialToken && (!coinId || coinId === 0n)) return;

      try {
        // Calculate the pool ID - different method for custom pools
        let poolId;

        // Check for CULT, ENS and WLFI specifically first
        const isUsingCult = sellToken?.symbol === "CULT" || buyToken?.symbol === "CULT";
        const isUsingEns = sellToken?.symbol === "ENS" || buyToken?.symbol === "ENS";
        const isUsingWlfi = sellToken?.symbol === "WLFI" || buyToken?.symbol === "WLFI";

        if (isUsingCult) {
          // Use the specific CULT pool ID
          poolId = CULT_POOL_ID;
        } else if (isUsingEns) {
          // Use the specific ENS pool ID
          poolId = ENS_POOL_ID;
        } else if (isUsingWlfi) {
          // Use the specific WLFI pool ID
          poolId = WLFI_POOL_ID;
        } else if (isCustomPool) {
          // Use the custom token's poolId if available
          const customToken = sellToken?.isCustomPool ? sellToken : buyToken;
          poolId = customToken?.poolId || USDT_POOL_ID;
        } else {
          // For regular pools, use the non-ETH token's ID
          const tokenId = sellToken?.id === null ? buyToken?.id : sellToken?.id;

          // Determine contract address based on coin ID
          const isCookbook = isCookbookCoin(tokenId ?? null);
          const contractAddress = isCookbook ? CookbookAddress : CoinsAddress;

          // Regular pool ID calculation with correct contract address - default to 0n if no tokenId
          poolId = computePoolId(tokenId ?? 0n, buyToken?.swapFee ?? SWAP_FEE, contractAddress);
        }

        // Determine which ZAMM address to use for LP balance lookup
        const tokenIdForCheck = sellToken?.id === null ? buyToken?.id : sellToken?.id;
        const isCookbook =
          isUsingCult || isUsingEns || isUsingWlfi
            ? true
            : isCustomPool
              ? false
              : isCookbookCoin(tokenIdForCheck ?? null);
        const targetZAMMAddress = isCookbook ? CookbookAddress : ZAMMAddress;
        const targetZAMMAbi = isCookbook ? CookbookAbi : ZAMMAbi;

        // Read the user's LP token balance for this pool
        const balance = (await publicClient.readContract({
          address: targetZAMMAddress,
          abi: targetZAMMAbi,
          functionName: "balanceOf",
          args: [address, poolId],
        })) as bigint;

        setLpTokenBalance(balance);
      } catch (err) {
        console.error("Failed to fetch LP token balance:", err);
        setLpTokenBalance(0n);
      }
    };

    fetchLpBalance();
  }, [
    address,
    publicClient,
    coinId,
    sellToken?.isCustomPool,
    buyToken?.isCustomPool,
    sellToken?.poolId,
    buyToken?.poolId,
    sellToken?.symbol,
    buyToken?.symbol,
  ]);

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
    if (!buyToken && tokens.length > 1) {
      setBuyToken(tokens[1]);
    }
  }, [tokens, buyToken]);

  useEffect(() => {
    if (tokens.length && sellToken.id === null /* ETH */) {
      // pick the ETH entry from tokens
      const ethToken = tokens.find((t) => t.id === null);
      if (ethToken) setSellToken(ethToken);
    }
  }, [tokens]);

  // Remove liquidity only supports one-way calculation: LP amount -> Token amounts
  // The output panels are read-only

  const syncFromSell = async (val: string) => {
    // In Remove Liquidity mode, track the LP burn amount separately
    setLpBurnAmount(val);

    // Calculate the expected token amounts based on the LP amount to burn
    if (!reserves || !val) {
      setSellAmt("");
      setBuyAmt("");
      return;
    }

    try {
      // Calculate the pool ID - different method for custom pools
      const isUsingCult = sellToken?.symbol === "CULT" || buyToken?.symbol === "CULT";
      const isUsingEns = sellToken?.symbol === "ENS" || buyToken?.symbol === "ENS";
      const isUsingWlfi = sellToken?.symbol === "WLFI" || buyToken?.symbol === "WLFI";
      const customPoolUsed = sellToken?.isCustomPool || buyToken?.isCustomPool;
      let poolId;

      if (isUsingCult) {
        // Use the specific CULT pool ID
        poolId = CULT_POOL_ID;
      } else if (isUsingEns) {
        // Use the specific ENS pool ID
        poolId = ENS_POOL_ID;
      } else if (isUsingWlfi) {
        // Use the specific WLFI pool ID
        poolId = WLFI_POOL_ID;
      } else if (customPoolUsed) {
        // Use the custom token's poolId if available
        const customToken = sellToken?.isCustomPool ? sellToken : buyToken;
        poolId = customToken?.poolId || USDT_POOL_ID;
      } else {
        // For regular pools, use the non-ETH token's ID
        const tokenId = sellToken?.id === null ? buyToken?.id : sellToken?.id;

        // Determine contract address based on coin ID
        const isCookbook = isCookbookCoin(tokenId ?? null);
        const contractAddress = isCookbook ? CookbookAddress : CoinsAddress;

        // Regular pool ID calculation with correct contract address - default to 0n if no tokenId
        poolId = computePoolId(tokenId ?? 0n, buyToken?.swapFee ?? SWAP_FEE, contractAddress);
      }

      if (!publicClient) {
        return;
      }

      // Determine which ZAMM address to use for pool info lookup
      const isCookbook =
        isUsingCult || isUsingEns || isUsingWlfi ? true : customPoolUsed ? false : isCookbookCoin(coinId);
      const targetZAMMAddress = isCookbook ? CookbookAddress : ZAMMAddress;
      const targetZAMMAbi = isCookbook ? CookbookAbi : ZAMMAbi;

      const poolInfo = (await publicClient.readContract({
        address: targetZAMMAddress,
        abi: targetZAMMAbi,
        functionName: "pools",
        args: [poolId],
      })) as any;

      // Ensure we have pool data
      if (!poolInfo) {
        return;
      }

      // Extract supply from pool data (the 7th item in the array for this contract, index 6)
      const totalSupply = poolInfo[6] as bigint; // Pool struct has supply at index 6

      if (totalSupply === 0n) {
        return;
      }

      // Calculate proportional amount of tokens based on removeLiquidity calculation in ZAMM.sol
      const burnAmount = parseUnits(val || "0", 18);

      // Calculate amounts: amount0 = liquidity * reserve0 / totalSupply (from ZAMM.sol)
      // This is the mulDiv function in ZAMM.sol converted to TypeScript
      const ethAmount = (burnAmount * reserves.reserve0) / totalSupply;
      const tokenAmount = (burnAmount * reserves.reserve1) / totalSupply;

      // Sanity checks
      if (ethAmount > reserves.reserve0 || tokenAmount > reserves.reserve1) {
        console.error("Error: Calculated redemption exceeds pool reserves!");
        setSellAmt("");
        setBuyAmt("");
        return;
      }

      // Update the input fields with the calculated values
      setSellAmt(ethAmount === 0n ? "" : formatEther(ethAmount));

      // Use the correct decimals for the token - handle CULT, ENS and WLFI specifically
      let tokenDecimals = 18; // Default to 18 decimals

      if (isUsingCult) {
        tokenDecimals = 18; // CULT has 18 decimals
      } else if (isUsingEns) {
        tokenDecimals = 18; // ENS has 18 decimals
      } else if (isUsingWlfi) {
        tokenDecimals = 18; // WLFI has 18 decimals
      } else if (customPoolUsed) {
        // For other custom pools (like USDT), use their actual decimals
        const customToken = sellToken?.isCustomPool ? sellToken : buyToken;
        tokenDecimals = customToken?.decimals || 6; // USDT defaults to 6
      } else {
        tokenDecimals = 18; // Regular tokens have 18 decimals
      }

      setBuyAmt(tokenAmount === 0n ? "" : formatUnits(tokenAmount, tokenDecimals));
    } catch (err) {
      console.error("Error calculating remove liquidity amounts:", err);
      setSellAmt("");
      setBuyAmt("");
    }
  };

  const executeRemoveLiquidity = async () => {
    // Validate inputs
    if (!reserves || !address || !publicClient) {
      setTxError("Missing required data for transaction");
      return;
    }

    if (!lpBurnAmount || Number.parseFloat(lpBurnAmount) <= 0) {
      setTxError("Please enter a valid amount of LP tokens to burn");
      return;
    }

    // Check if burn amount exceeds user's balance
    // LP tokens always use 18 decimals
    const burnAmount = parseUnits(lpBurnAmount, 18);
    // if (burnAmount > lpTokenBalance) {
    //   setTxError(
    //     `You only have ${formatUnits(lpTokenBalance, 18)} LP tokens available`,
    //   );
    //   return;
    // }

    setTxError(null);

    try {
      // Check if we're on mainnet
      if (chainId !== mainnet.id) {
        setTxError("Please connect to Ethereum mainnet to perform this action");
        return;
      }

      // Check if we're dealing with the special USDT token
      let poolKey;
      const isUsdtPool = sellToken.symbol === "USDT" || buyToken?.symbol === "USDT";
      const isUsingCult = sellToken.symbol === "CULT" || buyToken?.symbol === "CULT";
      const isUsingEns = sellToken.symbol === "ENS" || buyToken?.symbol === "ENS";
      const isUsingWlfi = sellToken.symbol === "WLFI" || buyToken?.symbol === "WLFI";

      // Determine if this is a cookbook coin
      const isCookbook = isCookbookCoin(coinId) || isUsingEns || isUsingWlfi;

      if (isUsingCult) {
        // Use the specific CULT pool key with correct id1=0n and feeOrHook
        poolKey = CULT_POOL_KEY;
      } else if (isUsingEns) {
        // Use the specific ENS pool key
        poolKey = ENS_POOL_KEY;
      } else if (isUsingWlfi) {
        // Use the specific WLFI pool key
        poolKey = WLFI_POOL_KEY;
      } else if (isUsdtPool) {
        // Use the custom pool key for USDT-ETH pool
        const customToken = sellToken.isCustomPool ? sellToken : buyToken;
        poolKey = customToken?.poolKey || USDT_POOL_KEY;
      } else if (isCookbook) {
        // Cookbook coin pool key - use CookbookAddress as token1
        poolKey = computePoolKey(coinId, buyToken?.swapFee ?? SWAP_FEE, CookbookAddress);
      } else {
        // Regular pool key
        poolKey = computePoolKey(coinId, buyToken?.swapFee ?? SWAP_FEE) as ZAMMPoolKey;
      }

      // Parse the minimum amounts from the displayed expected return
      const amount0Min = sellAmt ? withSlippage(parseEther(sellAmt), slippageBps) : 0n;

      // Use correct decimals for token1 (6 for USDT, 18 for regular coins including ENS)
      const tokenDecimals = isUsdtPool ? 6 : 18;
      const amount1Min = buyAmt ? withSlippage(parseUnits(buyAmt, tokenDecimals), slippageBps) : 0n;

      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      // Call removeLiquidity on the appropriate ZAMM contract
      const targetZAMMAddress = isCookbook ? CookbookAddress : ZAMMAddress;
      const targetZAMMAbi = isCookbook ? CookbookAbi : ZAMMAbi;

      const hash = await writeContractAsync({
        address: targetZAMMAddress,
        abi: targetZAMMAbi,
        functionName: "removeLiquidity",
        args: [poolKey as any, burnAmount, amount0Min, amount1Min, address, deadline],
      });

      setTxHash(hash);
    } catch (err) {
      // Use our utility to handle wallet errors
      const errorMsg = handleWalletError(err);
      if (errorMsg) {
        console.error("Remove liquidity execution error:", err);
        setTxError(errorMsg);
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
      <div className="border-2 border-primary group hover:bg-secondary hover:text-secondary-foreground rounded-t-2xl p-3 pb-4 focus-within:ring-2 focus-within:ring-primary flex flex-col gap-2 bg-secondary/50">
        <div className="flex items-center justify-between">
          <span className="font-medium text-foreground">{t("common.lp_tokens_to_burn_label")}</span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">
              {t("common.balance_colon")} {formatUnits(lpTokenBalance, 18)}
            </span>
            <button
              className="text-xs bg-primary/10 hover:bg-primary/20 text-primary font-medium px-3 py-1.5 rounded touch-manipulation min-w-[50px]"
              onClick={() => syncFromSell(formatUnits(lpTokenBalance, 18))}
            >
              {t("common.max")}
            </button>
          </div>
        </div>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          placeholder="0.0"
          value={lpBurnAmount}
          onChange={(e) => syncFromSell(e.target.value)}
          className={`text-lg sm:text-xl font-medium w-full focus:outline-none h-10 text-right pr-1 rounded px-2
            ${
              isWLFIPool
                ? "bg-white dark:bg-black/30 text-amber-800 dark:text-yellow-400 placeholder-amber-400 dark:placeholder-yellow-400/40 border border-amber-200 dark:border-yellow-500/10 hover:border-amber-300 dark:hover:border-yellow-500/20 focus:border-amber-500 dark:focus:border-yellow-500 focus:ring-2 focus:ring-amber-500/30 dark:focus:ring-yellow-500/30"
                : "bg-secondary/50"
            }`}
        />
        <div className="text-xs text-muted-foreground mt-1">{t("pool.lp_burn_help")}</div>
      </div>
      <div className="relative flex flex-col">
        {/* SELL/PROVIDE panel */}
        {isWLFIPool ? (
          <WlfiSwapPanel
            title={t("common.you_will_receive_eth")}
            selectedToken={sellToken}
            tokens={memoizedTokens}
            onSelect={handleSellTokenSelect}
            isEthBalanceFetching={isEthBalanceFetching}
            amount={sellAmt}
            onAmountChange={() => {}} // Read-only, no changes allowed
            readOnly={true}
            previewLabel={t("common.preview")}
            className="mt-2"
          />
        ) : (
          <SwapPanel
            title={t("common.you_will_receive_eth")}
            selectedToken={sellToken}
            tokens={memoizedTokens}
            onSelect={handleSellTokenSelect}
            isEthBalanceFetching={isEthBalanceFetching}
            amount={sellAmt}
            onAmountChange={() => {}} // Read-only, no changes allowed
            readOnly={true}
            previewLabel={t("common.preview")}
            className="mt-2 rounded-md p-2 pb-4 focus-within:ring-2 focus-within:ring-primary/60"
          />
        )}
        {buyToken &&
          (isWLFIPool ? (
            <WlfiSwapPanel
              title={t("common.you_will_receive_token", {
                token: buyToken.symbol,
              })}
              selectedToken={buyToken}
              tokens={memoizedTokens}
              onSelect={handleBuyTokenSelect}
              isEthBalanceFetching={isEthBalanceFetching}
              amount={buyAmt}
              onAmountChange={() => {}} // Read-only, no changes allowed
              readOnly={true}
              previewLabel={t("common.preview")}
              className="mt-2"
            />
          ) : (
            <SwapPanel
              title={t("common.you_will_receive_token", {
                token: buyToken.symbol,
              })}
              selectedToken={buyToken}
              tokens={memoizedTokens}
              onSelect={handleBuyTokenSelect}
              isEthBalanceFetching={isEthBalanceFetching}
              amount={buyAmt}
              onAmountChange={() => {}} // Read-only, no changes allowed
              readOnly={true}
              previewLabel={t("common.preview")}
              className="mt-2 rounded-b-2xl pt-3 shadow-[0_0_15px_rgba(0,204,255,0.07)]"
            />
          ))}

        {/* Slippage information - clickable to show settings */}
        <SlippageSettings setSlippageBps={setSlippageBps} slippageBps={slippageBps} />
        <div className="text-xs bg-muted/50 border border-primary/30 rounded p-2 mt-2 text-muted-foreground">
          <p className="font-medium mb-1">{t("pool.remove_liquidity_info")}</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>
              {t("pool.your_lp_balance", {
                balance: formatUnits(lpTokenBalance, 18),
              })}
            </li>
            <li>{t("pool.enter_lp_amount")}</li>
            <li>{t("pool.preview_expected_return")}</li>
          </ul>
        </div>

        {isConnected && chainId !== mainnet.id && (
          <div className="text-xs mt-1 px-2 py-1 bg-secondary/70 border border-primary/30 rounded text-foreground">
            <strong>Wrong Network:</strong> Please switch to Ethereum mainnet in your wallet to manage liquidity
          </div>
        )}
        {/* ACTION BUTTON */}
        <button
          onClick={executeRemoveLiquidity}
          disabled={!isConnected || !lpBurnAmount || Number.parseFloat(lpBurnAmount) <= 0 || isPending}
          className={`mt-2 button text-base px-8 py-4 font-bold rounded-lg transform transition-all duration-200
            ${
              isWLFIPool
                ? "bg-gradient-to-r from-amber-500 to-amber-600 dark:from-yellow-500 dark:to-yellow-600 hover:from-amber-600 hover:to-amber-700 dark:hover:from-yellow-600 dark:hover:to-yellow-700 text-white dark:text-black shadow-lg shadow-amber-500/30 dark:shadow-yellow-500/30"
                : "bg-primary text-primary-foreground"
            }
            ${
              !isConnected || !lpBurnAmount || Number.parseFloat(lpBurnAmount) <= 0 || isPending
                ? "opacity-50 cursor-not-allowed"
                : "opacity-100 hover:scale-105 hover:shadow-lg focus:ring-4 focus:ring-primary/50 focus:outline-none"
            }
          `}
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.processing")}
            </span>
          ) : (
            t("pool.remove")
          )}
        </button>
        {/* Status and error messages */}
        {/* Show transaction statuses */}
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
    </div>
  );
};
