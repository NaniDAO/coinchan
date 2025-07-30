import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, parseEther } from "viem";
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SwapPanel } from "@/components/SwapPanel";
import { SlippageSettings } from "@/components/SlippageSettings";
import { LoadingLogo } from "@/components/ui/loading-logo";

import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { useReserves } from "@/hooks/use-reserves";
import { useGetCoin } from "@/hooks/metadata/use-get-coin";
import { handleWalletError, isUserRejectionError } from "@/lib/errors";
import { getAmountOut, withSlippage, DEADLINE_SEC, type CookbookPoolKey } from "@/lib/swap";
import { computeZCurvePoolId } from "@/lib/zCurvePoolId";
import { debounce, nowSec } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import type { TokenMeta } from "@/lib/coins";
import { ConnectMenu } from "@/ConnectMenu";
import { getEthereumIconDataUri } from "@/components/EthereumIcon";

interface EnhancedCookbookSwapTileProps {
  coinId: string;
  coinName?: string;
  coinSymbol?: string;
  coinIcon?: string;
  poolId?: string;
  userBalance?: bigint;
  feeOrHook?: string | bigint;
  onPriceImpactChange?: (
    impact: {
      currentPrice: number;
      projectedPrice: number;
      impactPercent: number;
      action: "buy" | "sell";
    } | null,
  ) => void;
  onTransactionSuccess?: () => void;
}

