import { Loader2 } from "lucide-react";
import {
  DEADLINE_SEC,
  SLIPPAGE_BPS,
  SWAP_FEE,
  type ZAMMPoolKey,
  analyzeTokens,
  computePoolKey,
  estimateCoinToCoinOutput,
  getAmountIn,
  getAmountOut,
  getPoolIds,
  withSlippage,
} from "./lib/swap";
import { PoolApyDisplay } from "./components/ApyDisplay";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOperatorStatus } from "./hooks/use-operator-status";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWriteContract,
} from "wagmi";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { ZAMMAbi, ZAMMAddress } from "./constants/ZAAM";
import { handleWalletError, isUserRejectionError } from "./lib/errors";
import { useWaitForTransactionReceipt } from "wagmi";
import { TokenMeta, USDT_ADDRESS, USDT_POOL_KEY } from "./lib/coins";
import { useTokenSelection } from "./contexts/TokenSelectionContext";
import {
  determineReserveSource,
  getHelperContractInfo,
  getTargetZAMMAddress,
} from "./lib/coin-utils";
import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { SlippageSettings } from "./components/SlippageSettings";
import { NetworkError } from "./components/NetworkError";
import { ZAMMHelperAbi, ZAMMHelperAddress } from "./constants/ZAMMHelper";
import { ZAMMHelperV1Abi, ZAMMHelperV1Address } from "./constants/ZAMMHelperV1";
import { CoinsAbi, CoinsAddress } from "./constants/Coins";
import { CookbookAddress, CookbookAbi } from "./constants/Cookbook";
import { nowSec } from "./lib/utils";
import { mainnet } from "viem/chains";
import { SwapPanel } from "./components/SwapPanel";
import { useReserves } from "./hooks/use-reserves";
import { useErc20Allowance } from "./hooks/use-erc20-allowance";
import { SuccessMessage } from "./components/SuccessMessage";

