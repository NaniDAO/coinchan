import { useState } from "react";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { TokenSelector } from "./components/TokenSelector";
import { CheckIcon, Loader2 } from "lucide-react";
import { Button } from "./components/ui/button";
import { handleWalletError, isUserRejectionError } from "./lib/errors";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { mainnet } from "viem/chains";
import { USDT_POOL_KEY } from "./lib/coins";
import { computePoolKey, withSlippage } from "./lib/swap";
import { ZAAMAbi, ZAAMAddress } from "./constants/ZAAM";
import { SuccessMessage } from "./components/SuccessMessage";

export const RemoveLiquidity = () => {
  const [lpTokenBalance, setLpTokenBalance] = useState<bigint>(0n);
  const [lpBurnAmount, setLpBurnAmount] = useState<string>("");
  const [reserves, setReserves] = useState<{
    reserve0: bigint;
    reserve1: bigint;
  } | null>(null);

  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const chainId = useChainId();

  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);

  const {
    writeContractAsync,
    isPending,
    error: writeError,
  } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

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
        console.log(
          "Getting pool info for custom pool:",
          customToken?.symbol,
          "pool ID:",
          poolId.toString(),
        );
      } else {
        // Regular pool ID calculation
        poolId = computePoolId(coinId);
      }

      const poolInfo = (await publicClient.readContract({
        address: ZAAMAddress,
        abi: ZAAMAbi,
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

      setBuyAmt(
        tokenAmount === 0n ? "" : formatUnits(tokenAmount, tokenDecimals),
      );
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
      setTxError(
        `You only have ${formatUnits(lpTokenBalance, 18)} LP tokens available`,
      );
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
        poolKey = computePoolKey(coinId);
      }

      // Parse the minimum amounts from the displayed expected return
      const amount0Min = sellAmt
        ? withSlippage(parseEther(sellAmt), slippageBps)
        : 0n;

      // Use correct decimals for token1 (6 for USDT, 18 for regular coins)
      const tokenDecimals = isUsdtPool ? 6 : 18;
      const amount1Min = buyAmt
        ? withSlippage(parseUnits(buyAmt, tokenDecimals), slippageBps)
        : 0n;

      console.log("Removing liquidity:", {
        burnAmount: formatUnits(burnAmount, 18),
        amount0Min: formatEther(amount0Min),
        amount1Min: formatUnits(amount1Min, tokenDecimals),
        isUsdtPool,
      });

      // Call removeLiquidity on the ZAMM contract
      const hash = await writeContractAsync({
        address: ZAAMAddress,
        abi: ZAAMAbi,
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

  return (
    <div className="relative flex flex-col">
      <div className="border-2 border-primary group hover:bg-secondary-foreground rounded-t-2xl p-3 pb-4 focus-within:ring-2 focus-within:ring-primary flex flex-col gap-2 bg-secondary/50">
        <div className="flex items-center justify-between">
          <span className="font-medium text-foreground">LP Tokens to Burn</span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">
              Balance: {formatUnits(lpTokenBalance, 18)}
            </span>
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
          Enter the amount of LP tokens you want to burn to receive ETH and
          tokens back.
        </div>
      </div>
      <div className="relative flex flex-col">
        {/* SELL/PROVIDE panel */}
        <div
          className={`border-2 border-primary/40 group hover:bg-secondary-foreground rounded-md p-2 pb-4 focus-within:ring-2 focus-within:ring-primary/60 flex flex-col gap-2 ${mode === "liquidity" && liquidityMode === "remove" ? "mt-2" : ""}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              You'll Receive (ETH)
            </span>
            <div className="">
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
              readOnly={true}
            />
            <span className="text-xs text-primary font-medium">Preview</span>
          </div>
        </div>
        <div
          className={`border-2 border-primary/40 group rounded-b-2xl p-2 pt-3 focus-within:ring-2 hover:bg-secondary-foreground focus-within:ring-primary/60 shadow-[0_0_15px_rgba(0,204,255,0.07)] flex flex-col gap-2 mt-2 ${!(mode === "liquidity" && liquidityMode === "single-eth") ? "" : "hidden"}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              You'll Receive (${buyToken.symbol})
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
              readOnly={true}
            />
            <span className="text-xs text-chart-5 font-medium">Preview</span>
          </div>
        </div>
        {isConnected && chainId !== mainnet.id && (
          <div className="text-xs mt-1 px-2 py-1 bg-secondary/70 border border-primary/30 rounded text-foreground">
            <strong>Wrong Network:</strong> Please switch to Ethereum mainnet in
            your wallet to manage liquidity
          </div>
        )}
        {/* ACTION BUTTON */}
        <Button
          onClick={executeRemoveLiquidity}
          disabled={
            !isConnected ||
            !lpBurnAmount ||
            parseFloat(lpBurnAmount) <= 0 ||
            parseUnits(lpBurnAmount || "0", 18) > lpTokenBalance ||
            isPending
          }
          className="w-full text-base sm:text-lg mt-4 h-12 touch-manipulation dark:bg-primary dark:text-card dark:hover:bg-primary/90 dark:shadow-[0_0_20px_rgba(0,204,255,0.3)]"
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing...
            </span>
          ) : (
            "Remove Liquidity"
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
        {((writeError && !isUserRejectionError(writeError)) ||
          (txError && !txError.includes("Waiting for"))) && (
          <div className="text-sm text-destructive mt-2 bg-background/50 p-2 rounded border border-destructive/20">
            {writeError && !isUserRejectionError(writeError)
              ? writeError.message
              : txError}
          </div>
        )}
        {isSuccess && <SuccessMessage />}
      </div>
    </div>
  );
};
