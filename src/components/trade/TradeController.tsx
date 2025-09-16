import { useState, useCallback, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import type { TokenMetadata } from "@/lib/pools";
import { cn } from "@/lib/utils";
import { useGetTokens } from "@/hooks/use-get-tokens";

type TradeControllerProps = {
  onAmountChange?: (sellAmount: string) => void;
  currentSellToken?: TokenMetadata;
  setSellToken?: (token: TokenMetadata) => void;
  currentBuyToken?: TokenMetadata;
  setBuyToken?: (token: TokenMetadata) => void;
  currentSellAmount?: string;
  setSellAmount?: (amount: string) => void;
  className?: string;
  ariaLabel?: string;
};

/** Heuristics to treat a token as native (ETH) */
const isNative = (t: TokenMetadata | undefined) =>
  !!t && t.address?.toLowerCase?.() === "0x0000000000000000000000000000000000000000" && t.id === 0n;

export const TradeController = ({
  onAmountChange,
  currentSellToken,
  setSellToken,
  currentBuyToken,
  setBuyToken,
  currentSellAmount,
  className,
  ariaLabel,
}: TradeControllerProps) => {
  const [input, setInput] = useState("");
  const [lastParsedCommand, setLastParsedCommand] = useState("");
  const { data: tokensRaw } = useGetTokens();
  const tokens: TokenMetadata[] = tokensRaw ?? [];

  // Sync input with current trade state
  useEffect(() => {
    if (currentSellToken && currentBuyToken && currentSellAmount) {
      const amount = parseFloat(currentSellAmount) > 0 ? currentSellAmount : "0.01";
      const newCommand = `swap ${amount} ${currentSellToken.symbol} for ${currentBuyToken.symbol}`;

      if (newCommand !== input && newCommand !== lastParsedCommand) {
        setInput(newCommand);
        setLastParsedCommand(newCommand);
      }
    }
  }, [currentSellToken, currentBuyToken, currentSellAmount, input, lastParsedCommand]);

  // Build a quick symbol→token map.
  // Preference: token with a non-zero balance; otherwise first seen.
  const tokenMap = useMemo(() => {
    const bySymbol = new Map<string, TokenMetadata[]>();
    for (const t of tokens) {
      if (!t?.symbol) continue;
      const symU = t.symbol.toUpperCase();
      const arr = bySymbol.get(symU) ?? [];
      arr.push(t);
      bySymbol.set(symU, arr);
    }

    const map = new Map<string, TokenMetadata>();
    bySymbol.forEach((arr, sym) => {
      // prefer tokens with balance > 0n
      const best = arr.find((x) => (x.balance ?? 0n) > 0n) ?? arr[0];
      map.set(sym, best);
      map.set(sym.toLowerCase(), best);
    });

    // Ensure ETH mapping exists
    const native = tokens.find((t) => isNative(t));
    if (native) {
      map.set("ETH", native);
      map.set("eth", native);
    }

    return map;
  }, [tokens]);

  // Command patterns
  const swapPatterns = [
    /^swap\s+([0-9]*\.?[0-9]+)\s+([a-zA-Z]+)\s+for\s+([a-zA-Z]+)$/i,
    /^swap\s+([0-9]*\.?[0-9]+)\s+([a-zA-Z]+)\s+to\s+([a-zA-Z]+)$/i,
    /^sell\s+([0-9]*\.?[0-9]+)\s+([a-zA-Z]+)\s+for\s+([a-zA-Z]+)$/i,
    /^buy\s+([a-zA-Z]+)\s+with\s+([0-9]*\.?[0-9]+)\s+([a-zA-Z]+)$/i,
    /^([0-9]*\.?[0-9]+)\s+([a-zA-Z]+)\s*->\s*([a-zA-Z]+)$/i,
    /^([0-9]*\.?[0-9]+)\s+([a-zA-Z]+)\s+for\s+([a-zA-Z]+)$/i,
  ];

  const parseSwapCommand = useCallback(
    (
      command: string,
    ): {
      amount: string;
      sellTokenSymbol: string;
      buyTokenSymbol: string;
    } | null => {
      const trimmed = command.trim();
      for (const pattern of swapPatterns) {
        const m = trimmed.match(pattern);
        if (!m) continue;

        if (pattern.source.includes("buy\\s+([a-zA-Z]+)\\s+with")) {
          return { amount: m[2], sellTokenSymbol: m[3], buyTokenSymbol: m[1] };
        }
        return { amount: m[1], sellTokenSymbol: m[2], buyTokenSymbol: m[3] };
      }
      return null;
    },
    [],
  );

  const executeSwapCommand = useCallback(
    (command: string) => {
      const parsed = parseSwapCommand(command);
      if (!parsed) return false;

      const { amount, sellTokenSymbol, buyTokenSymbol } = parsed;

      const sellToken = tokenMap.get(sellTokenSymbol.toUpperCase()) || tokenMap.get(sellTokenSymbol.toLowerCase());
      const buyToken = tokenMap.get(buyTokenSymbol.toUpperCase()) || tokenMap.get(buyTokenSymbol.toLowerCase());

      if (!sellToken || !buyToken) {
        console.warn(`Tokens not found: ${sellTokenSymbol} or ${buyTokenSymbol}`);
        return false;
      }

      setSellToken?.(sellToken);
      setBuyToken?.(buyToken);
      onAmountChange?.(amount);
      return true;
    },
    [tokenMap, setSellToken, setBuyToken, onAmountChange, parseSwapCommand],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value);

  const commitIfNeeded = () => {
    const command = input.trim();
    if (command && command !== lastParsedCommand) {
      if (executeSwapCommand(command)) {
        setLastParsedCommand(command);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitIfNeeded();
    }
  };

  const handleBlur = () => commitIfNeeded();

  // Dynamic placeholder
  const placeholderText = useMemo(() => {
    if (input?.trim()) return "Enter swap command";

    if (currentSellToken && currentBuyToken) {
      const amount = currentSellAmount && parseFloat(currentSellAmount) > 0 ? currentSellAmount : "0.01";
      return `Try: "swap ${amount} ${currentSellToken.symbol} for ${currentBuyToken.symbol}"`;
    }

    if (currentSellToken) {
      const amount = currentSellAmount && parseFloat(currentSellAmount) > 0 ? currentSellAmount : "0.01";
      const other = tokens.find(
        (t) => t.symbol && t.address !== currentSellToken.address && t.symbol !== currentSellToken.symbol,
      );
      if (other) return `Try: "swap ${amount} ${currentSellToken.symbol} for ${other.symbol}"`;
    }

    const available = Array.from(tokenMap.keys())
      .filter((s) => s === s.toUpperCase())
      .slice(0, 3);

    if (available.length >= 2) return `Try: "swap 0.01 ${available[0]} for ${available[1]}"`;
    return "Enter swap command (e.g., swap 0.01 ZAMM for ETH)";
  }, [tokenMap, currentSellToken, currentBuyToken, currentSellAmount, tokens, input]);

  const suggestionText = useMemo(() => {
    if (!input || !parseSwapCommand(input)) return null;
    return "Press Enter to execute swap command";
  }, [input, parseSwapCommand]);

  const errorText = useMemo(() => {
    if (!input || !input.trim()) return null;
    if (parseSwapCommand(input)) return null;
    return 'Invalid format. Try: "swap [amount] [token] for [token]"';
  }, [input, parseSwapCommand]);

  return (
    <div className={cn("mb-4", className)} aria-label={ariaLabel}>
      <Input
        value={input}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholderText}
        className={cn("text-center font-mono text-sm", className)}
      />
      {suggestionText && <div className="mt-1 text-xs text-muted-foreground text-center">{suggestionText}</div>}
      {errorText && <div className="mt-1 text-xs text-muted-foreground text-center">{errorText}</div>}
    </div>
  );
};