export const AddLiquidity = () => {
  const { t } = useTranslation();
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({
    chainId,
  });
  const { tokens, isEthBalanceFetching } = useAllCoins();

  /* State */

  /* user inputs */
  const [sellAmt, setSellAmt] = useState("");
  const [buyAmt, setBuyAmt] = useState("");

  // Use shared token selection context
  const { sellToken, buyToken, setSellToken, setBuyToken } =
    useTokenSelection();

  const { isSellETH, isCustom, isCoinToCoin, coinId, canSwap } = useMemo(
    () => analyzeTokens(sellToken, buyToken),
    [sellToken, buyToken],
  );

  /* Calculate pool reserves */
  const { mainPoolId, targetPoolId } = getPoolIds(sellToken, buyToken, {
    isCustomPool: isCustom,
    isCoinToCoin: isCoinToCoin,
  });

  // Determine source for reserves based on coin type using shared utility
  const reserveSource = determineReserveSource(coinId, isCustom);

  const { data: reserves } = useReserves({
    poolId: mainPoolId,
    source: reserveSource,
  });
  const { data: targetReserves } = useReserves({
    poolId: targetPoolId,
    source: reserveSource,
  });

  const [slippageBps, setSlippageBps] = useState<bigint>(SLIPPAGE_BPS);

  // Determine which AMM contract will handle the pool
  const targetAMMContract = useMemo(() => {
    if (!coinId) return ZAMMAddress; // Default fallback
    const { isCookbook } = getHelperContractInfo(coinId);
    return isCookbook ? CookbookAddress : ZAMMAddress;
  }, [coinId]);

  /* Check if user has approved the target AMM contract as operator */
  const { data: isOperator, refetch: refetchOperator } = useOperatorStatus({
    address,
    operator: targetAMMContract,
    tokenId: coinId,
  });
  const {
    allowance: usdtAllowance,
    refetchAllowance: refetchUsdtAllowance,
    approveMax: approveUsdtMax,
  } = useErc20Allowance({
    token: USDT_ADDRESS,
    spender: ZAMMAddress,
  });

  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);
  const {
    writeContractAsync,
    isPending,
    error: writeError,
  } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const memoizedTokens = useMemo(() => tokens, [tokens]);

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
          // Use correct decimals for the sell token (6 for USDT, 18 for regular coins)
          const sellTokenDecimals = sellToken?.decimals || 18;
          const inUnits = parseUnits(val || "0", sellTokenDecimals);

          // Get correct swap fees for both pools
          const sourceSwapFee = sellToken?.swapFee ?? SWAP_FEE;
          const targetSwapFee = buyToken?.swapFee ?? SWAP_FEE;

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
          sellToken?.swapFee ?? SWAP_FEE,
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
          sellToken?.swapFee ?? SWAP_FEE,
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
          buyToken?.swapFee ?? SWAP_FEE,
        );
        setSellAmt(inWei === 0n ? "" : formatEther(inWei));
      } else {
        // Coin → ETH path (calculate Coin input)
        const outWei = parseEther(val || "0");
        const inUnits = getAmountIn(
          outWei,
          reserves.reserve1,
          reserves.reserve0,
          buyToken?.swapFee ?? SWAP_FEE,
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

  const executeAddLiquidity = async () => {
    // More specific input validation to catch issues early
    if (!canSwap || !reserves || !address || !publicClient) {
      setTxError("Missing required data for transaction");
      return;
    }

    if (!sellAmt || Number.parseFloat(sellAmt) <= 0) {
      setTxError("Please enter a valid sell amount");
      return;
    }

    if (!buyAmt || Number.parseFloat(buyAmt) <= 0) {
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
        if (usdtAllowance === undefined) {
          console.log("USDT allowance is null, checking now...");
          await refetchUsdtAllowance();
        }

        // If USDT amount is greater than allowance, request approval
        if (
          usdtAllowance === undefined ||
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
          const approved = await approveUsdtMax();
          if (approved === undefined) {
            return; // Stop if approval failed or was rejected
          } else {
            const receipt = await publicClient.waitForTransactionReceipt({
              hash: approved,
            });

            // Check if the transaction was successful
            if (receipt.status === "success") {
              await refetchUsdtAllowance();
            }

            return;
          }
        } else {
          console.log("USDT already approved for liquidity:", {
            allowance: usdtAllowance?.toString(),
            requiredAmount: usdtAmount.toString(),
          });
        }
      }

      // Determine coin type and helper contract info
      const { isCookbook } = getHelperContractInfo(coinId);

      if (isUsdtPool) {
        // Use the custom pool key for USDT-ETH pool
        const customToken = sellToken.isCustomPool ? sellToken : buyToken;
        poolKey = customToken?.poolKey || USDT_POOL_KEY;
      } else if (isCookbook) {
        // Cookbook coin pool key - use CookbookAddress as token1
        poolKey = computePoolKey(coinId, SWAP_FEE, CookbookAddress);
        console.log("Using cookbook pool key for add liquidity:", {
          coinId: coinId.toString(),
          isCookbook: true,
        });
      } else {
        // Regular pool key
        poolKey = computePoolKey(coinId) as ZAMMPoolKey;
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
        usdtAllowance !== undefined &&
        amount1 > usdtAllowance
      ) {
        try {
          // First, show a notification about the approval step
          setTxError(
            "Waiting for USDT approval. Please confirm the transaction...",
          );

          // Send the approval transaction
          const approvalHash = await approveUsdtMax();

          // Show a waiting message
          setTxError("USDT approval submitted. Waiting for confirmation...");

          // Wait for the transaction to be mined
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: approvalHash,
          });

          // Check if the transaction was successful
          if (receipt.status === "success") {
            refetchUsdtAllowance();
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

      // Check if the user needs to approve the target AMM contract as operator
      // This is reflexive to the pool source:
      // - Cookbook pool: Approve CookbookAddress as operator on CoinsAddress
      // - ZAMM pool: Approve ZAMMAddress as operator on CoinsAddress
      // Only needed for coins that have a tokenId, not for USDT pools
      if (!isUsdtPool && coinId && isOperator === false) {
        try {
          // First, show a notification about the approval step
          setTxError(
            "Waiting for operator approval. Please confirm the transaction...",
          );

          console.log("Approving target AMM contract as operator on Coins contract:", {
            coinId: coinId.toString(),
            targetAMMContract,
            isCookbook,
          });

          const approvalHash = await writeContractAsync({
            address: CoinsAddress,
            abi: CoinsAbi,
            functionName: "setOperator",
            args: [targetAMMContract, true],
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
            await refetchOperator();
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

      // Use appropriate ZAMMHelper contract based on coin type
      const { helperType } = getHelperContractInfo(coinId);
      const helperAddress = isCookbook
        ? ZAMMHelperV1Address
        : ZAMMHelperAddress;
      const helperAbi = isCookbook ? ZAMMHelperV1Abi : ZAMMHelperAbi;

      console.log(`Using ${helperType} for add liquidity`, {
        helperAddress,
        isCookbook,
        coinId: coinId.toString(),
      });

      try {
        // The contract call returns an array of values rather than an object
        const result = await publicClient.readContract({
          address: helperAddress,
          abi: helperAbi,
          functionName: "calculateRequiredETH",
          args: [
            poolKey as any, // Cast to any to handle union type of ZAMMPoolKey | CookbookPoolKey
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
        // For cookbook coins, use CookbookAddress as the ZAMM instance (V2)
        // For regular coins, use ZAMMAddress (V1)
        const { contractType } = getTargetZAMMAddress(coinId);
        const targetZAMMAddress = isCookbook ? CookbookAddress : ZAMMAddress;
        const targetZAMMAbi = isCookbook ? CookbookAbi : ZAMMAbi;

        console.log(`Using ${contractType} address for addLiquidity`, {
          targetZAMMAddress,
          isCookbook,
          coinId: coinId.toString(),
        });

        const hash = await writeContractAsync({
          address: targetZAMMAddress,
          abi: targetZAMMAbi,
          functionName: "addLiquidity",
          args: [
            poolKey as any, // Cast to any to handle union type of ZAMMPoolKey | CookbookPoolKey
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
            `Error calling ${helperType}.calculateRequiredETH:`,
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
      <PoolApyDisplay
        poolId={mainPoolId ? mainPoolId.toString() : undefined}
        className="mb-2"
      />
      {/* Provide panel */}
      <SwapPanel
        title={t("common.provide")}
        selectedToken={sellToken}
        tokens={memoizedTokens}
        onSelect={handleSellTokenSelect}
        isEthBalanceFetching={isEthBalanceFetching}
        amount={sellAmt}
        onAmountChange={syncFromSell}
        showMaxButton={
          !!(sellToken.balance !== undefined && sellToken.balance > 0n)
        }
        onMax={() => {
          if (sellToken.id === null) {
            const ethAmount = ((sellToken.balance as bigint) * 99n) / 100n;
            syncFromSell(formatEther(ethAmount));
          } else {
            const decimals = sellToken.decimals || 18;
            syncFromSell(formatUnits(sellToken.balance as bigint, decimals));
          }
        }}
        className="rounded-t-2xl pb-4"
      />

      {/* And (second) panel */}
      {buyToken && (
        <SwapPanel
          title={t("common.and")}
          selectedToken={buyToken}
          tokens={memoizedTokens}
          onSelect={handleBuyTokenSelect}
          isEthBalanceFetching={isEthBalanceFetching}
          amount={buyAmt}
          onAmountChange={syncFromBuy}
          className="mt-2 rounded-b-2xl pt-3 shadow-[0_0_15px_rgba(0,204,255,0.07)]"
        />
      )}

      <NetworkError message="manage liquidity" />

      {/* Slippage information */}
      <SlippageSettings
        slippageBps={slippageBps}
        setSlippageBps={setSlippageBps}
      />

      <div className="text-xs bg-muted/50 border border-primary/30 rounded p-2 mt-2 text-muted-foreground dark:text-gray-300">
        <p className="font-medium mb-1">
          {t("pool.adding_liquidity_provides")}
        </p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>{t("pool.lp_tokens_proof")}</li>
          <li>
            {t("pool.earn_fees_from_trades", { fee: Number(SWAP_FEE) / 100 })}
          </li>
          <li>{t("pool.withdraw_anytime")}</li>
        </ul>
      </div>

      <button
        onClick={executeAddLiquidity}
        disabled={!isConnected || isPending}
        className={`mt-2 button text-base px-8 py-4 bg-primary text-primary-foreground font-bold rounded-lg transform transition-all duration-200
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

      {/* Status and error messages */}
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
  );
};
