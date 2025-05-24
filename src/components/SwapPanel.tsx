import React, { useState, useEffect } from "react";
import { TokenSelector } from "./TokenSelector";
import { TokenMeta } from "@/lib/coins";
import { cn } from "@/lib/utils";
import { PercentageSlider } from "./ui/percentage-slider";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";

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
}) => {
  const [percentage, setPercentage] = useState(0);

  // Calculate current percentage based on amount and balance
  useEffect(() => {
    if (!showPercentageSlider || !selectedToken.balance || !amount) {
      setPercentage(0);
      return;
    }

    try {
      const balance = selectedToken.balance as bigint;
      const amountBigInt = selectedToken.id === null 
        ? parseEther(amount) 
        : parseUnits(amount, selectedToken.decimals || 18);
      
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
      const adjustedBalance = newPercentage === 100 
        ? (balance * 99n) / 100n 
        : (balance * BigInt(newPercentage)) / 100n;
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
        `border-2 border-primary/40 group hover:bg-secondary-foreground p-2 flex flex-col gap-2 focus-within:ring-2 focus-within:ring-primary/60`,
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{title}</span>
        <TokenSelector
          selectedToken={selectedToken}
          tokens={tokens}
          onSelect={onSelect}
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
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          readOnly={readOnly}
          className="text-lg sm:text-xl font-medium w-full focus:outline-none h-10 text-right pr-1 bg-transparent dark:text-foreground dark:placeholder-primary/50"
        />
        {previewLabel ? (
          <span className="text-xs text-primary font-medium">{previewLabel}</span>
        ) : (
          showMaxButton &&
          onMax && (
            <button
              className="text-xs bg-primary/10 hover:bg-primary/20 text-primary font-medium px-3 py-1.5 rounded touch-manipulation min-w-[50px] border border-primary/30 shadow-[0_0_5px_rgba(0,204,255,0.15)]"
              onClick={onMax}
            >
              MAX
            </button>
          )
        )}
      </div>
      
      {/* Percentage slider - only show for sell panels when there's a balance */}
      {showPercentageSlider && selectedToken.balance && selectedToken.balance > 0n ? (
        <div className="mt-2 pt-2 border-t border-primary/20">
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
