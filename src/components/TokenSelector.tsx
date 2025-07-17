import { type TokenMeta, USDT_ADDRESS } from "@/lib/coins";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, SearchIcon, CheckIcon } from "lucide-react";
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits, isAddress } from "viem";
import { TokenImage } from "./TokenImage";

export const TokenSelector = memo(
  ({
    selectedToken,
    tokens,
    onSelect,
    isEthBalanceFetching = false,
    className,
    showErc20Input = false,
    onErc20TokenCreate,
  }: {
    selectedToken: TokenMeta;
    tokens: TokenMeta[];
    onSelect: (token: TokenMeta) => void;
    isEthBalanceFetching?: boolean;
    className?: string;
    showErc20Input?: boolean;
    onErc20TokenCreate?: (address: string) => void;
  }) => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [showErc20Mode, setShowErc20Mode] = useState(false);
    const [erc20Address, setErc20Address] = useState("");

    // Handle selection change
    const handleSelect = (token: TokenMeta) => {
      onSelect(token);
      setIsOpen(false);
    };

    // Handle ERC20 token creation or search
    const handleErc20Submit = () => {
      if (erc20Address && onErc20TokenCreate) {
        onErc20TokenCreate(erc20Address);
        setShowErc20Mode(false);
        setErc20Address("");
        setIsOpen(false);
      }
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
          <div className="absolute z-50 mt-1 w-[calc(100vw-40px)] sm:w-80 lg:w-96 max-h-[60vh] sm:max-h-96 overflow-y-auto border border-border rounded-lg bg-background shadow-lg">
            {/* Search input */}
            <div className="sticky top-0 p-3 bg-muted border-b border-border">
              {showErc20Input && (
                <div className={cn("space-y-2", !showErc20Mode && "mb-3")}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Token Type</span>
                    <div className="flex items-center gap-1 p-1 bg-muted rounded-lg border border-border">
                      <button
                        onClick={() => setShowErc20Mode(false)}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200",
                          !showErc20Mode 
                            ? "bg-background text-foreground shadow-sm" 
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        🪙 Coins
                      </button>
                      <button
                        onClick={() => setShowErc20Mode(true)}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200",
                          showErc20Mode 
                            ? "bg-background text-foreground shadow-sm" 
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        📄 ERC20
                      </button>
                    </div>
                  </div>
                  {showErc20Mode && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Token Search
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Enter address (0x...) or search by name/symbol"
                            value={erc20Address}
                            onChange={(e) => setErc20Address(e.target.value)}
                            className="w-full px-4 py-3 pr-12 border border-border rounded-xl bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 hover:border-primary/50"
                          />
                          {erc20Address && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                              {isAddress(erc20Address) ? (
                                <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shadow-sm">
                                  <CheckIcon className="w-4 h-4 text-white" />
                                </div>
                              ) : (
                                <SearchIcon className="w-4 h-4 text-muted-foreground" />
                              )}
                            </div>
                          )}
                        </div>
                        {erc20Address && !isAddress(erc20Address) && (
                          <p className="text-xs text-muted-foreground mt-1">Searching by name/symbol...</p>
                        )}
                      </div>
                      <button
                        onClick={handleErc20Submit}
                        disabled={!erc20Address}
                        className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-all duration-200 active:scale-[0.98] shadow-sm hover:shadow-md"
                      >
                        <span className="flex items-center justify-center gap-2">
                          {isAddress(erc20Address) && (
                            <CheckIcon className="w-4 h-4" />
                          )}
                          {isAddress(erc20Address) ? 'Add Token' : 'Search Token'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}
              {!showErc20Mode && (
                <div className="relative">
                  <input
                    type="text"
                    placeholder={t("tokenSelector.search_tokens")}
                    title="Search tokens by name, symbol, or ID"
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
                    className="w-full pl-8 pr-3 py-2.5 border border-border rounded-lg bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  />
                  <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                </div>
              )}
            </div>

            <div className="bg-background z-10 content-visibility-auto intrinsic-h-[5000px] contain-content">
              {showErc20Mode ? (
                <div className="p-6 space-y-4">
                  <div className="text-center space-y-3">
                    <div className="flex items-center justify-center w-16 h-16 mx-auto bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl">
                      <span className="text-2xl">🪙</span>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-base font-semibold text-foreground">Add Custom Token</h3>
                      <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                        Enter any ERC20 token contract address to create a trading pool. Token details will be fetched automatically.
                      </p>
                    </div>
                  </div>
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/10 dark:to-orange-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mt-0.5">
                        <span className="text-amber-600 dark:text-amber-400 text-sm">⚠️</span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Safety First</p>
                        <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                          Only use contract addresses from trusted sources. Verify the token details before trading.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                tokens.map((token) => {
                const isSelected = token.id === selectedToken?.id && token.poolId === selectedToken?.poolId;

                const formatReserves = (token: TokenMeta) => {
                  if (token.id === null) return "";

                  const cacheKey = `reserve-format-${token.id}-${token.poolId}`;

                  try {
                    const cached = sessionStorage.getItem(cacheKey);
                    if (cached) return cached;
                  } catch (e) {}

                  const feePercentage = token.swapFee ? Number(token.swapFee) / 100 : 1;

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
              })
              )}
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
