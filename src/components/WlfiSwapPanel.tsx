import type { TokenMeta } from "@/lib/coins";
import { cn, formatNumber } from "@/lib/utils";
import type React from "react";
import { useEffect, useState, memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { TokenSelector } from "./TokenSelector";
import { useETHPrice } from "@/hooks/use-eth-price";
import { ErrorBoundary } from "./ErrorBoundary";

interface WlfiSwapPanelProps {
  title: string;
  selectedToken: TokenMeta;
  tokens: TokenMeta[];
  onSelect: (token: TokenMeta) => void;
  isEthBalanceFetching: boolean;
  amount: string;
  onAmountChange: (value: string) => void;
  showMaxButton?: boolean;
  onMax?: () => void;
  readOnly?: boolean;
  previewLabel?: string;
  showPercentageSlider?: boolean;
  onPercentageChange?: (percentage: number) => void;
  className?: string;
  disabled?: boolean;
  isLoading?: boolean;
}

export const WlfiSwapPanel: React.FC<WlfiSwapPanelProps> = ({
  title,
  selectedToken,
  tokens,
  onSelect,
  isEthBalanceFetching,
  amount,
  onAmountChange,
  showMaxButton = false,
  onMax,
  readOnly = false,
  previewLabel,
  showPercentageSlider = false,
  onPercentageChange,
  className = "",
  disabled = false,
  isLoading = false,
}) => {
  const { t } = useTranslation();
  const [percentage, setPercentage] = useState(0);
  const { data: ethPrice } = useETHPrice();

  // Calculate current percentage based on amount and balance
  useEffect(() => {
    if (!showPercentageSlider || !selectedToken.balance || !amount) {
      setPercentage(0);
      return;
    }

    try {
      const balance = selectedToken.balance as bigint;
      const amountBigInt =
        selectedToken.id === null ? parseEther(amount) : parseUnits(amount, selectedToken.decimals || 18);

      if (balance > 0n) {
        const calculatedPercentage = Number((amountBigInt * 100n) / balance);
        setPercentage(Math.min(100, Math.max(0, calculatedPercentage)));
      }
    } catch {
      setPercentage(0);
    }
  }, [amount, selectedToken.balance, selectedToken.id, selectedToken.decimals, showPercentageSlider]);

  const handlePercentageChange = (newPercentage: number) => {
    setPercentage(newPercentage);

    if (!selectedToken.balance) return;

    const balance = selectedToken.balance as bigint;
    let calculatedAmount;

    if (selectedToken.id === null) {
      // ETH - apply 1% gas discount for 100%
      const adjustedBalance = newPercentage === 100 ? (balance * 99n) / 100n : (balance * BigInt(newPercentage)) / 100n;
      calculatedAmount = formatEther(adjustedBalance);
    } else {
      // Other tokens - use full balance
      const adjustedBalance = (balance * BigInt(newPercentage)) / 100n;
      calculatedAmount = formatUnits(adjustedBalance, selectedToken.decimals || 18);
    }

    onAmountChange(calculatedAmount);
    onPercentageChange?.(newPercentage);
  };

  return (
    <div
      className={cn(
        // WLFI-themed panel with improved light mode
        `group relative transition-all duration-150 ease-in-out 
         bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-black/50 dark:to-black/50
         border-2 border-amber-300 dark:border-yellow-500/20 
         hover:border-amber-400 dark:hover:border-yellow-500/30
         hover:shadow-lg hover:shadow-amber-200/50 dark:hover:shadow-yellow-500/20
         p-3 flex flex-col gap-3 rounded-lg`,
        className,
      )}
    >
      {/* Header with title and token selector */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-amber-700 dark:text-yellow-400">{title}</span>
        <div className="flex items-center gap-2">
          {/* Percentage buttons - improved visibility */}
          {showPercentageSlider && (selectedToken?.balance ?? 0n) > 0n && (
            <div className="flex gap-1">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  onClick={() => handlePercentageChange(pct)}
                  className={cn(
                    "px-2 py-1 text-xs font-semibold rounded transition-all",
                    percentage === pct
                      ? "bg-amber-500 dark:bg-yellow-500 text-white dark:text-black"
                      : "bg-amber-200 dark:bg-yellow-500/20 text-amber-700 dark:text-yellow-400 hover:bg-amber-300 dark:hover:bg-yellow-500/30",
                  )}
                  disabled={isEthBalanceFetching || readOnly}
                >
                  {pct}%
                </button>
              ))}
            </div>
          )}

          <ErrorBoundary fallback={<div>Error in TokenSelector</div>}>
            <TokenSelector
              selectedToken={selectedToken}
              tokens={tokens}
              onSelect={onSelect}
              isEthBalanceFetching={isEthBalanceFetching}
              className="rounded-md relative z-30"
            />
          </ErrorBoundary>
        </div>
      </div>

      {/* Input field with improved styling */}
      <div className="flex justify-between items-center gap-2">
        {readOnly || isLoading ? (
          // Display formatted number when readonly or loading
          <div className="text-xl font-bold w-full h-12 text-right pr-2 text-amber-800 dark:text-yellow-400 flex items-center justify-end">
            {isLoading ? "..." : amount ? formatNumber(parseFloat(amount), 6) : "0"}
          </div>
        ) : (
          // Enhanced input with better light mode visibility
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder="0.0"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            disabled={disabled}
            className="transition-all duration-100 ease-in 
                     bg-white dark:bg-black/30 
                     text-amber-800 dark:text-yellow-400 
                     placeholder-amber-400 dark:placeholder-yellow-400/40
                     text-xl font-bold w-full h-12 text-right pr-2
                     border border-amber-200 dark:border-yellow-500/10 rounded
                     hover:border-amber-300 dark:hover:border-yellow-500/20
                     focus:border-amber-500 dark:focus:border-yellow-500 
                     focus:outline-none focus:ring-2 focus:ring-amber-500/30 dark:focus:ring-yellow-500/30
                     disabled:opacity-50 disabled:cursor-not-allowed"
          />
        )}
        {previewLabel ? (
          <span className="ml-2 text-xs font-semibold text-amber-600 dark:text-yellow-400/60">{previewLabel}</span>
        ) : (
          showMaxButton &&
          onMax && (
            <button
              className="bg-amber-500 dark:bg-yellow-500 text-white dark:text-black hover:bg-amber-600 dark:hover:bg-yellow-600 
                       text-xs font-bold px-3 py-2 rounded transition-colors min-w-[50px]"
              onClick={onMax}
            >
              {t("common.max")}
            </button>
          )
        )}
      </div>

      {/* Balance and USD Value Display */}
      <div className="flex justify-between items-center text-xs">
        <div className="text-amber-600 dark:text-yellow-400/60">
          Balance:{" "}
          {selectedToken.balance
            ? selectedToken.id === null
              ? formatNumber(parseFloat(formatEther(selectedToken.balance as bigint)), 6)
              : formatNumber(parseFloat(formatUnits(selectedToken.balance as bigint, selectedToken.decimals || 18)), 6)
            : "0"}{" "}
          {selectedToken.symbol}
        </div>
        <UsdValueDisplay ethPrice={ethPrice} amount={amount} selectedToken={selectedToken} />
      </div>
    </div>
  );
};

