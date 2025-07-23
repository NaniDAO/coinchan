import { useState, useCallback, useMemo, useEffect } from "react";
import { Input } from "./ui/input";
import { useTokenSelection } from "../contexts/TokenSelectionContext";
import { useAllCoins } from "../hooks/metadata/use-all-coins";
import type { TokenMeta } from "../lib/coins";

interface SwapControllerProps {
  onAmountChange?: (sellAmount: string) => void;
  // Add these props to receive current state
  currentSellToken?: TokenMeta;
  currentBuyToken?: TokenMeta;
  currentSellAmount?: string;
}

export const SwapController = ({
  onAmountChange,
  currentSellToken,
  currentBuyToken,
  currentSellAmount,
}: SwapControllerProps) => {
  const [input, setInput] = useState("");
  const [lastParsedCommand, setLastParsedCommand] = useState("");

  const { setSellToken, setBuyToken } = useTokenSelection();
  const { tokens } = useAllCoins();

  // Sync input with current swap state
  useEffect(() => {
    if (currentSellToken && currentBuyToken && currentSellAmount) {
      const amount =
        parseFloat(currentSellAmount) > 0 ? currentSellAmount : "0.01";
      const newCommand = `swap ${amount} ${currentSellToken.symbol} for ${currentBuyToken.symbol}`;

      // Only update if the command would be different to avoid infinite loops
      if (newCommand !== input && newCommand !== lastParsedCommand) {
        setInput(newCommand);
        setLastParsedCommand(newCommand);
      }
    }
  }, [
    currentSellToken,
    currentBuyToken,
    currentSellAmount,
    input,
    lastParsedCommand,
  ]);

  // Create a map of token symbols to token objects for quick lookup
  // Prefer tokens with highest reserve0 for better accuracy
  const tokenMap = useMemo(() => {
    const map = new Map<string, TokenMeta>();

    // Group tokens by symbol
    const tokensBySymbol = new Map<string, TokenMeta[]>();
    tokens.forEach((token) => {
      if (token.symbol) {
        const upperSymbol = token.symbol.toUpperCase();
        if (!tokensBySymbol.has(upperSymbol)) {
          tokensBySymbol.set(upperSymbol, []);
        }
        tokensBySymbol.get(upperSymbol)!.push(token);
      }
    });

    // For each symbol, pick the token with highest reserve0 (most liquid pool)
    tokensBySymbol.forEach((tokensWithSymbol, symbol) => {
      // Sort by reserve0 descending, treating undefined/null as 0
      const sortedTokens = tokensWithSymbol.sort((a, b) => {
        const reserveA = a.reserve0 ?? 0n;
        const reserveB = b.reserve0 ?? 0n;
        if (reserveA > reserveB) return -1;
        if (reserveA < reserveB) return 1;
        return 0;
      });

      // Use the token with highest liquidity
      const bestToken = sortedTokens[0];
      map.set(symbol, bestToken);
      map.set(symbol.toLowerCase(), bestToken);
    });

    // Ensure ETH is always available
    const ethToken = tokens.find((t) => t.id === null);
    if (ethToken) {
      map.set("ETH", ethToken);
      map.set("eth", ethToken);
    }

    return map;
  }, [tokens]);

  // Regex patterns for different swap command formats
  const swapPatterns = [
    // "swap 0.01 ZAMM for ETH"
    /^swap\s+([0-9]*\.?[0-9]+)\s+([a-zA-Z]+)\s+for\s+([a-zA-Z]+)$/i,
    // "swap 0.01 ZAMM to ETH"
    /^swap\s+([0-9]*\.?[0-9]+)\s+([a-zA-Z]+)\s+to\s+([a-zA-Z]+)$/i,
    // "sell 0.01 ZAMM for ETH"
    /^sell\s+([0-9]*\.?[0-9]+)\s+([a-zA-Z]+)\s+for\s+([a-zA-Z]+)$/i,
    // "buy ETH with 0.01 ZAMM"
    /^buy\s+([a-zA-Z]+)\s+with\s+([0-9]*\.?[0-9]+)\s+([a-zA-Z]+)$/i,
    // "0.01 ZAMM -> ETH"
    /^([0-9]*\.?[0-9]+)\s+([a-zA-Z]+)\s*->\s*([a-zA-Z]+)$/i,
    // "0.01 ZAMM for ETH"
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
      const trimmedCommand = command.trim();

      for (const pattern of swapPatterns) {
        const match = trimmedCommand.match(pattern);
        if (match) {
          // Handle different pattern groups based on the regex
          if (pattern.source.includes("buy\\s+([a-zA-Z]+)\\s+with")) {
            // "buy ETH with 0.01 ZAMM" format
            return {
              amount: match[2],
              sellTokenSymbol: match[3],
              buyTokenSymbol: match[1],
            };
          } else {
            // All other formats: amount, sellToken, buyToken
            return {
              amount: match[1],
              sellTokenSymbol: match[2],
              buyTokenSymbol: match[3],
            };
          }
        }
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

      // Find tokens in our token map
      const sellToken =
        tokenMap.get(sellTokenSymbol.toUpperCase()) ||
        tokenMap.get(sellTokenSymbol.toLowerCase());
      const buyToken =
        tokenMap.get(buyTokenSymbol.toUpperCase()) ||
        tokenMap.get(buyTokenSymbol.toLowerCase());

      if (!sellToken || !buyToken) {
        console.warn(
          `Tokens not found: ${sellTokenSymbol} or ${buyTokenSymbol}`,
        );
        return false;
      }

      // Update the swap interface
      setSellToken(sellToken);
      setBuyToken(buyToken);

      onAmountChange?.(amount);

      return true;
    },
    [tokenMap, setSellToken, setBuyToken, onAmountChange, parseSwapCommand],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const command = input.trim();

      if (command && command !== lastParsedCommand) {
        const success = executeSwapCommand(command);
        if (success) {
          setLastParsedCommand(command);
          // Optional: Clear input after successful parsing
          // setInput("");
        }
      }
    }
  };

  const handleBlur = () => {
    const command = input.trim();
    if (command && command !== lastParsedCommand) {
      const success = executeSwapCommand(command);
      if (success) {
        setLastParsedCommand(command);
      }
    }
  };

  // Generate dynamic placeholder text based on current token selection and amounts
  const placeholderText = useMemo(() => {
    // If input has content, show a simpler placeholder
    if (input && input.trim()) {
      return "Enter swap command";
    }

    // If we have current tokens selected, show a command with them
    if (currentSellToken && currentBuyToken) {
      const amount =
        currentSellAmount && parseFloat(currentSellAmount) > 0
          ? currentSellAmount
          : "0.01";

      return `Try: "swap ${amount} ${currentSellToken.symbol} for ${currentBuyToken.symbol}"`;
    }

    // If we only have sell token, suggest completing the command
    if (currentSellToken) {
      const amount =
        currentSellAmount && parseFloat(currentSellAmount) > 0
          ? currentSellAmount
          : "0.01";

      // Find a different token for the example
      const otherToken = tokens.find(
        (t) =>
          t.symbol &&
          t.id !== currentSellToken.id &&
          t.symbol !== currentSellToken.symbol,
      );

      if (otherToken) {
        return `Try: "swap ${amount} ${currentSellToken.symbol} for ${otherToken.symbol}"`;
      }
    }

    // Fallback to original logic
    const availableTokens = Array.from(tokenMap.keys())
      .filter((symbol) => symbol === symbol.toUpperCase()) // Only show uppercase versions
      .slice(0, 3);

    if (availableTokens.length >= 2) {
      return `Try: "swap 0.01 ${availableTokens[0]} for ${availableTokens[1]}"`;
    }
    return "Enter swap command (e.g., swap 0.01 ZAMM for ETH)";
  }, [
    tokenMap,
    currentSellToken,
    currentBuyToken,
    currentSellAmount,
    tokens,
    input,
  ]);

  // Generate suggestion text that updates based on current state
  const suggestionText = useMemo(() => {
    if (!input || !parseSwapCommand(input)) return null;

    // If command is valid, show execution hint
    return "Press Enter to execute swap command";
  }, [input, parseSwapCommand]);

  // Generate error text for invalid commands
  const errorText = useMemo(() => {
    if (!input || !input.trim()) return null;
    if (parseSwapCommand(input)) return null;

    return 'Invalid format. Try: "swap [amount] [token] for [token]"';
  }, [input, parseSwapCommand]);

  return (
    <div className="mb-4">
      <Input
        value={input}
        onChange={handleInputChange}
        onKeyPress={handleKeyPress}
        onBlur={handleBlur}
        placeholder={placeholderText}
        className="text-center font-mono text-sm"
      />
      {suggestionText && (
        <div className="mt-1 text-xs text-muted-foreground text-center">
          {suggestionText}
        </div>
      )}
      {errorText && (
        <div className="mt-1 text-xs text-destructive text-center">
          {errorText}
        </div>
      )}
    </div>
  );
};
