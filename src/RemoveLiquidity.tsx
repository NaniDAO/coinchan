import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { Loader2 } from "lucide-react";
import { handleWalletError, isUserRejectionError } from "./lib/errors";
import { useAccount, useChainId, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { mainnet } from "viem/chains";
import { ETH_TOKEN, TokenMeta, USDT_POOL_ID, USDT_POOL_KEY } from "./lib/coins";
import {
  analyzeTokens,
  computePoolId,
  computePoolKey,
  DEADLINE_SEC,
  getAmountIn,
  getPoolIds,
  SLIPPAGE_BPS,
  SWAP_FEE,
  withSlippage,
  ZAMMPoolKey,
} from "./lib/swap";
import { ZAMMAbi, ZAMMAddress } from "./constants/ZAAM";
import { SuccessMessage } from "./components/SuccessMessage";
import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { SlippageSettings } from "./components/SlippageSettings";
import { nowSec } from "./lib/utils";
import { SwapPanel } from "./components/SwapPanel";
import { useReserves } from "./hooks/use-reserves";

export const RemoveLiquidity = () => {
  const [sellToken, setSellToken] = useState<TokenMeta>(ETH_TOKEN);
  const [buyToken, setBuyToken] = useState<TokenMeta | null>(null);

  const [lpTokenBalance, setLpTokenBalance] = useState<bigint>(0n);
  const [lpBurnAmount, setLpBurnAmount] = useState<string>("");

  const {
    isSellETH,
    isCustom: isCustomPool,
    isCoinToCoin,
    coinId,
    canSwap,
  } = useMemo(() => analyzeTokens(sellToken, buyToken), [sellToken, buyToken]);
  const { mainPoolId } = getPoolIds(sellToken, buyToken, {
    isCustomPool: isCustomPool,
    isCoinToCoin: isCoinToCoin,
  });
  const { data: reserves } = useReserves({
    poolId: mainPoolId,
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

      // Don't early return for custom pools with ID=0
      if (!address || !publicClient) return;
      if (!isCustomPool && (!coinId || coinId === 0n)) return;

      try {
        // Calculate the pool ID - different method for custom pools
        let poolId;

        if (isCustomPool) {
          // Use the custom token's poolId if available
          const customToken = sellToken?.isCustomPool ? sellToken : buyToken;
          poolId = customToken?.poolId || USDT_POOL_ID;
          console.log("Fetching LP balance for custom pool:", customToken?.symbol, "pool ID:", poolId.toString());
        } else {
          // Regular pool ID calculation
          poolId = computePoolId(coinId);
        }

        // Read the user's LP token balance for this pool
        const balance = (await publicClient.readContract({
          address: ZAMMAddress,
          abi: ZAMMAbi,
          functionName: "balanceOf",
          args: [address, poolId],
        })) as bigint;

        console.log("LP token balance:", formatUnits(balance, 18), "for pool ID:", poolId.toString());
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
        const inWei = getAmountIn(outUnits, reserves.reserve0, reserves.reserve1, buyToken?.swapFee ?? SWAP_FEE);
        setSellAmt(inWei === 0n ? "" : formatEther(inWei));
      } else {
        // Coin → ETH path (calculate Coin input)
        const outWei = parseEther(val || "0");
        const inUnits = getAmountIn(outWei, reserves.reserve1, reserves.reserve0, buyToken?.swapFee ?? SWAP_FEE);
        // Use correct decimals for the sell token (6 for USDT, 18 for regular coins)
        const sellTokenDecimals = sellToken?.decimals || 18;
        setSellAmt(inUnits === 0n ? "" : formatUnits(inUnits, sellTokenDecimals));
      }
    } catch {
      setSellAmt("");
    }
  };

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
      const customPoolUsed = sellToken?.isCustomPool || buyToken?.isCustomPool;
      let poolId;

      if (customPoolUsed) {
        // Use the custom token's poolId if available
        const customToken = sellToken?.isCustomPool ? sellToken : buyToken;
        poolId = customToken?.poolId || USDT_POOL_ID;
        console.log("Getting pool info for custom pool:", customToken?.symbol, "pool ID:", poolId.toString());
      } else {
        // Regular pool ID calculation
        poolId = computePoolId(coinId, sellToken?.swapFee ?? SWAP_FEE);
      }

      const poolInfo = (await publicClient.readContract({
        address: ZAMMAddress,
        abi: ZAMMAbi,
        functionName: "pools",
        args: [poolId],
      })) as any;

      // Ensure we have pool data
      if (!poolInfo) return;

      // Extract supply from pool data (the 7th item in the array for this contract, index 6)
      const totalSupply = poolInfo[6] as bigint; // Pool struct has supply at index 6

      if (totalSupply === 0n) return;

      // Calculate proportional amount of tokens based on removeLiquidity calculation in ZAMM.sol
      const burnAmount = parseUnits(val || "0", 18);

      // Calculate amounts: amount0 = liquidity * reserve0 / totalSupply (from ZAMM.sol)
      // This is the mulDiv function in ZAMM.sol converted to TypeScript
      const ethAmount = (burnAmount * reserves.reserve0) / totalSupply;
      const tokenAmount = (burnAmount * reserves.reserve1) / totalSupply;

      // Log calculation details for debugging

      // Sanity checks
      if (ethAmount > reserves.reserve0 || tokenAmount > reserves.reserve1) {
        console.error("Error: Calculated redemption exceeds pool reserves!");
        setSellAmt("");
        setBuyAmt("");
        return;
      }

      // Update the input fields with the calculated values
      setSellAmt(ethAmount === 0n ? "" : formatEther(ethAmount));
      // Use the correct decimals for the token (6 for USDT, 18 for regular tokens)
      const tokenDecimals = customPoolUsed
        ? sellToken?.isCustomPool
          ? sellToken?.decimals || 6
          : buyToken?.decimals || 6
        : 18;

      console.log(
        "Preview calculation using decimals:",
        tokenDecimals,
        "for",
        sellToken?.isCustomPool ? sellToken?.symbol : buyToken?.symbol,
      );

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

    if (!lpBurnAmount || parseFloat(lpBurnAmount) <= 0) {
      setTxError("Please enter a valid amount of LP tokens to burn");
      return;
    }

    // Check if burn amount exceeds user's balance
    // LP tokens always use 18 decimals
    const burnAmount = parseUnits(lpBurnAmount, 18);
    if (burnAmount > lpTokenBalance) {
      setTxError(`You only have ${formatUnits(lpTokenBalance, 18)} LP tokens available`);
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

      if (isUsdtPool) {
        // Use the custom pool key for USDT-ETH pool
        const customToken = sellToken.isCustomPool ? sellToken : buyToken;
        poolKey = customToken?.poolKey || USDT_POOL_KEY;
        console.log("Using custom pool key for removing liquidity:", {
          token: customToken?.symbol || "USDT",
          poolKey: JSON.stringify({
            id0: poolKey.id0.toString(),
            id1: poolKey.id1.toString(),
            token0: poolKey.token0,
            token1: poolKey.token1,
            swapFee: poolKey.swapFee.toString(),
          }),
        });
      } else {
        // Regular pool key
        poolKey = computePoolKey(coinId) as ZAMMPoolKey;
      }

      // Parse the minimum amounts from the displayed expected return
      const amount0Min = sellAmt ? withSlippage(parseEther(sellAmt), slippageBps) : 0n;

      // Use correct decimals for token1 (6 for USDT, 18 for regular coins)
      const tokenDecimals = isUsdtPool ? 6 : 18;
      const amount1Min = buyAmt ? withSlippage(parseUnits(buyAmt, tokenDecimals), slippageBps) : 0n;

      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      // Call removeLiquidity on the ZAMM contract
      const hash = await writeContractAsync({
        address: ZAMMAddress,
        abi: ZAMMAbi,
        functionName: "removeLiquidity",
        args: [poolKey, burnAmount, amount0Min, amount1Min, address, deadline],
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
          <span className="font-medium text-foreground">LP Tokens to Burn</span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Balance: {formatUnits(lpTokenBalance, 18)}</span>
            <button
              className="text-xs bg-primary/10 hover:bg-primary/20 text-primary font-medium px-3 py-1.5 rounded touch-manipulation min-w-[50px]"
              onClick={() => syncFromSell(formatUnits(lpTokenBalance, 18))}
            >
              MAX
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
          className="text-lg sm:text-xl font-medium w-full bg-secondary/50 focus:outline-none h-10 text-right pr-1"
        />
        <div className="text-xs text-muted-foreground mt-1">
          Enter the amount of LP tokens you want to burn to receive ETH and tokens back.
        </div>
      </div>
      <div className="relative flex flex-col">
        {/* SELL/PROVIDE panel */}
        <SwapPanel
          title="You'll Receive (ETH)"
          selectedToken={sellToken}
          tokens={memoizedTokens}
          onSelect={handleSellTokenSelect}
          isEthBalanceFetching={isEthBalanceFetching}
          amount={sellAmt}
          onAmountChange={syncFromSell}
          readOnly={true}
          previewLabel="Preview"
          className="mt-2 rounded-md p-2 pb-4 focus-within:ring-2 focus-within:ring-primary/60"
        />
        {buyToken && (
          <SwapPanel
            title={`You'll Receive (${buyToken.symbol})`}
            selectedToken={buyToken}
            tokens={memoizedTokens}
            onSelect={handleBuyTokenSelect}
            isEthBalanceFetching={isEthBalanceFetching}
            amount={buyAmt}
            onAmountChange={syncFromBuy}
            readOnly={true}
            previewLabel="Preview"
            className="mt-2 rounded-b-2xl pt-3 shadow-[0_0_15px_rgba(0,204,255,0.07)]"
          />
        )}

        {/* Slippage information - clickable to show settings */}
        <SlippageSettings setSlippageBps={setSlippageBps} slippageBps={slippageBps} />
        <div className="text-xs bg-muted/50 border border-primary/30 rounded p-2 mt-2 text-muted-foreground">
          <p className="font-medium mb-1">Remove Liquidity:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Your LP balance: {formatUnits(lpTokenBalance, 18)} LP tokens</li>
            <li>Enter amount of LP tokens to burn</li>
            <li>Preview shows expected return of ETH and tokens</li>
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
          disabled={
            !isConnected ||
            !lpBurnAmount ||
            parseFloat(lpBurnAmount) <= 0 ||
            parseUnits(lpBurnAmount || "0", 18) > lpTokenBalance ||
            isPending
          }
          className={`mt-2 button text-base px-8 py-4 bg-primary text-primary-foreground font-bold rounded-lg transform transition-all duration-200
            ${
              !isConnected ||
              !lpBurnAmount ||
              parseFloat(lpBurnAmount) <= 0 ||
              parseUnits(lpBurnAmount || "0", 18) > lpTokenBalance ||
              isPending
                ? "opacity-50 cursor-not-allowed"
                : "opacity-100 hover:scale-105 hover:shadow-lg focus:ring-4 focus:ring-primary/50 focus:outline-none"
            }
          `}
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing...
            </span>
          ) : (
            "Remove Liquidity"
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
