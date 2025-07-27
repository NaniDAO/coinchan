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
import { useZCurveSale, useZCurveBalance } from "@/hooks/use-zcurve-sale";
import { handleWalletError, isUserRejectionError } from "@/lib/errors";
import { UNIT_SCALE } from "@/lib/zCurveHelpers";
import { debounce } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import type { TokenMeta } from "@/lib/coins";
import { useGetCoin } from "@/hooks/metadata/use-get-coin";
import { CookbookAddress } from "@/constants/Cookbook";
import { ConnectMenu } from "@/ConnectMenu";

interface ZCurveTradingProps {
  coinId: string;
  coinName?: string;
  coinSymbol?: string;
  coinIcon?: string;
}

export function ZCurveTrading({ coinId, coinSymbol = "TOKEN", coinIcon }: ZCurveTradingProps) {
  const { t } = useTranslation();
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { theme } = useTheme();

  // States
  const [swapDirection, setSwapDirection] = useState<"buy" | "sell">("buy"); // buy = ETH->Token, sell = Token->ETH
  const [sellAmount, setSellAmount] = useState("");
  const [buyAmount, setBuyAmount] = useState("");
  const [lastEditedField, setLastEditedField] = useState<"sell" | "buy">("sell");
  const [slippageBps, setSlippageBps] = useState<bigint>(1000n); // 10% default for zCurve
  const [isCalculating, setIsCalculating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch data
  const { data: sale, isLoading: saleLoading } = useZCurveSale(coinId);
  const { data: userBalance } = useZCurveBalance(coinId, address);
  const { data: ethBalance } = useBalance({ address });
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
      id: 0n,
      symbol: "ETH",
      name: "Ethereum",
      decimals: 18,
      image: theme === "dark" ? "/svgs/eth-dark.svg" : "/svgs/eth-light.svg",
      balance: ethBalance?.value || 0n,
      reserve0: 0n,
      reserve1: 0n,
      source: "COOKBOOK" as const,
    }),
    [ethBalance?.value, theme],
  );

  const coinToken = useMemo<TokenMeta>(
    () => ({
      id: BigInt(coinId),
      symbol: coinSymbol || coinData?.symbol || sale?.coin?.symbol || "TOKEN",
      name: coinData?.name || sale?.coin?.name || "Token",
      decimals: 18,
      image: coinIcon || coinData?.imageUrl || sale?.coin?.imageUrl || "",
      balance: userBalance ? BigInt(userBalance.balance) : 0n,
      reserve0: 0n,
      reserve1: 0n,
      source: "COOKBOOK" as const,
    }),
    [coinId, coinSymbol, coinData, coinIcon, userBalance, sale],
  );

  // Calculate output based on input using view helpers
  const calculateOutput = useCallback(
    async (value: string, field: "sell" | "buy") => {
      if (!publicClient || !sale || !value || parseFloat(value) === 0) {
        if (field === "sell") setBuyAmount("");
        else setSellAmount("");
        return;
      }

      setIsCalculating(true);
      setErrorMessage(null);

      try {
        if (field === "sell") {
          // User is editing sell amount
          if (swapDirection === "buy") {
            // Buying tokens with ETH - use coinsForETH
            const ethIn = parseEther(value);
            const coinsOut = await publicClient.readContract({
              address: zCurveAddress,
              abi: zCurveAbi,
              functionName: "coinsForETH",
              args: [BigInt(coinId), ethIn],
            });
            setBuyAmount(formatEther(coinsOut));
          } else {
            // Selling tokens for ETH - use sellRefund
            const coinsIn = parseEther(value);
            const ethOut = await publicClient.readContract({
              address: zCurveAddress,
              abi: zCurveAbi,
              functionName: "sellRefund",
              args: [BigInt(coinId), coinsIn],
            });
            setBuyAmount(formatEther(ethOut));
          }
        } else {
          // User is editing buy amount (exact out)
          if (swapDirection === "buy") {
            // Want exact tokens out, calculate ETH in - use buyCost
            const coinsOut = parseEther(value);
            const ethIn = await publicClient.readContract({
              address: zCurveAddress,
              abi: zCurveAbi,
              functionName: "buyCost",
              args: [BigInt(coinId), coinsOut],
            });
            setSellAmount(formatEther(ethIn));
          } else {
            // Want exact ETH out, calculate tokens in - use coinsToBurnForETH
            const ethOut = parseEther(value);
            const coinsIn = await publicClient.readContract({
              address: zCurveAddress,
              abi: zCurveAbi,
              functionName: "coinsToBurnForETH",
              args: [BigInt(coinId), ethOut],
            });
            setSellAmount(formatEther(coinsIn));
          }
        }
      } catch (error) {
        console.error("Error calculating swap amounts:", error);
        if (field === "sell") setBuyAmount("");
        else setSellAmount("");
      } finally {
        setIsCalculating(false);
      }
    },
    [publicClient, sale, swapDirection, coinId],
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
          let coinsOut = parseEther(buyAmount);

          // Ensure coinsOut is at least UNIT_SCALE to avoid NoWant error
          if (coinsOut > 0n && coinsOut < UNIT_SCALE) {
            coinsOut = UNIT_SCALE;
          }

          // Apply slippage to increase max ETH willing to pay
          const maxEth = (parseEther(sellAmount) * slippageMultiplierInverse) / 10000n;

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
          const ethIn = parseEther(sellAmount);

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
          const ethOut = parseEther(buyAmount);
          // Apply slippage to increase max coins willing to sell
          let maxCoins = (parseEther(sellAmount) * slippageMultiplierInverse) / 10000n;

          // Ensure maxCoins is at least UNIT_SCALE to avoid NoWant error
          if (maxCoins > 0n && maxCoins < UNIT_SCALE) {
            maxCoins = UNIT_SCALE;
          }

          // Validate token balance
          if (userBalance && BigInt(userBalance.balance) < maxCoins) {
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
          let coinsIn = parseEther(sellAmount);

          // Ensure coinsIn is at least UNIT_SCALE to avoid NoWant error
          if (coinsIn > 0n && coinsIn < UNIT_SCALE) {
            coinsIn = UNIT_SCALE;
          }

          // Validate token balance
          if (userBalance && BigInt(userBalance.balance) < coinsIn) {
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

      toast.info(swapDirection === "buy" ? t("trade.buy_initiated") : t("trade.sell_initiated"));
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

  // Clear amounts on success
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
    }
  }, [txSuccess, hash, swapDirection, t]);

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
            const maxTokens = userBalance ? BigInt(userBalance.balance) : 0n;
            const formatted = formatEther(maxTokens);
            setSellAmount(formatted);
            calculateOutput(formatted, "sell");
          }
        }}
        showPercentageSlider={
          lastEditedField === "sell" &&
          ((swapDirection === "buy" && !!ethBalance && ethBalance.value > 0n) ||
            (swapDirection === "sell" && !!userBalance && BigInt(userBalance.balance) > 0n))
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
      {((lastEditedField === "sell" && sellAmount && parseFloat(sellAmount) > 0) ||
        (lastEditedField === "buy" && buyAmount && parseFloat(buyAmount) > 0)) && (
        <ZCurvePriceImpact
          sale={sale}
          tradeAmount={lastEditedField === "sell" ? sellAmount : buyAmount}
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
          <span>{sale.currentPrice ? formatEther(BigInt(sale.currentPrice)).slice(0, 10) : "0"} ETH</span>
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
