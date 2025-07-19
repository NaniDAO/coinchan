import type { TokenMeta } from "@/lib/coins";
import { cn } from "@/lib/utils";
import type React from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { TokenSelector } from "./TokenSelector";
import { PercentageSlider } from "./ui/percentage-slider";

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
  /** Show ERC20 input option in token selector */
  showErc20Input?: boolean;
  /** Callback when ERC20 token is created */
  onErc20TokenCreate?: (address: string) => void;
  className?: string;
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
  showErc20Input = false,
  onErc20TokenCreate,
  className = "",
}) => {
  const { t } = useTranslation();
  const [percentage, setPercentage] = useState(0);

  // Calculate current percentage based on amount and balance
  useEffect(() => {
    if (!showPercentageSlider || !selectedToken.balance || !amount) {
      setPercentage(0);
      return;
    }

    try {
      const balance = selectedToken.balance as bigint;
      const tokenDecimals = selectedToken.decimals ?? 18;
      const amountBigInt = selectedToken.id === null ? parseEther(amount) : parseUnits(amount, tokenDecimals);

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
      const tokenDecimals = selectedToken.decimals ?? 18;
      calculatedAmount = formatUnits(adjustedBalance, tokenDecimals);
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
          showErc20Input={showErc20Input}
          onErc20TokenCreate={onErc20TokenCreate}
        />
      </div>
      <div className="flex justify-between items-center">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          placeholder="0.0"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          readOnly={readOnly}
          className="transition-all duration-100 ease-in hover:bg-secondary focus:bg-muted focus:shadow-[0_0_0_2px_var(--terminal-black)] text-lg sm:text-xl font-medium w-full focus:outline-none h-10 text-right pr-1 text-foreground font-body border-none"
        />
        {previewLabel ? (
          <span className="ml-1 text-xs text-foreground font-medium">{previewLabel}</span>
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

      {showPercentageSlider && selectedToken.balance && selectedToken.balance > 0n ? (
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
