import { useEffect, useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits, parseEther, parseUnits, erc20Abi, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { TrendingUp, ArrowRight } from "lucide-react";

import { SwapPanel } from "./SwapPanel";
import { SlippageSettings } from "./SlippageSettings";
import { Button } from "./ui/button";
import { LoadingLogo } from "./ui/loading-logo";
import { ConnectMenu } from "../ConnectMenu";

import { type TokenMeta, CULT_ADDRESS, CULT_POOL_KEY } from "../lib/coins";
import { CultHookAbi, CultHookAddress } from "../constants/CultHook";
import { getAmountOut, withSlippage, DEADLINE_SEC } from "../lib/swap";
import { nowSec, formatNumber, debounce } from "../lib/utils";
import { handleWalletError } from "../lib/errors";
import { useErc20Allowance } from "../hooks/use-erc20-allowance";
import { getCultHookTaxRate, toGross } from "../lib/cult-hook-utils";

interface CultSwapTileProps {
  ethToken: TokenMeta;
  cultToken: TokenMeta;
  reserves: { reserve0: bigint; reserve1: bigint } | null;
  ethBalance: bigint;
  cultBalance: bigint;
  onTransactionComplete?: () => void;
  onPriceImpactChange?: (
    impact: {
      currentPrice: number;
      projectedPrice: number;
      impactPercent: number;
      action: "buy" | "sell";
    } | null,
  ) => void;
  arbitrageInfo?: {
    type: "swap" | "zap";
    cultFromUniV3: number;
    cultFromCookbook: number;
    percentGain: number;
    testAmountETH: string;
  } | null;
}

export const CultSwapTile = ({
  ethToken,
  cultToken,
  reserves,
  ethBalance,
  cultBalance,
  onTransactionComplete,
  onPriceImpactChange,
  arbitrageInfo,
}: CultSwapTileProps) => {
  const { t } = useTranslation();
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: mainnet.id });
  // ETH price removed - not used in this component

  const [swapDirection, setSwapDirection] = useState<"buy" | "sell">("buy");
  const [sellAmount, setSellAmount] = useState("");
  const [buyAmount, setBuyAmount] = useState("");
  const [lastEditedField, setLastEditedField] = useState<"sell" | "buy">("sell");
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [slippageBps, setSlippageBps] = useState<bigint>(1000n); // Default 10%

  const { writeContractAsync, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const { allowance: cultAllowance } = useErc20Allowance({
    token: CULT_ADDRESS,
    spender: CultHookAddress, // Changed to CultHook for proper tax handling
  });

  // Arbitrage is now calculated in the parent component

  // Calculate output based on input
  const calculateOutput = useCallback(
    (value: string, field: "sell" | "buy") => {
      if (!reserves || !reserves.reserve0 || !reserves.reserve1 || !value || parseFloat(value) === 0) {
        if (field === "sell") setBuyAmount("");
        else setSellAmount("");
        return;
      }

      try {
        if (field === "sell") {
          if (swapDirection === "buy") {
            // Buying CULT with ETH
            const ethIn = parseEther(value);
            const cultOut = getAmountOut(ethIn, reserves.reserve0, reserves.reserve1, 30n);
            setBuyAmount(formatUnits(cultOut, 18));
          } else {
            // Selling CULT for ETH
            const cultIn = parseUnits(value, 18);
            const ethOut = getAmountOut(cultIn, reserves.reserve1, reserves.reserve0, 30n);
            setBuyAmount(formatEther(ethOut));
          }
        } else {
          // User is editing buy amount (exact out)
          if (swapDirection === "buy") {
            // Want exact CULT out, calculate ETH in
            const cultOut = parseUnits(value, 18);
            if (reserves.reserve1 > cultOut && cultOut > 0n) {
              const denominator = (reserves.reserve1 - cultOut) * 9970n;
              if (denominator > 0n) {
                const ethIn = (reserves.reserve0 * cultOut * 10000n) / denominator;
                setSellAmount(formatEther(ethIn));
              } else {
                setSellAmount("");
              }
            } else {
              setSellAmount("");
            }
          } else {
            // Want exact ETH out, calculate CULT in
            const ethOut = parseEther(value);
            if (reserves.reserve0 > ethOut && ethOut > 0n) {
              const denominator = (reserves.reserve0 - ethOut) * 9970n;
              if (denominator > 0n) {
                const cultIn = (reserves.reserve1 * ethOut * 10000n) / denominator;
                setSellAmount(formatUnits(cultIn, 18));
              } else {
                setSellAmount("");
              }
            } else {
              setSellAmount("");
            }
          }
        }
      } catch (error) {
        console.error("Error calculating swap amounts:", error);
        if (field === "sell") setBuyAmount("");
        else setSellAmount("");
      }
    },
    [reserves, swapDirection],
  );

  const debouncedCalculateOutput = useMemo(
    () => debounce((value: string, field: "sell" | "buy") => calculateOutput(value, field), 300),
    [calculateOutput],
  );

  // Calculate price impact
  const priceImpact = useMemo(() => {
    if (!reserves || !reserves.reserve0 || !reserves.reserve1 || !sellAmount || parseFloat(sellAmount) === 0) {
      return null;
    }

    try {
      let newReserve0 = reserves.reserve0;
      let newReserve1 = reserves.reserve1;

      if (swapDirection === "buy") {
        const ethIn = parseEther(sellAmount);
        const cultOut = getAmountOut(ethIn, reserves.reserve0, reserves.reserve1, 30n);
        newReserve0 = reserves.reserve0 + ethIn;
        newReserve1 = reserves.reserve1 - cultOut;
      } else {
        const cultIn = parseUnits(sellAmount, 18);
        const ethOut = getAmountOut(cultIn, reserves.reserve1, reserves.reserve0, 30n);
        newReserve0 = reserves.reserve0 - ethOut;
        newReserve1 = reserves.reserve1 + cultIn;
      }

      const currentPrice = Number(formatEther(reserves.reserve0)) / Number(formatUnits(reserves.reserve1, 18));
      const newPrice = Number(formatEther(newReserve0)) / Number(formatUnits(newReserve1, 18));
      const impactPercent = ((newPrice - currentPrice) / currentPrice) * 100;

      return {
        currentPrice,
        projectedPrice: newPrice,
        impactPercent,
        action: swapDirection,
      };
    } catch (error) {
      console.error("Error calculating price impact:", error);
      return null;
    }
  }, [sellAmount, swapDirection, reserves]);

  // Notify parent of price impact changes
  useEffect(() => {
    onPriceImpactChange?.(priceImpact);
  }, [priceImpact, onPriceImpactChange]);

  // Execute swap through CultHook
  const executeSwap = async () => {
    if (!address || !sellAmount || parseFloat(sellAmount) <= 0 || !reserves || !publicClient) {
      setErrorMessage("Please enter a valid amount");
      return;
    }

    setErrorMessage(null);

    try {
      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      if (swapDirection === "buy") {
        // Buy CULT with ETH
        const ethIn = parseEther(sellAmount);

        if (ethBalance < ethIn) {
          setErrorMessage("Insufficient ETH balance");
          return;
        }

        // Get tax rate and calculate gross amount for ETH
        const cultTaxRate = await getCultHookTaxRate();
        const effectiveSlippageBps = slippageBps + cultTaxRate;

        const cultOut = getAmountOut(ethIn, reserves.reserve0, reserves.reserve1, 30n);
        const minOutWithTax = withSlippage(cultOut, effectiveSlippageBps);
        const msgValue = toGross(ethIn, cultTaxRate);

        const hash = await writeContractAsync({
          address: CultHookAddress,
          abi: CultHookAbi,
          functionName: "swapExactIn",
          args: [CULT_POOL_KEY, ethIn, minOutWithTax, true, address, deadline],
          value: msgValue,
        });

        setTxHash(hash);
        setSellAmount("");
        setBuyAmount("");
      } else {
        // Sell CULT for ETH
        const cultIn = parseUnits(sellAmount, 18);

        if (cultBalance < cultIn) {
          setErrorMessage("Insufficient CULT balance");
          return;
        }

        // Check allowance for CultHook
        if (!cultAllowance || cultAllowance < cultIn) {
          const approveHash = await writeContractAsync({
            address: CULT_ADDRESS,
            abi: erc20Abi,
            functionName: "approve",
            args: [CultHookAddress, maxUint256],
          });

          try {
            await publicClient?.waitForTransactionReceipt({ hash: approveHash });
          } catch (approvalError) {
            setErrorMessage(t("errors.approval_failed"));
            return;
          }
        }

        // Get tax rate for slippage calculation
        const cultTaxRate = await getCultHookTaxRate();
        const effectiveSlippageBps = slippageBps + cultTaxRate;

        const ethOut = getAmountOut(cultIn, reserves.reserve1, reserves.reserve0, 30n);
        const minOutWithTax = withSlippage(ethOut, effectiveSlippageBps);

        const hash = await writeContractAsync({
          address: CultHookAddress,
          abi: CultHookAbi,
          functionName: "swapExactIn",
          args: [CULT_POOL_KEY, cultIn, minOutWithTax, false, address, deadline],
        });

        setTxHash(hash);
        setSellAmount("");
        setBuyAmount("");
      }
    } catch (err) {
      const errorMsg = handleWalletError(err, {
        defaultMessage: t("errors.transaction_error"),
      });
      if (errorMsg) {
        setErrorMessage(errorMsg);
      }
    }
  };

  // Create token objects with balances
  const sellToken = useMemo(() => {
    return swapDirection === "buy" ? { ...ethToken, balance: ethBalance } : { ...cultToken, balance: cultBalance };
  }, [swapDirection, ethToken, cultToken, ethBalance, cultBalance]);

  const buyToken = useMemo(() => {
    return swapDirection === "buy" ? { ...cultToken, balance: cultBalance } : { ...ethToken, balance: ethBalance };
  }, [swapDirection, ethToken, cultToken, ethBalance, cultBalance]);

  useEffect(() => {
    if (isSuccess && onTransactionComplete) {
      onTransactionComplete();
    }
  }, [isSuccess, onTransactionComplete]);

  return (
    <div className="space-y-4">
      {/* Arbitrage notification for swap */}
      {arbitrageInfo && arbitrageInfo.type === "swap" && (
        <div className="flex justify-center">
          <div className="group relative flex items-center gap-2 px-3 py-1.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full animate-pulse hover:animate-none">
            <TrendingUp className="h-3 w-3" />
            <span className="text-muted-foreground">{arbitrageInfo.testAmountETH} ETH</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">{formatNumber(arbitrageInfo.cultFromCookbook, 0)} CULT</span>
            <span className="ml-1 font-semibold text-green-600 dark:text-green-400">
              +{arbitrageInfo.percentGain.toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      <div className="relative space-y-1">
        {/* Sell panel */}
        <SwapPanel
          title={t("ens.you_pay")}
          selectedToken={sellToken}
          tokens={[]}
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
              const maxEth = (ethBalance * 99n) / 100n;
              const formatted = formatEther(maxEth);
              setSellAmount(formatted);
              calculateOutput(formatted, "sell");
            } else {
              const formatted = formatUnits(cultBalance, 18);
              setSellAmount(formatted);
              calculateOutput(formatted, "sell");
            }
          }}
          showPercentageSlider={
            lastEditedField === "sell" &&
            ((swapDirection === "buy" && ethBalance > 0n) || (swapDirection === "sell" && cultBalance > 0n))
          }
          className="pb-2"
        />

        {/* Flip button */}
        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={() => {
                setSwapDirection(swapDirection === "buy" ? "sell" : "buy");
                setSellAmount("");
                setBuyAmount("");
              }}
              className="bg-background border-2 border-red-500/20 rounded-full p-2 hover:border-red-500/40 transition-all hover:rotate-180 duration-300"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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
          title={t("ens.you_receive")}
          selectedToken={buyToken}
          tokens={[]}
          onSelect={() => {}}
          isEthBalanceFetching={false}
          amount={buyAmount}
          onAmountChange={(val) => {
            setBuyAmount(val);
            setLastEditedField("buy");
            debouncedCalculateOutput(val, "buy");
          }}
          showPercentageSlider={lastEditedField === "buy"}
          className="pt-2"
        />

        {/* Swap button */}
        {!isConnected ? (
          <ConnectMenu />
        ) : (
          <Button
            onClick={executeSwap}
            disabled={
              isPending ||
              !sellAmount ||
              parseFloat(sellAmount) === 0 ||
              (swapDirection === "buy" && ethBalance > 0n && parseEther(sellAmount || "0") > ethBalance) ||
              (swapDirection === "sell" && cultBalance > 0n && parseUnits(sellAmount || "0", 18) > cultBalance)
            }
            className="w-full bg-red-500 hover:bg-red-600 text-white"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <LoadingLogo size="sm" />
                {swapDirection === "buy" ? t("cult.buying") : t("cult.selling")}
              </span>
            ) : swapDirection === "buy" ? (
              t("cult.buy_cult")
            ) : (
              t("cult.sell_cult")
            )}
          </Button>
        )}

        {errorMessage && <p className="text-destructive text-sm">{errorMessage}</p>}
        {isSuccess && <p className="text-green-600 text-sm">{t("ens.transaction_confirmed")}</p>}

        {/* Slippage Settings */}
        <div className="mt-4">
          <SlippageSettings slippageBps={slippageBps} setSlippageBps={setSlippageBps} />
        </div>

        {/* Price impact display */}
        {priceImpact && (
          <div className="mt-2 p-2 bg-muted/50 rounded-md">
            <div className="text-xs text-muted-foreground flex items-center justify-between">
              <span>{t("swap.price_impact")}:</span>
              <span className={`font-medium ${priceImpact.impactPercent > 0 ? "text-green-600" : "text-red-600"}`}>
                {priceImpact.impactPercent > 0 ? "+" : ""}
                {priceImpact.impactPercent.toFixed(2)}%
              </span>
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground text-center">
          {t("coin.pool_fee")}: 0.3% | {t("cult.milady_tax")}: 0.1%
        </div>
      </div>
    </div>
  );
};