// Memoized USD value display to prevent recalculation on every render
const UsdValueDisplay = memo(
  ({
    ethPrice,
    amount,
    selectedToken,
  }: {
    ethPrice?: { priceUSD: number };
    amount: string;
    selectedToken: TokenMeta;
  }) => {
    const usdValue = useMemo(() => {
      if (!ethPrice?.priceUSD || !amount || parseFloat(amount) <= 0) return null;

      const numAmount = parseFloat(amount);
      let value = 0;

      if (selectedToken.id === null) {
        // ETH
        value = numAmount * ethPrice.priceUSD;
      } else if (selectedToken.reserve0 && selectedToken.reserve1) {
        // Other tokens with reserves
        const ethReserve = parseFloat(formatEther(selectedToken.reserve0));
        const tokenReserve = parseFloat(formatUnits(selectedToken.reserve1, selectedToken.decimals || 18));
        const tokenPriceInEth = ethReserve / tokenReserve;
        const tokenPriceUsd = tokenPriceInEth * ethPrice.priceUSD;
        value = numAmount * tokenPriceUsd;
      }

      return value > 0 ? formatNumber(value, 2) : null;
    }, [ethPrice, amount, selectedToken]);

    if (!usdValue) return null;

    return <div className="text-amber-600 dark:text-yellow-400/60 font-semibold">≈ ${usdValue}</div>;
  },
);

UsdValueDisplay.displayName = "UsdValueDisplay";
