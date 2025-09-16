import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { TokenImage } from "../TokenImage";
import { useAccount } from "wagmi";
import { useTokenBalance } from "@/hooks/use-token-balance";
import type { TokenMetadata } from "@/lib/pools";
import { PercentageBlobs } from "@/components/ui/percentage-blobs";
import { formatUnits } from "viem";
import { TokenSelector } from "./TokenSelector";

interface TokenAmountInputProps {
  token: TokenMetadata;
  tokens?: TokenMetadata[];
  locked?: boolean;
  amount: string;
  onAmountChange: (amount: string) => void;
  onTokenSelect: (token: TokenMetadata) => void;
  className?: string;
  /** optional: hide the percentage pills even if balance is fetched */
  hidePercBlobs?: boolean;
  /** optional: placeholder override */
  placeholder?: string;
}

/**
 * TokenAmountInput
 * - Layout mimics popular DEX inputs (big amount on the left, token badge & balance on the right)
 * - Percentage pills (25/50/75/Max) appear on hover if a balance exists
 * - Uses viem's formatUnits for precise integer math when computing percentages
 */
export const TokenAmountInput: React.FC<TokenAmountInputProps> = ({
  token,
  tokens = [],
  locked = false,
  amount,
  onAmountChange,
  onTokenSelect,
  className,
  hidePercBlobs,
  placeholder = "0",
}) => {
  const { address } = useAccount();
  const {
    data: balance,
    isLoading,
    isFetching,
  } = useTokenBalance({
    address,
    token: { address: token.address, id: token.id },
  });

  // Derive useful balance values safely

  const formattedBalance = useMemo(() => {
    if (!balance) return undefined;
    return formatUnits(balance, token.decimals);
  }, [balance]);

  const hasFetched = !isLoading && !isFetching;
  const hasBalance = hasFetched && formattedBalance && Number(formattedBalance) > 0;

  // Display helpers
  const formatForDisplay = (value?: string) => {
    if (!value) return "—";
    const n = Number(value);
    if (!Number.isFinite(n)) return value;
    // Large numbers: keep it compact with 2 dp; small to mid: show up to 5 dp
    const opts =
      n >= 10_000
        ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        : { minimumFractionDigits: 0, maximumFractionDigits: 5 };
    return n.toLocaleString(undefined, opts);
  };

  const handleInput = (v: string) => {
    // keep only digits and one dot
    const clean = v.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
    onAmountChange(clean);
  };

  const percentFromAmount = React.useMemo(() => {
    if (!hasBalance || !formattedBalance) return 0;
    const balNum = Number(formattedBalance);
    const amtNum = Number(amount || 0);
    if (!Number.isFinite(balNum) || balNum === 0) return 0;
    const pct = Math.round((amtNum / balNum) * 100);
    // snap to [0,100]
    return Math.max(0, Math.min(100, pct));
  }, [amount, formattedBalance, hasBalance]);

  const applyPercent = (pct: number) => {
    if (!hasBalance || balance === undefined) return;
    const newRaw = (balance * BigInt(pct)) / BigInt(100);
    const out = formatUnits(newRaw, token.decimals);
    onAmountChange(out);
  };

  console.log("TokenAmountInput.tsx", {
    balance,
  });

  return (
    <div className={cn("group relative rounded-2xl border-2 bg-muted p-4 sm:p-5", className)}>
      {/* Top-right token badge */}
      {locked ? (
        <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 sm:right-5 sm:top-5">
          <div className="h-8 w-8 overflow-hidden rounded-full sm:h-9 sm:w-9">
            <TokenImage imageUrl={token.imageUrl} symbol={token.symbol} />
          </div>
          <span className="text-lg font-semibold sm:text-xl">{token.symbol ?? "Token"}</span>
        </div>
      ) : (
        <div className="max-w-fit absolute right-4 top-4 flex items-center gap-2 sm:right-5 sm:top-5">
          <TokenSelector selectedToken={token} tokens={tokens} onSelect={onTokenSelect} locked={locked} className="" />
        </div>
      )}

      {/* Big amount input */}
      <input
        value={amount}
        onChange={(e) => handleInput(e.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        className="w-full bg-transparent pr-28 text-xl font-semibold leading-none tracking-tight outline-none placeholder:text-muted-foreground/50"
      />

      {/* Bottom row: percentage pills on the left (hover), balance on the right */}
      <div className="mt-8 flex items-center justify-between gap-3">
        {!hidePercBlobs && (
          <div
            className={cn(
              "opacity-0 transition-opacity duration-150 group-hover:opacity-100",
              hasBalance ? "pointer-events-auto" : "pointer-events-none",
            )}
          >
            <PercentageBlobs
              value={percentFromAmount}
              onChange={applyPercent}
              variant="inline"
              size="sm"
              disabled={!hasBalance}
              steps={[25, 50, 75, 100]}
              className="flex gap-1"
            />
          </div>
        )}

        <div className="ml-auto text-right text-sm text-muted-foreground">
          {hasFetched ? (
            <span>
              {formatForDisplay(formattedBalance)} {token.symbol}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">...</span>
          )}
        </div>
      </div>
    </div>
  );
};
