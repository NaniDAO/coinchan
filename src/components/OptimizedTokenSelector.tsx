import { type TokenMeta } from "@/lib/coins";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, SearchIcon } from "lucide-react";
import { memo, useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits } from "viem";
import { TokenImage } from "./TokenImage";
// Virtual scrolling implementation without external dependency

// Constants for future use
// const ITEM_HEIGHT = 60;
// const MAX_HEIGHT = 400;

export const OptimizedTokenSelector = memo(
  ({
    selectedToken,
    tokens,
    onSelect,
    isEthBalanceFetching = false,
    className,
  }: {
    selectedToken: TokenMeta;
    tokens: TokenMeta[];
    onSelect: (token: TokenMeta) => void;
    isEthBalanceFetching?: boolean;
    className?: string;
  }) => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    // Filter and sort tokens
    const filteredTokens = useMemo(() => {
      let filtered = tokens;

      // Apply search filter
      if (searchTerm.trim()) {
        const search = searchTerm.toLowerCase();
        filtered = tokens.filter(
          (token) =>
            token.name.toLowerCase().includes(search) ||
            token.symbol.toLowerCase().includes(search) ||
            token.id?.toString().includes(search),
        );
      }

      // Sort by: ETH first, then by balance (highest first), then by liquidity
      return filtered.sort((a, b) => {
        // ETH always first
        if (a.id === null) return -1;
        if (b.id === null) return 1;

        // Sort by balance if both have balance
        if (a.balance && b.balance) {
          const aBalance = Number(formatUnits(a.balance, a.decimals || 18));
          const bBalance = Number(formatUnits(b.balance, b.decimals || 18));
          if (aBalance !== bBalance) {
            return bBalance - aBalance;
          }
        }

        // Sort by liquidity
        const aLiquidity = a.reserve0 ? Number(a.reserve0) : 0;
        const bLiquidity = b.reserve0 ? Number(b.reserve0) : 0;
        if (aLiquidity !== bLiquidity) {
          return bLiquidity - aLiquidity;
        }

        // Finally sort by token ID
        return Number(b.id) - Number(a.id);
      });
    }, [tokens, searchTerm]);

    // Handle selection
    const handleSelect = useCallback(
      (token: TokenMeta) => {
        onSelect(token);
        setIsOpen(false);
        setSearchTerm("");
      },
      [onSelect],
    );

    // Format balance with caching
    const formatBalance = useCallback((token: TokenMeta) => {
      const cacheKey = `balance-${token.id}-${token.balance}`;

      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) return cached;
      } catch (e) {
        // Ignore storage errors
      }

      let result = "";

      if (token.balance === undefined) {
        result = token.id === null ? "0" : "";
      } else if (token.balance === 0n) {
        result = "0";
      } else {
        try {
          if (token.id === null) {
            // ETH formatting
            const ethValue = Number(formatEther(token.balance));
            if (ethValue >= 1000) {
              result = `${Math.floor(ethValue).toLocaleString()}`;
            } else if (ethValue >= 1) {
              result = ethValue.toFixed(3);
            } else if (ethValue >= 0.001) {
              result = ethValue.toFixed(4);
            } else if (ethValue >= 0.0001) {
              result = ethValue.toFixed(6);
            } else if (ethValue > 0) {
              result = ethValue.toExponential(2);
            } else {
              result = "0";
            }
          } else {
            // Token formatting
            const tokenValue = Number(
              formatUnits(token.balance, token.decimals || 18),
            );
            if (tokenValue >= 1000) {
              result = `${Math.floor(tokenValue).toLocaleString()}`;
            } else if (tokenValue >= 1) {
              result = tokenValue.toFixed(3);
            } else if (tokenValue >= 0.001) {
              result = tokenValue.toFixed(4);
            } else if (tokenValue >= 0.0001) {
              result = tokenValue.toFixed(6);
            } else if (tokenValue > 0) {
              result = tokenValue.toExponential(2);
            } else {
              result = "0";
            }
          }
        } catch (error) {
          result = "0";
        }
      }

      // Cache the result
      try {
        sessionStorage.setItem(cacheKey, result);
      } catch (e) {
        // Ignore storage errors
      }

      return result;
    }, []);

    // Limit visible tokens to improve performance
    const visibleTokens = filteredTokens.slice(0, 50); // Show max 50 tokens

    return (
      <div className={cn("relative", className)}>
        {/* Selected token display */}
        <button
          type="button"
          className="flex items-center justify-between w-full p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="flex items-center space-x-3">
            <TokenImage
              imageUrl={selectedToken.imageUrl}
              symbol={selectedToken.symbol}
            />
            <div className="text-left">
              <div className="font-medium">{selectedToken.symbol}</div>
              <div className="text-sm text-gray-500">{selectedToken.name}</div>
            </div>
          </div>
          <ChevronDownIcon
            className={cn(
              "h-5 w-5 text-gray-400 transition-transform duration-200",
              isOpen && "rotate-180",
            )}
          />
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg">
            {/* Search input */}
            <div className="p-3 border-b border-gray-200 dark:border-gray-700">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={t("common.search")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Token list */}
            <div className="max-h-96 overflow-y-auto">
              {visibleTokens.length > 0 ? (
                visibleTokens.map((token) => {
                  const balance = formatBalance(token);
                  const isLoading = isEthBalanceFetching && token.id === null;

                  return (
                    <div
                      key={token.id?.toString() || "eth"}
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 border-b last:border-b-0"
                      onClick={() => handleSelect(token)}
                    >
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <TokenImage
                          imageUrl={token.imageUrl}
                          symbol={token.symbol}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {token.symbol}
                          </div>
                          <div className="text-xs text-gray-500 truncate">
                            {token.name}
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {isLoading ? (
                          <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-16 rounded" />
                        ) : (
                          <div className="font-mono text-sm">{balance}</div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-4 text-center text-gray-500">
                  {t("common.no_results")}
                </div>
              )}
              {filteredTokens.length > 50 && (
                <div className="p-3 text-center text-sm text-gray-500 bg-gray-50 dark:bg-gray-700">
                  {t("common.showing")} 50 {t("common.of")}{" "}
                  {filteredTokens.length} {t("common.results")}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Backdrop to close dropdown */}
        {isOpen && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
        )}
      </div>
    );
  },
);

OptimizedTokenSelector.displayName = "OptimizedTokenSelector";
