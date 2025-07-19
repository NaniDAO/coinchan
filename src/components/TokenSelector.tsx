import { type TokenMeta, USDT_ADDRESS } from "@/lib/coins";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, SearchIcon } from "lucide-react";
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits } from "viem";
import { TokenImage } from "./TokenImage";

export const TokenSelector = memo(
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

    // Handle selection change
    const handleSelect = (token: TokenMeta) => {
      onSelect(token);
      setIsOpen(false);
    };

    // Helper functions for formatting and display

    // Enhanced format token balance function with special handling for ETH
    const formatBalance = (token: TokenMeta) => {
      if (token.balance === undefined) {
        // For ETH specifically, always show 0 rather than blank
        return token.id === null ? "0" : "";
      }

      if (token.balance === 0n) return "0";

      try {
        // Special case for ETH
        if (token.id === null) {
          // Convert ETH balance to string first for precise formatting
          const ethBalanceStr = formatEther(token.balance);
          const ethValue = Number(ethBalanceStr);

          if (ethValue === 0) return "0"; // If somehow zero after conversion

          // Display ETH with appropriate precision based on size
          if (ethValue >= 1000) {
            return `${Math.floor(ethValue).toLocaleString()}`;
          } else if (ethValue >= 1) {
            return ethValue.toFixed(4); // Show 4 decimals for values ≥ 1
          } else if (ethValue >= 0.001) {
            return ethValue.toFixed(6); // Show 6 decimals for medium values
          } else if (ethValue >= 0.0000001) {
            // For very small values, use 8 decimals (typical for ETH)
            return ethValue.toFixed(8);
          } else {
            // For extremely small values, use readable scientific notation
            const scientificNotation = ethValue.toExponential(4);
            return scientificNotation;
          }
        }

        // For regular tokens
        // Use correct decimals for the token (default to 18)
        const decimals = token.decimals || 18;
        const tokenValue = Number(formatUnits(token.balance, decimals));

        if (tokenValue >= 1000) {
          return `${Math.floor(tokenValue).toLocaleString()}`;
        } else if (tokenValue >= 1) {
          return tokenValue.toFixed(3); // 3 decimals for ≥ 1
        } else if (tokenValue >= 0.001) {
          return tokenValue.toFixed(4); // 4 decimals for smaller values
        } else if (tokenValue >= 0.0001) {
          return tokenValue.toFixed(6); // 6 decimals for tiny values
        } else if (tokenValue > 0) {
          return tokenValue.toExponential(2); // Scientific notation for extremely small
        }

        return "0";
      } catch (error) {
        // Error formatting balance
        return token.id === null ? "0" : ""; // Always return 0 for ETH on error
      }
    };

    return (
      <div className="relative">
        {/* Selected token display with thumbnail */}
        <div
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "z-10 hover:bg-muted flex items-center gap-2 cursor-pointer px-2 py-1 touch-manipulation border border-border transition-colors",
            className,
          )}
        >
          <TokenImage token={selectedToken} />
          <div className="flex flex-col">
            <div className="flex items-center gap-1">
              <span className="font-medium">{selectedToken.symbol}</span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className={`text-xs font-medium text-muted-foreground min-w-[50px] h-[14px] ${
                  (selectedToken.id === null && isEthBalanceFetching) || selectedToken.isFetching
                    ? "animate-pulse px-1 rounded bg-transparent"
                    : ""
                }`}
              >
                {formatBalance(selectedToken)}
                {selectedToken.id === null && isEthBalanceFetching && (
                  <span className="text-xs text-primary ml-1 inline-block animate-spin">⟳</span>
                )}
                {selectedToken.id !== null && selectedToken.isFetching && (
                  <span className="text-xs text-primary ml-1 inline-block animate-spin">⟳</span>
                )}
              </div>
            </div>
          </div>
          <ChevronDownIcon className="w-4 h-4 ml-1" />
        </div>

        {/* Dropdown list with thumbnails */}
        {isOpen && (
          <div className="absolute z-50 mt-1 w-[calc(100vw-40px)] sm:w-64 max-h-[60vh] sm:max-h-96 overflow-y-auto border-2 bg-background border-border">
            {/* Search input */}
            <div className="sticky top-0 p-2 bg-muted border-b-2 border-border">
              <div className="relative">
                <input
                  type="text"
                  placeholder={t("tokenSelector.search_tokens")}
                  onChange={(e) => {
                    const query = e.target.value.toLowerCase();
                    const isStableSearch =
                      query === "usdt" || query === "tether" || query.includes("stable") || query.includes("usd");

                    const w = window as any;
                    if (w.searchDebounce) {
                      cancelAnimationFrame(w.searchDebounce);
                    }

                    w.searchDebounce = requestAnimationFrame(() => {
                      const visibleItems = document.querySelectorAll("[data-token-symbol]:not(.hidden)");
                      const allItems = document.querySelectorAll("[data-token-symbol]");

                      if (isStableSearch) {
                        const usdtItem = document.querySelector("[data-token-symbol='USDT']");
                        if (usdtItem) {
                          usdtItem.classList.remove("hidden");
                        }
                      }

                      const itemsToSearch = visibleItems.length > 0 ? visibleItems : allItems;
                      const itemsArray = Array.from(itemsToSearch);
                      let anyVisible = false;

                      for (let i = 0; i < itemsArray.length; i++) {
                        const item = itemsArray[i];
                        const symbol = item.getAttribute("data-token-symbol")?.toLowerCase() || "";
                        const name = item.getAttribute("data-token-name")?.toLowerCase() || "";
                        const id = item.getAttribute("data-token-id") || "";

                        if (symbol.includes(query) || name.includes(query) || id.toLowerCase().includes(query)) {
                          item.classList.remove("hidden");
                          anyVisible = true;
                        } else {
                          item.classList.add("hidden");
                        }
                      }

                      if (isStableSearch && !anyVisible) {
                        const usdtItem = document.querySelector("[data-token-symbol='USDT']");
                        if (usdtItem) {
                          usdtItem.classList.remove("hidden");
                          anyVisible = true;
                        }
                      }

                      if (!anyVisible && visibleItems.length > 0) {
                        const allItemsArray = Array.from(allItems);
                        for (let i = 0; i < allItemsArray.length; i++) {
                          const item = allItemsArray[i];
                          const symbol = item.getAttribute("data-token-symbol")?.toLowerCase() || "";
                          const name = item.getAttribute("data-token-name")?.toLowerCase() || "";
                          const id = item.getAttribute("data-token-id") || "";

                          if (symbol.includes(query) || name.includes(query) || id.toLowerCase().includes(query)) {
                            item.classList.remove("hidden");
                          } else {
                            item.classList.add("hidden");
                          }
                        }
                      }
                    });
                  }}
                  className="w-full pl-8 border-2 border-border p-2 bg-background"
                />
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
            </div>

            <div className="bg-background z-10 content-visibility-auto intrinsic-h-[5000px] contain-content">
              {tokens.map((token) => {
                const isSelected = token.id === selectedToken?.id && token.poolId === selectedToken?.poolId;

                const formatReserves = (token: TokenMeta) => {
                  if (token.id === null) return "";

                  const cacheKey = `reserve-format-${token.id}-${token.poolId}`;

                  try {
                    const cached = sessionStorage.getItem(cacheKey);
                    if (cached) return cached;
                  } catch (e) {}

                  const feePercentage = token.swapFee ? Number(token.swapFee) / 10000 : 1;

                  let feeStr;
                  if (feePercentage % 1 === 0) {
                    feeStr = `${feePercentage.toFixed(0)}%`;
                  } else if ((feePercentage * 10) % 1 === 0) {
                    feeStr = `${feePercentage.toFixed(1)}%`;
                  } else {
                    feeStr = `${feePercentage.toFixed(2)}%`;
                  }

                  const tokenDecimals = token.decimals || 18;

                  if (!token.liquidity || token.liquidity === 0n) {
                    if (token.reserve0 && token.reserve0 > 0n) {
                      const ethValue = Number(formatEther(token.reserve0));
                      let reserveStr = "";

                      if (ethValue >= 1000) {
                        reserveStr = `${Math.floor(ethValue).toLocaleString()} ETH`;
                      } else if (ethValue >= 1.0) {
                        reserveStr = `${ethValue.toFixed(3)} ETH`;
                      } else if (ethValue >= 0.001) {
                        reserveStr = `${ethValue.toFixed(4)} ETH`;
                      } else if (ethValue >= 0.0001) {
                        reserveStr = `${ethValue.toFixed(6)} ETH`;
                      } else if (ethValue > 0) {
                        reserveStr = `${ethValue.toFixed(8)} ETH`;
                      }

                      const result = `${reserveStr} • ${feeStr}`;
                      try {
                        sessionStorage.setItem(cacheKey, result);
                      } catch (e) {}
                      return result;
                    }

                    const result = `No liquidity • ${feeStr}`;
                    try {
                      sessionStorage.setItem(cacheKey, result);
                    } catch (e) {}
                    return result;
                  }

                  let reserveStr = "";

                  if (token.isCustomPool) {
                    const ethReserveValue = Number(formatEther(token.reserve0 || 0n));
                    const tokenReserveValue = Number(formatUnits(token.reserve1 || 0n, tokenDecimals));

                    let ethStr = "";
                    if (ethReserveValue >= 10000) {
                      ethStr = `${Math.floor(ethReserveValue / 1000)}K ETH`;
                    } else if (ethReserveValue >= 1000) {
                      ethStr = `${(ethReserveValue / 1000).toFixed(1)}K ETH`;
                    } else if (ethReserveValue >= 1.0) {
                      ethStr = `${ethReserveValue.toFixed(2)} ETH`;
                    } else if (ethReserveValue > 0) {
                      ethStr = `${ethReserveValue.toFixed(4)} ETH`;
                    }

                    let tokenStr = "";
                    if (tokenReserveValue >= 1000000) {
                      tokenStr = `${Math.floor(tokenReserveValue / 1000000)}M ${token.symbol}`;
                    } else if (tokenReserveValue >= 1000) {
                      tokenStr = `${Math.floor(tokenReserveValue / 1000)}K ${token.symbol}`;
                    } else {
                      tokenStr = `${tokenReserveValue.toFixed(2)} ${token.symbol}`;
                    }

                    if (token.token1 === USDT_ADDRESS) {
                      reserveStr = `${ethStr} • ${tokenStr} • ${feeStr}`;
                    } else {
                      reserveStr = `${ethStr} / ${tokenStr}`;
                    }
                  } else {
                    const ethReserveValue = Number(formatEther(token.reserve0 || 0n));

                    if (ethReserveValue >= 10000) {
                      reserveStr = `${Math.floor(ethReserveValue / 1000)}K ETH`;
                    } else if (ethReserveValue >= 1000) {
                      reserveStr = `${(ethReserveValue / 1000).toFixed(1)}K ETH`;
                    } else if (ethReserveValue >= 1.0) {
                      reserveStr = `${ethReserveValue.toFixed(2)} ETH`;
                    } else if (ethReserveValue >= 0.001) {
                      reserveStr = `${ethReserveValue.toFixed(4)} ETH`;
                    } else if (ethReserveValue > 0) {
                      reserveStr = `${ethReserveValue.toFixed(6)} ETH`;
                    } else {
                      const result = `No ETH reserves • ${feeStr}`;
                      try {
                        sessionStorage.setItem(cacheKey, result);
                        return result;
                      } catch (e) {
                        return result;
                      }
                    }
                  }

                  const result = `${reserveStr} • ${feeStr}`;
                  try {
                    sessionStorage.setItem(cacheKey, result);
                  } catch (e) {}
                  return result;
                };

                const reserves = formatReserves(token);
                const balance = formatBalance(token);

                return (
                  <div
                    key={`${token?.id?.toString() ?? "eth"}-${token?.poolId?.toString() ?? "default"}`}
                    onClick={() => handleSelect(token)}
                    data-token-symbol={token.symbol}
                    data-token-name={token.name}
                    data-token-id={token.id?.toString() ?? "eth"}
                    className={cn(
                      "flex items-center justify-between p-3 sm:p-2 cursor-pointer touch-manipulation transition-colors content-visibility-auto contain-[50px]",
                      isSelected ? "bg-muted" : "hover:bg-muted",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <TokenImage token={token} />
                      <div className="flex flex-col">
                        <span className="font-medium">{token.symbol}</span>
                        {reserves && <span className="text-xs text-muted-foreground">{reserves}</span>}
                      </div>
                    </div>
                    <div className="text-right min-w-[60px]">
                      <div
                        className={cn(
                          "text-sm font-medium h-[18px] text-foreground",
                          (token.id === null && isEthBalanceFetching) || token.isFetching
                            ? "animate-pulse px-1 bg-transparent"
                            : "",
                        )}
                      >
                        {balance}
                        {token.id === null && isEthBalanceFetching && (
                          <span className="text-xs text-primary ml-1 inline-block animate-spin">⟳</span>
                        )}
                        {token.id !== null && token.isFetching && (
                          <span className="text-xs text-primary ml-1 inline-block animate-spin">⟳</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.selectedToken.id === nextProps.selectedToken.id &&
      prevProps.selectedToken.balance === nextProps.selectedToken.balance &&
      prevProps.tokens.length === nextProps.tokens.length &&
      prevProps.isEthBalanceFetching === nextProps.isEthBalanceFetching
    );
  },
);