export function EnhancedCookbookSwapTile({
  coinId,
  coinSymbol = "TOKEN",
  coinIcon,
  coinName,
  poolId: providedPoolId,
  userBalance: providedUserBalance,
  feeOrHook,
  onPriceImpactChange,
  onTransactionSuccess,
}: EnhancedCookbookSwapTileProps) {
  const { t } = useTranslation();
  const { address, isConnected } = useAccount();
  const { theme } = useTheme();

  // States
  const [swapDirection, setSwapDirection] = useState<"buy" | "sell">("buy");
  const [sellAmount, setSellAmount] = useState("");
  const [buyAmount, setBuyAmount] = useState("");
  const [lastEditedField, setLastEditedField] = useState<"sell" | "buy">("sell");
  const [slippageBps, setSlippageBps] = useState<bigint>(300n); // 3% default
  const [isCalculating, setIsCalculating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Get token metadata
  const { data: coinData } = useGetCoin({
    coinId,
    token: CookbookAddress,
  });

  // Get ETH balance
  const { data: ethBalance } = useBalance({ address });

  // Get Cookbook ERC6909 token balance
  const { data: cookbookBalance } = useReadContract({
    address: CookbookAddress,
    abi: CookbookAbi,
    functionName: "balanceOf",
    args: address ? [address, BigInt(coinId)] : undefined,
    query: {
      enabled: !!address,
    },
  });

  // Compute pool ID and key
  const { poolId, poolKey } = useMemo((): { poolId: string; poolKey: CookbookPoolKey } => {
    if (providedPoolId) {
      const fee = feeOrHook ? BigInt(feeOrHook) : 30n;
      const key: CookbookPoolKey = {
        id0: 0n,
        id1: BigInt(coinId),
        token0: "0x0000000000000000000000000000000000000000" as const,
        token1: CookbookAddress,
        feeOrHook: fee,
      };
      return { poolId: providedPoolId, poolKey: key };
    }

    const fee = feeOrHook ? BigInt(feeOrHook) : 30n;
    const key: CookbookPoolKey = {
      id0: 0n,
      id1: BigInt(coinId),
      token0: "0x0000000000000000000000000000000000000000" as const,
      token1: CookbookAddress,
      feeOrHook: fee,
    };
    const id = computeZCurvePoolId(BigInt(coinId), fee);

    return { poolId: id, poolKey: key };
  }, [providedPoolId, coinId, feeOrHook]);

  // Get pool reserves
  const { data: reserves, refetch: refetchReserves } = useReserves({
    poolId,
    source: "COOKBOOK" as const,
  } as any);

  // Transaction state
  const { data: hash, isPending, writeContract } = useWriteContract();
  const { isSuccess: txSuccess } = useWaitForTransactionReceipt({ hash });

  // Create token metadata objects
  const ethToken = useMemo<TokenMeta>(
    () => ({
      id: null,
      symbol: "ETH",
      name: "Ethereum",
      decimals: 18,
      image: getEthereumIconDataUri(theme),
      balance: ethBalance?.value || 0n,
      reserve0: reserves?.reserve0 || 0n,
      reserve1: reserves?.reserve1 || 0n,
      source: "COOKBOOK" as const,
    }),
    [ethBalance?.value, theme, reserves],
  );

  const coinToken = useMemo<TokenMeta>(
    () => ({
      id: BigInt(coinId),
      symbol: coinSymbol || coinData?.symbol || "TOKEN",
      name: coinName || coinData?.name || "Token",
      decimals: 18,
      image: coinIcon || coinData?.imageUrl || "",
      tokenUri: coinIcon || coinData?.imageUrl || "",
      balance: providedUserBalance || (cookbookBalance as bigint) || 0n,
      reserve0: reserves?.reserve0 || 0n,
      reserve1: reserves?.reserve1 || 0n,
      source: "COOKBOOK" as const,
    }),
    [coinId, coinSymbol, coinData, coinIcon, coinName, providedUserBalance, cookbookBalance, reserves],
  );

  // Calculate price impact
  const calculatePriceImpact = useCallback(
    (sellAmountStr: string, buyAmountStr: string, direction: "buy" | "sell") => {
      if (!reserves || !sellAmountStr || !buyAmountStr || parseFloat(sellAmountStr) === 0) {
        onPriceImpactChange?.(null);
        return;
      }

      try {
        const currentPrice = Number(formatEther(reserves.reserve0)) / Number(formatEther(reserves.reserve1));
        let newReserve0: bigint, newReserve1: bigint;

        if (direction === "buy") {
          // Buying tokens with ETH
          const ethIn = parseEther(sellAmountStr);
          const tokensOut = parseEther(buyAmountStr);
          newReserve0 = reserves.reserve0 + ethIn;
          newReserve1 = reserves.reserve1 - tokensOut;
        } else {
          // Selling tokens for ETH
          const tokensIn = parseEther(sellAmountStr);
          const ethOut = parseEther(buyAmountStr);
          newReserve0 = reserves.reserve0 - ethOut;
          newReserve1 = reserves.reserve1 + tokensIn;
        }

        if (newReserve0 > 0n && newReserve1 > 0n) {
          const projectedPrice = Number(formatEther(newReserve0)) / Number(formatEther(newReserve1));
          const impactPercent = ((projectedPrice - currentPrice) / currentPrice) * 100;

          onPriceImpactChange?.({
            currentPrice,
            projectedPrice,
            impactPercent: Math.abs(impactPercent),
            action: direction,
          });
        } else {
          onPriceImpactChange?.(null);
        }
      } catch (error) {
        console.error("Error calculating price impact:", error);
        onPriceImpactChange?.(null);
      }
    },
    [reserves, onPriceImpactChange],
  );

  // Calculate output based on input
  const calculateOutput = useCallback(
    async (value: string, field: "sell" | "buy") => {
      if (!reserves || !value || parseFloat(value) === 0) {
        if (field === "sell") setBuyAmount("");
        else setSellAmount("");
        onPriceImpactChange?.(null);
        return;
      }

      setIsCalculating(true);
      setErrorMessage(null);

      try {
        if (field === "sell") {
          // User is editing sell amount
          if (swapDirection === "buy") {
            // Buying tokens with ETH
            const ethIn = parseEther(value);
            const tokensOut = getAmountOut(ethIn, reserves.reserve0, reserves.reserve1, poolKey.feeOrHook);
            const tokensOutStr = formatEther(tokensOut);
            setBuyAmount(tokensOutStr);
            calculatePriceImpact(value, tokensOutStr, "buy");
          } else {
            // Selling tokens for ETH
            const tokensIn = parseEther(value);
            const ethOut = getAmountOut(tokensIn, reserves.reserve1, reserves.reserve0, poolKey.feeOrHook);
            const ethOutStr = formatEther(ethOut);
            setBuyAmount(ethOutStr);
            calculatePriceImpact(value, ethOutStr, "sell");
          }
        } else {
          // User is editing buy amount (exact out)
          if (swapDirection === "buy") {
            // Want exact tokens out, calculate ETH in
            const tokensOut = parseEther(value);
            // Check if output is too large
            if (tokensOut >= reserves.reserve1) {
              setErrorMessage(t("trade.insufficient_liquidity", "Insufficient liquidity"));
              setSellAmount("");
              return;
            }
            const feeMultiplier = 10000n - poolKey.feeOrHook;
            const numerator = tokensOut * reserves.reserve0 * 10000n;
            const denominator = (reserves.reserve1 - tokensOut) * feeMultiplier;
            const ethIn = denominator > 0n ? numerator / denominator + 1n : 0n;
            const ethInStr = formatEther(ethIn);
            setSellAmount(ethInStr);
            calculatePriceImpact(ethInStr, value, "buy");
          } else {
            // Want exact ETH out, calculate tokens in
            const ethOut = parseEther(value);
            // Check if output is too large
            if (ethOut >= reserves.reserve0) {
              setErrorMessage(t("trade.insufficient_liquidity", "Insufficient liquidity"));
              setSellAmount("");
              return;
            }
            const feeMultiplier = 10000n - poolKey.feeOrHook;
            const numerator = ethOut * reserves.reserve1 * 10000n;
            const denominator = (reserves.reserve0 - ethOut) * feeMultiplier;
            const tokensIn = denominator > 0n ? numerator / denominator + 1n : 0n;
            const tokensInStr = formatEther(tokensIn);
            setSellAmount(tokensInStr);
            calculatePriceImpact(tokensInStr, value, "sell");
          }
        }
      } catch (error) {
        console.error("Error calculating swap amounts:", error);
        if (field === "sell") setBuyAmount("");
        else setSellAmount("");
        onPriceImpactChange?.(null);
      } finally {
        setIsCalculating(false);
      }
    },
    [reserves, swapDirection, poolKey.feeOrHook, calculatePriceImpact],
  );

  // Debounced version for user input
  const debouncedCalculateOutput = useMemo(
    () => debounce((value: string, field: "sell" | "buy") => calculateOutput(value, field), 300),
    [calculateOutput],
  );

  // Execute trade
  const executeTrade = async () => {
    if (!address || !reserves) {
      setErrorMessage(t("trade.invalid_amount", "Please enter a valid amount"));
      return;
    }

    // Check that we have at least one amount
    if (!sellAmount && !buyAmount) {
      setErrorMessage(t("trade.invalid_amount", "Please enter a valid amount"));
      return;
    }

    setErrorMessage(null);

    try {
      const deadline = nowSec() + BigInt(DEADLINE_SEC);
      const isExactOut = lastEditedField === "buy";

      if (swapDirection === "buy") {
        // Buying tokens with ETH
        if (isExactOut) {
          // User wants exact tokens out
          const tokensOut = parseEther(buyAmount);
          const expectedEthIn = parseEther(sellAmount);
          // Add slippage tolerance to max input for exact out
          const maxEthIn = expectedEthIn + (expectedEthIn * slippageBps) / 10000n;

          // Validate ETH balance
          if (ethBalance && ethBalance.value < maxEthIn) {
            setErrorMessage(t("trade.insufficient_balance"));
            return;
          }

          writeContract({
            address: CookbookAddress,
            abi: CookbookAbi,
            functionName: "swapExactOut",
            args: [poolKey, tokensOut, maxEthIn, true, address, deadline],
            value: maxEthIn,
          });
        } else {
          // User specifies exact ETH in
          const ethIn = parseEther(sellAmount);
          const expectedTokens = getAmountOut(ethIn, reserves.reserve0, reserves.reserve1, poolKey.feeOrHook);
          const minTokens = withSlippage(expectedTokens, slippageBps);

          // Validate ETH balance
          if (ethBalance && ethBalance.value < ethIn) {
            setErrorMessage(t("trade.insufficient_balance"));
            return;
          }

          writeContract({
            address: CookbookAddress,
            abi: CookbookAbi,
            functionName: "swapExactIn",
            args: [poolKey, ethIn, minTokens, true, address, deadline],
            value: ethIn,
          });
        }
      } else {
        // Selling tokens for ETH
        if (isExactOut) {
          // User wants exact ETH out
          const ethOut = parseEther(buyAmount);
          const expectedTokensIn = parseEther(sellAmount);
          // Add slippage tolerance to max input for exact out
          const maxTokensIn = expectedTokensIn + (expectedTokensIn * slippageBps) / 10000n;

          // Validate token balance
          const currentTokenBalance = providedUserBalance || (cookbookBalance as bigint) || 0n;
          if (currentTokenBalance < maxTokensIn) {
            setErrorMessage(t("trade.insufficient_balance"));
            return;
          }

          writeContract({
            address: CookbookAddress,
            abi: CookbookAbi,
            functionName: "swapExactOut",
            args: [poolKey, ethOut, maxTokensIn, false, address, deadline],
          });
        } else {
          // User specifies exact tokens in
          const tokensIn = parseEther(sellAmount);
          const expectedEth = getAmountOut(tokensIn, reserves.reserve1, reserves.reserve0, poolKey.feeOrHook);
          const minEth = withSlippage(expectedEth, slippageBps);

          // Validate token balance
          const currentTokenBalance = providedUserBalance || (cookbookBalance as bigint) || 0n;
          if (currentTokenBalance < tokensIn) {
            setErrorMessage(t("trade.insufficient_balance"));
            return;
          }

          writeContract({
            address: CookbookAddress,
            abi: CookbookAbi,
            functionName: "swapExactIn",
            args: [poolKey, tokensIn, minEth, false, address, deadline],
          });
        }
      }
    } catch (error) {
      console.error("Trade error:", error);

      if (isUserRejectionError(error)) {
        toast.error(t("trade.transaction_cancelled"));
      } else {
        const errorMsg = handleWalletError(error, { t });
        setErrorMessage(errorMsg || t("trade.transaction_failed", "Transaction failed"));
      }
    }
  };

  // Clear amounts and refresh data on success
  useEffect(() => {
    if (txSuccess && hash) {
      setSellAmount("");
      setBuyAmount("");
      onPriceImpactChange?.(null);

      // Refetch reserves after a short delay
      setTimeout(() => {
        refetchReserves();
        onTransactionSuccess?.();
      }, 2000);

      toast.success(
        <div className="flex flex-col gap-1">
          <span>{swapDirection === "buy" ? t("trade.buy_successful") : t("trade.sell_successful")}</span>
          <a
            href={`https://etherscan.io/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs underline hover:no-underline"
          >
            {t("common.view_on_etherscan", "View on Etherscan")}
          </a>
        </div>,
      );
    }
  }, [txSuccess, hash, swapDirection, t, refetchReserves, onTransactionSuccess, onPriceImpactChange]);

  // Clear price impact when amounts are cleared
  useEffect(() => {
    if (!sellAmount && !buyAmount) {
      onPriceImpactChange?.(null);
    }
  }, [sellAmount, buyAmount, onPriceImpactChange]);

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Sell panel */}
      <SwapPanel
        title={t("trade.you_pay")}
        selectedToken={swapDirection === "buy" ? ethToken : coinToken}
        tokens={[swapDirection === "buy" ? ethToken : coinToken]}
        onSelect={() => {}}
        isEthBalanceFetching={false}
        amount={sellAmount}
        onAmountChange={(val) => {
          setSellAmount(val);
          setLastEditedField("sell");
          debouncedCalculateOutput(val, "sell");
        }}
        showMaxButton={true}
        onMax={() => {
          const maxAmount =
            swapDirection === "buy"
              ? ethBalance?.value
                ? formatEther(ethBalance.value > parseEther("0.01") ? ethBalance.value - parseEther("0.01") : 0n) // Leave some ETH for gas
                : "0"
              : formatEther(providedUserBalance || (cookbookBalance as bigint) || 0n);
          setSellAmount(maxAmount);
          setLastEditedField("sell");
          calculateOutput(maxAmount, "sell");
        }}
        showPercentageSlider={
          lastEditedField === "sell" &&
          ((swapDirection === "buy" && !!ethBalance && ethBalance.value > 0n) ||
            (swapDirection === "sell" &&
              ((providedUserBalance && providedUserBalance > 0n) ||
                (!!cookbookBalance && (cookbookBalance as bigint) > 0n))))
        }
      />

      {/* Swap direction toggle */}
      <div className="flex justify-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setSwapDirection((prev) => (prev === "buy" ? "sell" : "buy"));
            setSellAmount(buyAmount);
            setBuyAmount(sellAmount);
            setLastEditedField("sell");
            onPriceImpactChange?.(null);
          }}
          className="h-8 w-8 rounded-full border-2 border-border hover:border-primary"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16" />
          </svg>
        </Button>
      </div>

      {/* Buy panel */}
      <SwapPanel
        title={t("trade.you_receive")}
        selectedToken={swapDirection === "buy" ? coinToken : ethToken}
        tokens={[swapDirection === "buy" ? coinToken : ethToken]}
        onSelect={() => {}}
        isEthBalanceFetching={false}
        amount={buyAmount}
        onAmountChange={(val) => {
          setBuyAmount(val);
          setLastEditedField("buy");
          debouncedCalculateOutput(val, "buy");
        }}
        showMaxButton={false}
        isLoading={isCalculating && lastEditedField === "sell"}
      />

      {/* Slippage Settings */}
      <div className="flex justify-end">
        <SlippageSettings slippageBps={slippageBps} setSlippageBps={setSlippageBps} />
      </div>

      {/* Error display */}
      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Trade button */}
      {!isConnected ? (
        <ConnectMenu />
      ) : (
        <Button
          onClick={executeTrade}
          disabled={isPending || (!sellAmount && !buyAmount) || !!errorMessage}
          size="lg"
          className="w-full font-semibold"
        >
          {isPending ? (
            <>
              <LoadingLogo size="sm" className="mr-2" />
              {t("trade.processing", "Processing...")}
            </>
          ) : swapDirection === "buy" ? (
            t("trade.buy_token", { symbol: coinSymbol })
          ) : (
            t("trade.sell_token", { symbol: coinSymbol })
          )}
        </Button>
      )}

      {/* Price impact warning and trade info */}
      {sellAmount && buyAmount && reserves && (
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="flex justify-between">
            <span>{t("trade.rate", "Rate")}</span>
            <span>
              1 {swapDirection === "buy" ? "ETH" : coinSymbol} ={" "}
              {swapDirection === "buy"
                ? buyAmount && sellAmount
                  ? (parseFloat(buyAmount) / parseFloat(sellAmount)).toFixed(4)
                  : "0"
                : sellAmount && buyAmount
                  ? (parseFloat(buyAmount) / parseFloat(sellAmount)).toFixed(6)
                  : "0"}{" "}
              {swapDirection === "buy" ? coinSymbol : "ETH"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
