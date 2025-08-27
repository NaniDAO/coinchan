import type { TokenMeta } from "@/lib/coins";
import { cn, formatNumber } from "@/lib/utils";
import type React from "react";
import { useEffect, useState, memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { TokenSelector } from "./TokenSelector";
import { PercentageSlider } from "./ui/percentage-slider";
import { useETHPrice } from "@/hooks/use-eth-price";

interface SwapPanelProps {
  title: string;
  selectedToken: TokenMeta;
  tokens: TokenMeta[];
  onSelect: (token: TokenMeta) => void;
  isEthBalanceFetching: boolean;
  amount: string;
  onAmountChange: (value: string) => void;
  showMaxButton?: boolean;
  onMax?: () => void;
  /** When true, makes input read-only and shows a preview label instead of MAX */
  readOnly?: boolean;
  /** Label to display when in preview mode */
  previewLabel?: string;
  /** Show percentage slider for input assistance */
  showPercentageSlider?: boolean;
  /** Callback when percentage changes */
  onPercentageChange?: (percentage: number) => void;
  className?: string;
  /** Disable the input */
  disabled?: boolean;
  /** Show loading state */
  isLoading?: boolean;
}

export const SwapPanel: React.FC<SwapPanelProps> = ({
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
        selectedToken.id === null
          ? parseEther(amount)
          : parseUnits(amount, selectedToken.decimals || 18);

      if (balance > 0n) {
        const calculatedPercentage = Number((amountBigInt * 100n) / balance);
        setPercentage(Math.min(100, Math.max(0, calculatedPercentage)));
      }
    } catch {
      setPercentage(0);
    }
  }, [
    amount,
    selectedToken.balance,
    selectedToken.id,
    selectedToken.decimals,
    showPercentageSlider,
  ]);

  const handlePercentageChange = (newPercentage: number) => {
    setPercentage(newPercentage);

    if (!selectedToken.balance) return;

    const balance = selectedToken.balance as bigint;
    let calculatedAmount;

    if (selectedToken.id === null) {
      // ETH - apply 1% gas discount for 100%
      const adjustedBalance =
        newPercentage === 100
          ? (balance * 99n) / 100n
          : (balance * BigInt(newPercentage)) / 100n;
      calculatedAmount = formatEther(adjustedBalance);
    } else {
      // Other tokens - use full balance
      const adjustedBalance = (balance * BigInt(newPercentage)) / 100n;
      calculatedAmount = formatUnits(
        adjustedBalance,
        selectedToken.decimals || 18,
      );
    }

    onAmountChange(calculatedAmount);
    onPercentageChange?.(newPercentage);
  };

  return (
    <div
      className={cn(
        `transition-all duration-150 ease-in-out border-2 border-terminal-black bg-terminal-white hover:shadow-[2px_2px_0_var(--terminal-black)] p-2 flex flex-col gap-2`,
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground font-medium">{title}</span>
        <TokenSelector
          selectedToken={selectedToken}
          tokens={tokens}
          onSelect={onSelect}
          isEthBalanceFetching={isEthBalanceFetching}
          className="rounded-md"
        />
      </div>
      <div className="flex justify-between items-center">
        {readOnly || isLoading ? (
          // Display formatted number when readonly or loading
          <div className="text-lg sm:text-xl font-medium w-full h-10 text-right pr-1 text-foreground font-body flex items-center justify-end">
            {isLoading
              ? "..."
              : amount
                ? formatNumber(parseFloat(amount), 6)
                : "0"}
          </div>
        ) : (
          // Regular input when editable
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder="0.0"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            disabled={disabled}
            className="transition-all duration-100 ease-in hover:bg-secondary focus:bg-muted focus:shadow-[0_0_0_2px_var(--terminal-black)] text-lg sm:text-xl font-medium w-full focus:outline-none h-10 text-right pr-1 text-foreground font-body border-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
        )}
        {previewLabel ? (
          <span className="ml-1 text-xs text-foreground font-medium">
            {previewLabel}
          </span>
        ) : (
          showMaxButton &&
          onMax && (
            <button
              className="bg-terminal-black dark:bg-terminal-white text-terminal-white dark:text-terminal-black hover:opacity-90 text-[10px] px-2 py-1 uppercase min-w-[50px]"
              onClick={onMax}
            >
              {t("common.max")}
            </button>
          )
        )}
      </div>

      {/* USD Value Display */}
      <UsdValueDisplay
        ethPrice={ethPrice}
        amount={amount}
        selectedToken={selectedToken}
      />

      {showPercentageSlider &&
      selectedToken.balance &&
      selectedToken.balance > 0n ? (
        <div className="mt-2 pt-2 border-t border-terminal-black dark:border-terminal-white/20">
          <PercentageSlider
            value={percentage}
            onChange={handlePercentageChange}
            disabled={isEthBalanceFetching || readOnly}
          />
        </div>
      ) : null}
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
      if (!ethPrice?.priceUSD || !amount || parseFloat(amount) <= 0)
        return null;

      const numAmount = parseFloat(amount);
      let value = 0;

      if (selectedToken.id === null) {
        // ETH
        value = numAmount * ethPrice.priceUSD;
      } else if (selectedToken.reserve0 && selectedToken.reserve1) {
        // Other tokens with reserves
        const ethReserve = parseFloat(formatEther(selectedToken.reserve0));
        const tokenReserve = parseFloat(
          formatUnits(selectedToken.reserve1, selectedToken.decimals || 18),
        );
        const tokenPriceInEth = ethReserve / tokenReserve;
        const tokenPriceUsd = tokenPriceInEth * ethPrice.priceUSD;
        value = numAmount * tokenPriceUsd;
      }

      return value > 0 ? formatNumber(value, 2) : null;
    }, [ethPrice, amount, selectedToken]);

    if (!usdValue) return null;

    return (
      <div className="text-xs text-muted-foreground text-right pr-1 -mt-1">
        ≈ ${usdValue} USD
      </div>
    );
  },
);
