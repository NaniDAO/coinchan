import { TokenMeta, USDT_ADDRESS } from "@/lib/coins";
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits } from "viem";
import { TokenImage } from "./TokenImage";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, SearchIcon } from "lucide-react";

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
    const selectedValue = selectedToken.id?.toString() ?? "eth";

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
            "token-selector-hover flex items-center gap-2 cursor-pointer px-2 py-1 touch-manipulation",
            className,
          )}
          style={{
            fontFamily: 'var(--font-body)',
            color: 'var(--terminal-black)',
            borderRadius: '0px'
          }}
        >
          <TokenImage token={selectedToken} />
          <div className="flex flex-col">
            <div className="flex items-center gap-1">
              <span className="font-medium">{selectedToken.symbol}</span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className={`text-xs font-medium text-muted-foreground min-w-[50px] h-[14px] ${
                  // Add loading class for better visual feedback
                  (selectedToken.id === null && isEthBalanceFetching) || selectedToken.isFetching
                    ? "token-loading px-1 rounded bg-transparent"
                    : ""
                }`}
              >
                {formatBalance(selectedToken)}
                {/* Show loading indicator for ETH */}
                {selectedToken.id === null && isEthBalanceFetching && (
                  <span className="text-xs text-primary ml-1 inline-block" style={{ animation: "pulse 1.5s infinite" }}>
                    ⟳
                  </span>
                )}
                {/* Show loading indicator for other tokens */}
                {selectedToken.id !== null && selectedToken.isFetching && (
                  <span className="text-xs text-primary ml-1 inline-block" style={{ animation: "pulse 1.5s infinite" }}>
                    ⟳
                  </span>
                )}
              </div>
            </div>
          </div>
          <ChevronDownIcon className="w-4 h-4 ml-1" />
        </div>

        {/* Dropdown list with thumbnails */}
        {isOpen && (
          <div
            className="absolute z-20 mt-1 w-[calc(100vw-40px)] sm:w-64 max-h-[60vh] sm:max-h-96 overflow-y-auto border-2 border-solid"
            style={{ 
              contain: "content",
              background: 'var(--terminal-white)',
              borderColor: 'var(--terminal-black)',
              boxShadow: '4px 4px 0 var(--terminal-black)',
              borderRadius: '0px'
            }}
          >
            {/* Search input */}
            <div className="sticky top-0 p-2" style={{ 
              background: 'var(--terminal-gray)',
              borderBottom: '2px solid var(--terminal-black)'
            }}>
              <div className="relative">
                <input
                  type="text"
                  placeholder={t("tokenSelector.search_tokens")}
                  onChange={(e) => {
                    // Use memo version for faster search - throttle search for better performance
                    const query = e.target.value.toLowerCase();

                    // Check for special searches (USDT, Tether, Stable)
                    const isStableSearch =
                      query === "usdt" || query === "tether" || query.includes("stable") || query.includes("usd");

                    // Debounce the search with requestAnimationFrame for better performance
                    const w = window as any; // Type assertion for the debounce property
                    if (w.searchDebounce) {
                      cancelAnimationFrame(w.searchDebounce);
                    }

                    w.searchDebounce = requestAnimationFrame(() => {
                      // Get all token items by data attribute - limit to visible ones first
                      const visibleItems = document.querySelectorAll("[data-token-symbol]:not(.hidden)");
                      const allItems = document.querySelectorAll("[data-token-symbol]");

                      // Special case: If searching for stablecoins, make sure USDT is visible
                      if (isStableSearch) {
                        const usdtItem = document.querySelector("[data-token-symbol='USDT']");
                        if (usdtItem) {
                          usdtItem.classList.remove("hidden");
                        }
                      }

                      // Only query all items if no visible items match
                      const itemsToSearch = visibleItems.length > 0 ? visibleItems : allItems;

                      // Use more efficient iteration
                      const itemsArray = Array.from(itemsToSearch);
                      let anyVisible = false;

                      // First pass - show matches
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

                      // For USDT searches, ensure we always check for USDT even if no visible items match
                      if (isStableSearch && !anyVisible) {
                        const usdtItem = document.querySelector("[data-token-symbol='USDT']");
                        if (usdtItem) {
                          usdtItem.classList.remove("hidden");
                          anyVisible = true;
                        }
                      }

                      // If nothing is visible with current search, try again with all items
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
                  className="input-field w-full pl-8"
                  style={{ 
                    fontSize: '14px',
                    fontFamily: 'var(--font-body)'
                  }}
                />
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground dark:text-gray-400" />
              </div>
            </div>

            {/* Pre-compute token list items for better performance with content visibility optimization */}
            <div
              className="virtualized-token-list"
              style={{
                contentVisibility: "auto",
                containIntrinsicSize: "0 5000px",
                contain: "content",
              }}
            >
              {tokens.map((token) => {
                const isSelected =
                  (token.id === null && selectedValue === "eth") ||
                  (token.id !== null && token.id.toString() === selectedValue);

                // Memoize reserve formatting to improve performance
                const formatReserves = (token: TokenMeta) => {
                  if (token.id === null) return "";

                  // Cache key for this computation
                  const cacheKey = `reserve-format-${token.id}`;
                  try {
                    const cached = sessionStorage.getItem(cacheKey);
                    if (cached) return cached;
                  } catch (e) {
                    // Ignore storage errors
                  }

                  // Format the custom fee if available (as percentage)
                  const feePercentage = token.swapFee ? Number(token.swapFee) / 100 : 1; // Default is 1%

                  // Format fee: For 0.3% (USDT), display it without trailing zeros
                  // For integer percentages like 1%, show without decimal places
                  let feeStr;
                  if (feePercentage % 1 === 0) {
                    // Integer percentage (e.g., 1%)
                    feeStr = `${feePercentage.toFixed(0)}%`;
                  } else if ((feePercentage * 10) % 1 === 0) {
                    // One decimal place needed (e.g., 0.3%)
                    feeStr = `${feePercentage.toFixed(1)}%`;
                  } else {
                    // Two decimal places (e.g., 0.25%)
                    feeStr = `${feePercentage.toFixed(2)}%`;
                  }

                  // Handle special case for USDT (6 decimals)
                  const tokenDecimals = token.decimals || 18;

                  // If no liquidity data available or zero liquidity
                  if (!token.liquidity || token.liquidity === 0n) {
                    // Fall back to reserves if available
                    if (token.reserve0 && token.reserve0 > 0n) {
                      // Format ETH reserves to a readable format
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
                      } catch (e) {
                        // Ignore storage errors
                      }
                      return result;
                    }

                    const result = `No liquidity • ${feeStr}`;
                    try {
                      sessionStorage.setItem(cacheKey, result);
                    } catch (e) {
                      // Ignore storage errors
                    }
                    return result;
                  }

                  // Format the reserves
                  // For custom pools like USDT-ETH, format differently
                  let reserveStr = "";

                  if (token.isCustomPool) {
                    // Show both reserves
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

                    // For USDT-ETH pool, format reserves with more clarity
                    if (token.token1 === USDT_ADDRESS) {
                      reserveStr = `${ethStr} • ${tokenStr} • ${feeStr}`;
                    } else {
                      reserveStr = `${ethStr} / ${tokenStr}`;
                    }
                  } else {
                    // Regular token pools
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
                        // Ignore storage errors
                        return result;
                      }
                    }
                  }

                  // If we have reserveStr, return the result with the fee
                  const result = `${reserveStr} • ${feeStr}`;
                  try {
                    sessionStorage.setItem(cacheKey, result);
                  } catch (e) {
                    // Ignore storage errors
                  }
                  return result;
                };

                const reserves = formatReserves(token);
                const balance = formatBalance(token);

                return (
                  <div
                    key={token.id?.toString() ?? "eth"}
                    onClick={() => handleSelect(token)}
                    data-token-symbol={token.symbol}
                    data-token-name={token.name}
                    data-token-id={token.id?.toString() ?? "eth"}
                    className={`flex items-center justify-between p-3 sm:p-2 cursor-pointer touch-manipulation ${
                      isSelected ? "" : ""
                    }`}
                    style={{
                      contentVisibility: "auto",
                      containIntrinsicSize: "0 50px",
                      fontFamily: 'var(--font-body)',
                      color: 'var(--foreground)',
                      background: isSelected ? 'var(--muted)' : 'transparent',
                      transition: 'all 0.1s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'var(--muted)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <TokenImage token={token} />
                      <div className="flex flex-col">
                        <span className="font-medium">{token.symbol}</span>
                        {reserves && <span className="text-xs text-muted-foreground dark:text-gray-400">{reserves}</span>}
                      </div>
                    </div>
                    <div className="text-right min-w-[60px]">
                      <div
                        className={`text-sm font-medium h-[18px] text-foreground ${
                          // Add loading class when ETH is loading or this specific token is loading
                          (token.id === null && isEthBalanceFetching) || token.isFetching
                            ? "token-loading px-1 bg-transparent"
                            : ""
                        }`}
                      >
                        {balance}
                        {/* Show loading indicator for ETH */}
                        {token.id === null && isEthBalanceFetching && (
                          <span
                            className="text-xs text-primary ml-1 inline-block"
                            style={{ animation: "pulse 1.5s infinite" }}
                          >
                            ⟳
                          </span>
                        )}
                        {/* Show loading indicator for any token that's being updated */}
                        {token.id !== null && token.isFetching && (
                          <span
                            className="text-xs text-primary ml-1 inline-block"
                            style={{ animation: "pulse 1.5s infinite" }}
                          >
                            ⟳
                          </span>
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
    // Custom comparison function to prevent unnecessary re-renders
    // Only re-render if token identity or selection state changes
    return (
      prevProps.selectedToken.id === nextProps.selectedToken.id &&
      prevProps.selectedToken.balance === nextProps.selectedToken.balance &&
      prevProps.tokens.length === nextProps.tokens.length &&
      prevProps.isEthBalanceFetching === nextProps.isEthBalanceFetching
    );
  },
);
