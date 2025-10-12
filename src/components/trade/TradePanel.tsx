import type React from "react";
import { useEffect, useMemo, useState, memo } from "react";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { cn, formatNumber } from "@/lib/utils";
import { PercentageBlobs } from "@/components/ui/percentage-blobs";
import { useETHPrice } from "@/hooks/use-eth-price";

import { TokenSelector } from "@/components/pools/TokenSelector";
import type { TokenMetadata } from "@/lib/pools";

/** Heuristics to treat a token as native (ETH) */
const isNative = (t: TokenMetadata | undefined) =>
  !!t &&
  // Prefer a real enum/flag if you have it; fall back to zero address check.
  // @ts-ignore - tolerate unknown TokenStandard values without importing it here
  (t.standard === "NATIVE" || t.address?.toLowerCase?.() === "0x0000000000000000000000000000000000000000");

type TradePanelProps = {
  title: string;
  selectedToken?: TokenMetadata;
  tokens: TokenMetadata[];
  onSelect: (token: TokenMetadata) => void;

  amount: string;
  onAmountChange: (value: string) => void;

  /** Optional MAX button */
  showMaxButton?: boolean;
  onMax?: () => void;

  /** Read-only preview mode (shows a label instead of MAX) */
  readOnly?: boolean;
  previewLabel?: string;

  /** Optional inline % helper */
  showPercentageSlider?: boolean;
  onPercentageChange?: (percentage: number) => void;

  /** Disable input interaction */
  disabled?: boolean;
  locked?: boolean;

  /** Loading state for the amount field */
  isLoading?: boolean;

  /** Optional explicit USD price for the selected token (fallback to ETH price if native) */
  tokenUsdPrice?: number;

  /** Extra classes + optional ARIA label to differentiate buy/sell panels */
  className?: string;
  ariaLabel?: string;
};

export const TradePanel: React.FC<TradePanelProps> = ({
  title,
  selectedToken,
  tokens,
  onSelect,
  amount,
  onAmountChange,
  showPercentageSlider = false,
  onPercentageChange,
  showMaxButton = false,
  onMax,
  readOnly = false,
  previewLabel,
  className = "",
  disabled = false,
  isLoading = false,
  tokenUsdPrice,
  ariaLabel,
  locked = false,
}) => {
  const [percentage, setPercentage] = useState(0);
  const { data: ethPrice } = useETHPrice();

  // Keep the styling identical to your original container
  const panelClass = cn(
    "group relative transition-all duration-150 ease-in-out border-2 border-terminal-black bg-terminal-white hover:shadow-[2px_2px_0_var(--terminal-black)] p-2 flex flex-col gap-2",
    className,
  );

  // % slider sync from typed amount
  useEffect(() => {
    if (!showPercentageSlider || !selectedToken?.balance || !amount) {
      setPercentage(0);
      return;
    }
    try {
      const balance = selectedToken.balance as bigint;
      const amountBI = isNative(selectedToken) ? parseEther(amount) : parseUnits(amount, selectedToken.decimals || 18);

      if (balance > 0n) {
        const pct = Number((amountBI * 100n) / balance);
        setPercentage(Math.min(100, Math.max(0, pct)));
      }
    } catch {
      setPercentage(0);
    }
  }, [amount, selectedToken, showPercentageSlider]);

  const handlePercentageChange = (newPct: number) => {
    setPercentage(newPct);
    if (!selectedToken?.balance) return;

    const balance = selectedToken.balance as bigint;
    let calculatedAmount: string;

    if (isNative(selectedToken)) {
      // ETH: apply 1% headroom at 100% for gas safety
      const adjusted = newPct === 100 ? (balance * 99n) / 100n : (balance * BigInt(newPct)) / 100n;
      calculatedAmount = formatEther(adjusted);
    } else {
      const adjusted = (balance * BigInt(newPct)) / 100n;
      calculatedAmount = formatUnits(adjusted, selectedToken.decimals || 18);
    }

    onAmountChange(calculatedAmount);
    onPercentageChange?.(newPct);
  };

  return (
    <div className={panelClass} aria-label={ariaLabel}>
      {/* Top row: title • % chips • token selector */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground font-medium">{title}</span>

        <div className="flex items-center gap-1">
          {showPercentageSlider && (selectedToken?.balance ?? 0n) > 0n && (
            <div className="hidden group-hover:flex">
              <PercentageBlobs
                value={percentage}
                onChange={handlePercentageChange}
                disabled={readOnly}
                variant="inline"
                size="sm"
                steps={[25, 50, 75]}
                className="flex"
              />
            </div>
          )}

          <TokenSelector
            selectedToken={selectedToken}
            tokens={tokens}
            onSelect={onSelect}
            className="rounded-md relative z-30"
            locked={locked}
          />
        </div>
      </div>

      {/* Amount input / preview */}
      <div className="flex justify-between items-center">
        {readOnly || isLoading ? (
          <div className="text-lg sm:text-xl font-medium w-full h-10 text-right pr-1 text-foreground font-body flex items-center justify-end">
            {isLoading ? "..." : amount ? formatNumber(parseFloat(amount), 6) : "0"}
          </div>
        ) : (
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
          <span className="ml-1 text-xs text-foreground font-medium">{previewLabel}</span>
        ) : (
          showMaxButton &&
          onMax && (
            <button
              className="bg-terminal-black dark:bg-terminal-white text-terminal-white dark:text-terminal-black hover:opacity-90 text-[10px] px-2 py-1 uppercase min-w-[50px]"
              onClick={onMax}
            >
              MAX
            </button>
          )
        )}
      </div>

      {/* USD Value */}
      <UsdValueDisplay
        ethPriceUSD={ethPrice?.priceUSD}
        tokenUsdPrice={tokenUsdPrice}
        amount={amount}
        selectedToken={selectedToken}
      />
    </div>
  );
};

/** USD line, memoized */
const UsdValueDisplay = memo(function UsdValueDisplay({
  ethPriceUSD,
  tokenUsdPrice,
  amount,
  selectedToken,
}: {
  ethPriceUSD?: number;
  tokenUsdPrice?: number; // if provided, we use this directly
  amount: string;
  selectedToken?: TokenMetadata;
}) {
  const usdText = useMemo(() => {
    const qty = parseFloat(amount || "0");
    if (!qty || qty <= 0) return null;

    // Prefer an explicit per-token USD price if passed in
    if (typeof tokenUsdPrice === "number" && isFinite(tokenUsdPrice) && tokenUsdPrice > 0) {
      return formatNumber(qty * tokenUsdPrice, 2);
    }

    // Fallback: native uses live ETH price
    if (isNative(selectedToken) && ethPriceUSD) {
      return formatNumber(qty * ethPriceUSD, 2);
    }

    // Otherwise we can’t estimate here without reserves/price feed
    return null;
  }, [amount, tokenUsdPrice, ethPriceUSD, selectedToken]);

  if (!usdText) return null;
  return <div className="text-xs text-muted-foreground text-right pr-1 -mt-1">≈ ${usdText} USD</div>;
});
