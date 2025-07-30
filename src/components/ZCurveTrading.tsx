import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, parseEther } from "viem";
import { useAccount, useBalance, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SwapPanel } from "@/components/SwapPanel";
import { SlippageSettings } from "@/components/SlippageSettings";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { ZCurvePriceImpact } from "@/components/ZCurvePriceImpact";

import { zCurveAbi, zCurveAddress } from "@/constants/zCurve";
import { useZCurveSale, useZCurveBalance, useZCurveSaleSummary } from "@/hooks/use-zcurve-sale";
import { handleWalletError, isUserRejectionError } from "@/lib/errors";
import { UNIT_SCALE } from "@/lib/zCurveHelpers";
import { debounce } from "@/lib/utils";
import type { TokenMeta } from "@/lib/coins";
import { useGetCoin } from "@/hooks/metadata/use-get-coin";
import { CookbookAddress } from "@/constants/Cookbook";
import { ConnectMenu } from "@/ConnectMenu";

interface ChartPreviewData {
  amount: bigint;
  isBuying: boolean;
}

interface ZCurveTradingProps {
  coinId: string;
  coinName?: string;
  coinSymbol?: string;
  coinIcon?: string;
  onPreviewChange?: (preview: ChartPreviewData | null) => void;
  onTransactionSuccess?: () => void;
}

