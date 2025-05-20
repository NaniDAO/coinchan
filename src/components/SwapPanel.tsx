import React from "react";
import { TokenSelector } from "./TokenSelector";
import { TokenMeta } from "@/lib/coins";
import { cn } from "@/lib/utils";

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
  className = "",
}) => {
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
    </div>
  );
};
