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

interface CookbookSwapTileProps {
  coinId: string;
  coinName?: string;
  coinSymbol?: string;
  coinIcon?: string;
  poolId?: string;
  userBalance?: bigint;
  feeOrHook?: string | bigint;
}

export function CookbookSwapTile({ 
  coinId, 
  coinSymbol = "TOKEN", 
  coinIcon,
  coinName,
  poolId: providedPoolId,
  userBalance: providedUserBalance,
  feeOrHook 
}: CookbookSwapTileProps) {
  const { t } = useTranslation();
  const { address, isConnected } = useAccount();
  const { theme } = useTheme();

  // States
  const [swapDirection, setSwapDirection] = useState<"buy" | "sell">("buy"); // buy = ETH->Token, sell = Token->ETH
  const [sellAmount, setSellAmount] = useState("");
  const [buyAmount, setBuyAmount] = useState("");
  const [lastEditedField, setLastEditedField] = useState<"sell" | "buy">("sell");
  const [slippageBps, setSlippageBps] = useState<bigint>(300n); // 3% default for AMM
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
      // If poolId is provided, we still need the correct poolKey with feeOrHook
      const fee = feeOrHook ? BigInt(feeOrHook) : 30n;
      const key: CookbookPoolKey = {
        id0: 0n, // ETH
        id1: BigInt(coinId),
        token0: "0x0000000000000000000000000000000000000000" as const,
        token1: CookbookAddress,
        feeOrHook: fee,
      };
      return { poolId: providedPoolId, poolKey: key };
    }
    
    // Compute both pool key and ID with correct fee
    const fee = feeOrHook ? BigInt(feeOrHook) : 30n;
    const key: CookbookPoolKey = {
      id0: 0n, // ETH
      id1: BigInt(coinId),
      token0: "0x0000000000000000000000000000000000000000" as const,
      token1: CookbookAddress,
      feeOrHook: fee,
    };
    const id = computeZCurvePoolId(BigInt(coinId), fee);
    
    return { poolId: id, poolKey: key };
  }, [providedPoolId, coinId, feeOrHook]);

  // Get pool reserves
  const { data: reserves } = useReserves({
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

  // Calculate output based on input
  const calculateOutput = useCallback(
    async (value: string, field: "sell" | "buy") => {
      if (!reserves || !value || parseFloat(value) === 0) {
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
            // Buying tokens with ETH
            const ethIn = parseEther(value);
            const tokensOut = getAmountOut(ethIn, reserves.reserve0, reserves.reserve1, poolKey.feeOrHook);
            setBuyAmount(formatEther(tokensOut));
          } else {
            // Selling tokens for ETH
            const tokensIn = parseEther(value);
            const ethOut = getAmountOut(tokensIn, reserves.reserve1, reserves.reserve0, poolKey.feeOrHook);
            setBuyAmount(formatEther(ethOut));
          }
        } else {
          // User is editing buy amount (exact out)
          if (swapDirection === "buy") {
            // Want exact tokens out, calculate ETH in
            const tokensOut = parseEther(value);
            // Reverse calculation with correct fee
            const feeMultiplier = 10000n - poolKey.feeOrHook;
            const numerator = tokensOut * reserves.reserve0 * 10000n;
            const denominator = (reserves.reserve1 - tokensOut) * feeMultiplier;
            const ethIn = denominator > 0n ? numerator / denominator + 1n : 0n;
            setSellAmount(formatEther(ethIn));
          } else {
            // Want exact ETH out, calculate tokens in
            const ethOut = parseEther(value);
            const feeMultiplier = 10000n - poolKey.feeOrHook;
            const numerator = ethOut * reserves.reserve1 * 10000n;
            const denominator = (reserves.reserve0 - ethOut) * feeMultiplier;
            const tokensIn = denominator > 0n ? numerator / denominator + 1n : 0n;
            setSellAmount(formatEther(tokensIn));
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
    [reserves, swapDirection],
  );

  // Debounced version for user input
  const debouncedCalculateOutput = useMemo(
    () => debounce((value: string, field: "sell" | "buy") => calculateOutput(value, field), 300),
    [calculateOutput],
  );

  // Execute trade
  const executeTrade = async () => {
    if (!address || !sellAmount || !reserves) {
      setErrorMessage(t("trade.invalid_amount", "Please enter a valid amount"));
      return;
    }

    setErrorMessage(null);

    try {
      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      if (swapDirection === "buy") {
        // Buying tokens with ETH
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
      } else {
        // Selling tokens for ETH
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
          if (swapDirection === "buy") {
            // Max ETH (leave some for gas)
            const maxEth = ethBalance ? (ethBalance.value * 99n) / 100n : 0n;
            const formatted = formatEther(maxEth);
            setSellAmount(formatted);
            calculateOutput(formatted, "sell");
          } else {
            // Max tokens
            const maxTokens = providedUserBalance || (cookbookBalance as bigint) || 0n;
            const formatted = formatEther(maxTokens);
            setSellAmount(formatted);
            calculateOutput(formatted, "sell");
          }
        }}
        showPercentageSlider={
          lastEditedField === "sell" &&
          ((swapDirection === "buy" && !!ethBalance && ethBalance.value > 0n) ||
            (swapDirection === "sell" && ((providedUserBalance && providedUserBalance > 0n) || (!!cookbookBalance && (cookbookBalance as bigint) > 0n))))
        }
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
            className="bg-background border-2 border-border rounded-full p-1.5 sm:p-2 hover:border-primary transition-all hover:rotate-180 duration-300"
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
        tokens={[swapDirection === "buy" ? coinToken : ethToken]}
        onSelect={() => {}}
        isEthBalanceFetching={false}
        amount={buyAmount}
        onAmountChange={(val) => {
          setBuyAmount(val);
          setLastEditedField("buy");
          debouncedCalculateOutput(val, "buy");
        }}
        showPercentageSlider={lastEditedField === "buy"}
        isLoading={isCalculating && lastEditedField === "sell"}
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

      {/* Error message */}
      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Slippage settings */}
      <SlippageSettings slippageBps={slippageBps} setSlippageBps={setSlippageBps} />
    </div>
  );
}