export function ZCurveTrading({
  coinId,
  coinSymbol = "TOKEN",
  coinIcon,
  onPreviewChange,
  onTransactionSuccess,
}: ZCurveTradingProps) {
  const { t } = useTranslation();
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  // States
  const [swapDirection, setSwapDirection] = useState<"buy" | "sell">("buy"); // buy = ETH->Token, sell = Token->ETH
  const [sellAmount, setSellAmount] = useState("");
  const [buyAmount, setBuyAmount] = useState("");
  const [lastEditedField, setLastEditedField] = useState<"sell" | "buy">("sell");
  const [slippageBps, setSlippageBps] = useState<bigint>(1000n); // 10% default for zCurve
  const [isCalculating, setIsCalculating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch data
  const { data: sale, isLoading: saleLoading, refetch: refetchSale } = useZCurveSale(coinId);
  const { data: saleSummary, refetch: refetchSummary } = useZCurveSaleSummary(coinId, address);
  const { data: userBalance, refetch: refetchBalance } = useZCurveBalance(coinId, address);
  const { data: ethBalance } = useBalance({ address });

  // Clear preview on unmount
  useEffect(() => {
    return () => {
      onPreviewChange?.(null);
    };
  }, [onPreviewChange]);
  const { data: coinData } = useGetCoin({
    coinId,
    token: CookbookAddress,
  });

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
      tokenUri: "", // ETH uses EthereumIcon component, not a URI
      balance: ethBalance?.value || 0n,
      reserve0: 0n,
      reserve1: 0n,
      source: "COOKBOOK" as const,
    }),
    [ethBalance?.value],
  );

  const coinToken = useMemo<TokenMeta>(
    () => ({
      id: BigInt(coinId),
      symbol: coinSymbol || coinData?.symbol || sale?.coin?.symbol || "TOKEN",
      name: coinData?.name || sale?.coin?.name || "Token",
      decimals: 18,
      tokenUri:
        coinIcon || coinData?.tokenURI || sale?.coin?.tokenURI || coinData?.imageUrl || sale?.coin?.imageUrl || "",
      balance: saleSummary?.userBalance
        ? BigInt(saleSummary.userBalance)
        : userBalance
          ? BigInt(userBalance.balance)
          : 0n,
      reserve0: 0n,
      reserve1: 0n,
      source: "COOKBOOK" as const,
    }),
    [coinId, coinSymbol, coinData, coinIcon, userBalance, saleSummary, sale],
  );

  // Safe parseEther wrapper
  const safeParseEther = (value: string): bigint | null => {
    try {
      return parseEther(value);
    } catch {
      return null;
    }
  };

  // Quantize token amounts to UNIT_SCALE to match contract requirements
  const quantizeToUnitScale = (value: bigint): bigint => {
    return (value / UNIT_SCALE) * UNIT_SCALE;
  };

  // Calculate output based on input using view helpers
  const calculateOutput = useCallback(
    async (value: string, field: "sell" | "buy") => {
      if (!publicClient || !sale || !value || parseFloat(value) === 0) {
        if (field === "sell") setBuyAmount("");
        else setSellAmount("");
        onPreviewChange?.(null);
        return;
      }

      setIsCalculating(true);
      setErrorMessage(null);

      try {
        // Validate and parse the input value
        let parsedValue: bigint;
        try {
          parsedValue = parseEther(value);
        } catch (e) {
          setErrorMessage(t("trade.invalid_amount", "Invalid amount"));
          if (field === "sell") setBuyAmount("");
          else setSellAmount("");
          return;
        }

        if (field === "sell") {
          // User is editing sell amount
          if (swapDirection === "buy") {
            // Buying tokens with ETH - use coinsForETH
            const ethIn = parsedValue;
            const coinsOut = await publicClient.readContract({
              address: zCurveAddress,
              abi: zCurveAbi,
              functionName: "coinsForETH",
              args: [BigInt(coinId), ethIn],
            });
            setBuyAmount(formatEther(coinsOut));
            // Update chart preview
            onPreviewChange?.({
              amount: coinsOut,
              isBuying: true,
            });
          } else {
            // Selling tokens for ETH - use sellRefund
            const coinsIn = parsedValue;
            const ethOut = await publicClient.readContract({
              address: zCurveAddress,
              abi: zCurveAbi,
              functionName: "sellRefund",
              args: [BigInt(coinId), coinsIn],
            });
            setBuyAmount(formatEther(ethOut));
            // Update chart preview
            onPreviewChange?.({
              amount: coinsIn,
              isBuying: false,
            });
          }
        } else {
          // User is editing buy amount (exact out)
          if (swapDirection === "buy") {
            // Want exact tokens out, calculate ETH in - use buyCost
            const coinsOut = parsedValue;
            const ethIn = await publicClient.readContract({
              address: zCurveAddress,
              abi: zCurveAbi,
              functionName: "buyCost",
              args: [BigInt(coinId), coinsOut],
            });
            setSellAmount(formatEther(ethIn));
            // Update chart preview
            onPreviewChange?.({
              amount: coinsOut,
              isBuying: true,
            });
          } else {
            // Want exact ETH out, calculate tokens in - use coinsToBurnForETH
            const ethOut = parsedValue;
            const coinsIn = await publicClient.readContract({
              address: zCurveAddress,
              abi: zCurveAbi,
              functionName: "coinsToBurnForETH",
              args: [BigInt(coinId), ethOut],
            });
            setSellAmount(formatEther(coinsIn));
            // Update chart preview
            onPreviewChange?.({
              amount: coinsIn,
              isBuying: false,
            });
          }
        }
      } catch (error) {
        console.error("Error calculating swap amounts:", error);
        if (field === "sell") setBuyAmount("");
        else setSellAmount("");
        onPreviewChange?.(null);
      } finally {
        setIsCalculating(false);
      }
    },
    [publicClient, sale, swapDirection, coinId, onPreviewChange],
  );

  // Debounced version for user input
  const debouncedCalculateOutput = useMemo(
    () => debounce((value: string, field: "sell" | "buy") => calculateOutput(value, field), 300),
    [calculateOutput],
  );

  // Execute trade
  const executeTrade = async () => {
    if (!address || !publicClient || !sellAmount) {
      setErrorMessage(t("trade.invalid_amount", "Please enter a valid amount"));
      return;
    }

    setErrorMessage(null);

    try {
      // Calculate slippage multipliers (e.g., 1000 bps = 10% slippage)
      // slippageMultiplier: for min amounts (90% of expected with 10% slippage)
      // slippageMultiplierInverse: for max amounts (110% of expected with 10% slippage)
      const slippageMultiplier = 10000n - slippageBps;
      const slippageMultiplierInverse = 10000n + slippageBps;
      const isExactOut = lastEditedField === "buy";

      if (swapDirection === "buy") {
        // Buying tokens with ETH
        if (isExactOut) {
          // User wants exact tokens out (buyExactCoins)
          let coinsOut = safeParseEther(buyAmount);
          if (!coinsOut) {
            setErrorMessage(t("trade.invalid_amount", "Invalid amount"));
            return;
          }

          // Quantize to UNIT_SCALE
          coinsOut = quantizeToUnitScale(coinsOut);

          // Ensure coinsOut is at least UNIT_SCALE to avoid NoWant error
          if (coinsOut > 0n && coinsOut < UNIT_SCALE) {
            coinsOut = UNIT_SCALE;
          }

          // Apply slippage to increase max ETH willing to pay
          const sellAmountParsed = safeParseEther(sellAmount);
          if (!sellAmountParsed) {
            setErrorMessage(t("trade.invalid_amount", "Invalid amount"));
            return;
          }
          const maxEth = (sellAmountParsed * slippageMultiplierInverse) / 10000n;

          // Validate ETH balance with some buffer for gas
          if (ethBalance && ethBalance.value < maxEth) {
            setErrorMessage(t("trade.insufficient_balance"));
            return;
          }

          writeContract({
            address: zCurveAddress,
            abi: zCurveAbi,
            functionName: "buyExactCoins",
            args: [BigInt(coinId), coinsOut, maxEth],
            value: maxEth,
          });
        } else {
          // User wants to spend exact ETH (buyForExactETH)
          const ethIn = safeParseEther(sellAmount);
          if (!ethIn) {
            setErrorMessage(t("trade.invalid_amount", "Invalid amount"));
            return;
          }

          // Validate ETH balance
          if (ethBalance && ethBalance.value < ethIn) {
            setErrorMessage(t("trade.insufficient_balance"));
            return;
          }

          // Get expected output for slippage calculation
          const expectedCoins = await publicClient.readContract({
            address: zCurveAddress,
            abi: zCurveAbi,
            functionName: "coinsForETH",
            args: [BigInt(coinId), ethIn],
          });

          let minCoins = (expectedCoins * slippageMultiplier) / 10000n;

          // Quantize to UNIT_SCALE
          minCoins = quantizeToUnitScale(minCoins);

          // Ensure minCoins is at least UNIT_SCALE to avoid NoWant error
          if (minCoins > 0n && minCoins < UNIT_SCALE) {
            minCoins = UNIT_SCALE;
          }

          writeContract({
            address: zCurveAddress,
            abi: zCurveAbi,
            functionName: "buyForExactETH",
            args: [BigInt(coinId), minCoins],
            value: ethIn,
          });
        }
      } else {
        // Selling tokens for ETH
        if (isExactOut) {
          // User wants exact ETH out (sellForExactETH)
          const ethOut = safeParseEther(buyAmount);
          if (!ethOut) {
            setErrorMessage(t("trade.invalid_amount", "Invalid amount"));
            return;
          }
          // Apply slippage to increase max coins willing to sell
          const sellAmountParsed = safeParseEther(sellAmount);
          if (!sellAmountParsed) {
            setErrorMessage(t("trade.invalid_amount", "Invalid amount"));
            return;
          }
          let maxCoins = (sellAmountParsed * slippageMultiplierInverse) / 10000n;

          // Quantize to UNIT_SCALE
          maxCoins = quantizeToUnitScale(maxCoins);

          // Ensure maxCoins is at least UNIT_SCALE to avoid NoWant error
          if (maxCoins > 0n && maxCoins < UNIT_SCALE) {
            maxCoins = UNIT_SCALE;
          }

          // Validate token balance
          const tokenBalance = saleSummary?.userBalance
            ? BigInt(saleSummary.userBalance)
            : userBalance
              ? BigInt(userBalance.balance)
              : 0n;
          if (tokenBalance < maxCoins) {
            setErrorMessage(t("trade.insufficient_balance"));
            return;
          }

          writeContract({
            address: zCurveAddress,
            abi: zCurveAbi,
            functionName: "sellForExactETH",
            args: [BigInt(coinId), ethOut, maxCoins],
          });
        } else {
          // User wants to sell exact tokens (sellExactCoins)
          let coinsIn = safeParseEther(sellAmount);
          if (!coinsIn) {
            setErrorMessage(t("trade.invalid_amount", "Invalid amount"));
            return;
          }

          // Quantize to UNIT_SCALE
          coinsIn = quantizeToUnitScale(coinsIn);

          // Ensure coinsIn is at least UNIT_SCALE to avoid NoWant error
          if (coinsIn > 0n && coinsIn < UNIT_SCALE) {
            coinsIn = UNIT_SCALE;
          }

          // Validate token balance
          const tokenBalance = saleSummary?.userBalance
            ? BigInt(saleSummary.userBalance)
            : userBalance
              ? BigInt(userBalance.balance)
              : 0n;
          if (tokenBalance < coinsIn) {
            setErrorMessage(t("trade.insufficient_balance"));
            return;
          }

          // Get expected output for slippage calculation
          const expectedEth = await publicClient.readContract({
            address: zCurveAddress,
            abi: zCurveAbi,
            functionName: "sellRefund",
            args: [BigInt(coinId), coinsIn],
          });

          let minEth = (expectedEth * slippageMultiplier) / 10000n;

          // Ensure minEth is at least UNIT_SCALE to avoid NoWant error
          if (minEth > 0n && minEth < UNIT_SCALE) {
            minEth = UNIT_SCALE;
          }

          writeContract({
            address: zCurveAddress,
            abi: zCurveAbi,
            functionName: "sellExactCoins",
            args: [BigInt(coinId), coinsIn, minEth],
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

  // Clear amounts on success and refetch data
  useEffect(() => {
    if (txSuccess && hash) {
      setSellAmount("");
      setBuyAmount("");
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

      // Refetch all data to update UI
      setTimeout(() => {
        refetchSale();
        refetchSummary();
        refetchBalance();
        onTransactionSuccess?.();
      }, 2000); // Wait 2s for indexer to catch up
    }
  }, [txSuccess, hash, swapDirection, t, refetchSale, refetchSummary, refetchBalance, onTransactionSuccess]);

  const saleExpired = sale && BigInt(sale.deadline) < BigInt(Math.floor(Date.now() / 1000));
  const saleFinalized = sale?.status === "FINALIZED";
  const tradingDisabled = !!(saleFinalized || saleExpired);

  if (saleLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingLogo />
      </div>
    );
  }

  if (!sale) {
    return null;
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Trading disabled alert */}
      {tradingDisabled && (
        <Alert variant="destructive">
          <AlertDescription>{saleFinalized ? t("trade.sale_finalized") : t("trade.sale_expired")}</AlertDescription>
        </Alert>
      )}

      {/* Sell panel */}
      <SwapPanel
        title={t("trade.you_pay")}
        selectedToken={swapDirection === "buy" ? ethToken : coinToken}
        tokens={[swapDirection === "buy" ? ethToken : coinToken]} // Pass the token to prevent dropdown
        onSelect={() => {}} // No-op
        isEthBalanceFetching={false}
        amount={sellAmount}
        onAmountChange={(val) => {
          setSellAmount(val);
          setLastEditedField("sell");
          debouncedCalculateOutput(val, "sell");
        }}
        showMaxButton={true}
        onMax={() => {
          if (swapDirection === "buy") {
            // Max ETH (leave some for gas)
            const maxEth = ethBalance ? (ethBalance.value * 99n) / 100n : 0n;
            const formatted = formatEther(maxEth);
            setSellAmount(formatted);
            calculateOutput(formatted, "sell");
          } else {
            // Max tokens
            const maxTokens = saleSummary?.userBalance
              ? BigInt(saleSummary.userBalance)
              : userBalance
                ? BigInt(userBalance.balance)
                : 0n;
            const formatted = formatEther(maxTokens);
            setSellAmount(formatted);
            calculateOutput(formatted, "sell");
          }
        }}
        showPercentageSlider={
          (lastEditedField === "sell" &&
            ((swapDirection === "buy" && !!ethBalance && ethBalance.value > 0n) ||
              (swapDirection === "sell" &&
                ((saleSummary?.userBalance && BigInt(saleSummary.userBalance) > 0n) ||
                  (userBalance && BigInt(userBalance.balance) > 0n))))) ||
          false
        }
        disabled={tradingDisabled}
      />

      {/* Flip button */}
      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={() => {
              setSwapDirection(swapDirection === "buy" ? "sell" : "buy");
              setSellAmount("");
              setBuyAmount("");
              setErrorMessage(null);
            }}
            disabled={tradingDisabled}
            className="bg-background border-2 border-border rounded-full p-1.5 sm:p-2 hover:border-primary transition-all hover:rotate-180 duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-4 h-4 sm:w-5 sm:h-5"
            >
              <path
                d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Buy panel */}
      <SwapPanel
        title={t("trade.you_receive")}
        selectedToken={swapDirection === "buy" ? coinToken : ethToken}
        tokens={[swapDirection === "buy" ? coinToken : ethToken]} // Pass the token to prevent dropdown
        onSelect={() => {}} // No-op
        isEthBalanceFetching={false}
        amount={buyAmount}
        onAmountChange={(val) => {
          setBuyAmount(val);
          setLastEditedField("buy");
          debouncedCalculateOutput(val, "buy");
        }}
        showPercentageSlider={lastEditedField === "buy"}
        isLoading={isCalculating && lastEditedField === "sell"}
        disabled={tradingDisabled}
      />

      {/* Trade button */}
      {!isConnected ? (
        <ConnectMenu />
      ) : (
        <Button
          onClick={executeTrade}
          disabled={
            isPending ||
            isCalculating ||
            tradingDisabled ||
            !sellAmount ||
            parseFloat(sellAmount) === 0 ||
            !buyAmount ||
            parseFloat(buyAmount) === 0
          }
          className="w-full"
          size="lg"
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <LoadingLogo size="sm" />
              {t("common.processing", "Processing...")}
            </span>
          ) : swapDirection === "buy" ? (
            t("trade.buy")
          ) : (
            t("trade.sell")
          )}
        </Button>
      )}

      {/* Price Impact */}
      {((lastEditedField === "sell" && sellAmount && Number.parseFloat(sellAmount) > 0) ||
        (lastEditedField === "buy" && buyAmount && Number.parseFloat(buyAmount) > 0)) && (
        <ZCurvePriceImpact
          sale={sale}
          tradeAmount={swapDirection === "buy" ? sellAmount : sellAmount}
          tokenAmount={swapDirection === "buy" ? buyAmount : undefined}
          isBuying={swapDirection === "buy"}
        />
      )}

      {/* Error message */}
      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Slippage settings */}
      <SlippageSettings slippageBps={slippageBps} setSlippageBps={setSlippageBps} />

      {/* Sale info */}
      <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-muted-foreground">
        <div className="flex justify-between">
          <span>{t("sale.current_price")}</span>
          <span className="text-right">
            {sale.currentPrice
              ? (() => {
                  const price = Number(formatEther(BigInt(sale.currentPrice)));
                  if (price === 0) return "0 ETH";

                  let priceStr = "";
                  // Format very small prices with better readability
                  if (price < 1e-15) {
                    const exp = Math.floor(Math.log10(price));
                    const mantissa = (price / Math.pow(10, exp)).toFixed(2);
                    priceStr = `${mantissa}×10^${exp} ETH`;
                  } else if (price < 1e-9) {
                    const gwei = price * 1e9;
                    priceStr = `${gwei.toFixed(3)} gwei`;
                  } else if (price < 1e-6) {
                    priceStr = price.toFixed(9) + " ETH";
                  } else {
                    priceStr = price.toFixed(8) + " ETH";
                  }

                  // Calculate tokens per ETH
                  const tokensPerEth = price > 0 ? 1 / price : 0;
                  let tokensStr = "";
                  if (tokensPerEth >= 1e9) {
                    tokensStr = `${(tokensPerEth / 1e9).toFixed(2)}B per ETH`;
                  } else if (tokensPerEth >= 1e6) {
                    tokensStr = `${(tokensPerEth / 1e6).toFixed(2)}M per ETH`;
                  } else if (tokensPerEth >= 1e3) {
                    tokensStr = `${(tokensPerEth / 1e3).toFixed(2)}K per ETH`;
                  } else {
                    tokensStr = `${tokensPerEth.toFixed(2)} per ETH`;
                  }

                  return (
                    <div className="flex flex-col items-end">
                      <span>{priceStr}</span>
                      <span className="text-[10px] text-muted-foreground">{tokensStr}</span>
                    </div>
                  );
                })()
              : "0 ETH"}
          </span>
        </div>
        <div className="flex justify-between">
          <span>{t("trade.eth_in_escrow")}</span>
          <span>{formatEther(BigInt(sale.ethEscrow))} ETH</span>
        </div>
        <div className="flex justify-between">
          <span>{t("sale.tokens_sold")}</span>
          <span>
            {formatEther(BigInt(sale.netSold))} / {formatEther(BigInt(sale.saleCap))}
          </span>
        </div>
      </div>
    </div>
  );
}
