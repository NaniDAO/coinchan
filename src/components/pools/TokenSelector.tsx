import { memo, useMemo, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon, SearchIcon, Clock4, Check } from "lucide-react";
import { formatUnits, type Address } from "viem";

import { cn } from "@/lib/utils";
import { TokenImage } from "@/components/TokenImage";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { TokenMetadata } from "@/lib/pools";

/* -----------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------------*/
export const getTokenKey = (t: TokenMetadata) =>
  `${String(t.address).toLowerCase()}:${t.id.toString()}`;

/* -----------------------------------------------------------------------------
 * useRecentTokens hook
 * ---------------------------------------------------------------------------*/
const DEFAULT_STORAGE_KEY = "recent_tokens_v2";

function useRecentTokens(
  tokens: TokenMetadata[],
  storageKey = DEFAULT_STORAGE_KEY,
) {
  const [recentKeys, setRecentKeys] = useState<string[]>([]);

  const tokenMap = useMemo(() => {
    const m = new Map<string, TokenMetadata>();
    for (const t of tokens) m.set(getTokenKey(t), t);
    return m;
  }, [tokens]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setRecentKeys(parsed.slice(0, 4));
      }
    } catch {
      // ignore
    }
  }, [storageKey]);

  const persist = useCallback(
    (keys: string[]) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(keys.slice(0, 4)));
      } catch {
        // ignore
      }
    },
    [storageKey],
  );

  const addRecent = useCallback(
    (token: TokenMetadata) => {
      const key = getTokenKey(token);
      setRecentKeys((prev) => {
        const next = [key, ...prev.filter((k) => k !== key)].slice(0, 4);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const recentTokens: TokenMetadata[] = useMemo(() => {
    const seen = new Set<string>();
    const list: TokenMetadata[] = [];
    for (const k of recentKeys) {
      const t = tokenMap.get(k);
      if (t && !seen.has(k)) {
        seen.add(k);
        list.push(t);
      }
    }
    return list;
  }, [recentKeys, tokenMap]);

  return { recentTokens, addRecent };
}

/* -----------------------------------------------------------------------------
 * TokenSelector Component (TokenMetadata)
 * ---------------------------------------------------------------------------*/
export const TokenSelector = memo(
  ({
    selectedToken,
    tokens,
    onSelect,
    className,
  }: {
    selectedToken: TokenMetadata;
    tokens: TokenMetadata[];
    onSelect: (token: TokenMetadata) => void;
    className?: string;
  }) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    const { recentTokens, addRecent } = useRecentTokens(tokens);

    const isDisabled = tokens.length <= 1;

    const handleSelect = (token: TokenMetadata) => {
      onSelect(token);
      addRecent(token);
      setOpen(false);
    };

    const formatBalance = (token: TokenMetadata) => {
      try {
        if (token.balance === 0n) return "0";
        const val = Number(formatUnits(token.balance, token.decimals));
        if (val === 0) return "0";
        if (val >= 1000) return `${Math.floor(val).toLocaleString()}`;
        if (val >= 1) return val.toFixed(3);
        if (val >= 0.001) return val.toFixed(4);
        if (val >= 0.0001) return val.toFixed(6);
        if (val > 0) return val.toExponential(2);
        return "0";
      } catch {
        return "0";
      }
    };

    const items = useMemo(
      () =>
        tokens.map((t) => ({
          token: t,
          balance: formatBalance(t),
          key: getTokenKey(t),
          isSelected:
            t.id === selectedToken?.id &&
            String(t.address).toLowerCase() ===
              String(selectedToken?.address).toLowerCase(),
        })),
      [tokens, selectedToken?.id, selectedToken?.address],
    );

    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return items;
      return items.filter(({ token }) => {
        const symbol = token.symbol?.toLowerCase() ?? "";
        const name = token.name?.toLowerCase() ?? "";
        const idStr = token.id?.toString() ?? "";
        const addr = String(token.address).toLowerCase();
        const queryIsNumber = !Number.isNaN(Number(q));
        const idMatches = queryIsNumber
          ? idStr.startsWith(q)
          : idStr.includes(q);
        return (
          symbol.includes(q) ||
          name.includes(q) ||
          idMatches ||
          addr.includes(q)
        );
      });
    }, [items, query]);

    return (
      <div className={cn("relative", className)}>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              aria-haspopup="listbox"
              aria-expanded={open}
              className={cn(
                "h-11 w-full rounded-xl px-3 pr-2 gap-2",
                "items-center justify-between",
                "bg-background/60",
                "focus-visible:ring-2 focus-visible:ring-primary/50",
                isDisabled && "pointer-events-none opacity-70",
              )}
              disabled={isDisabled}
            >
              <span className="flex items-center gap-2 truncate">
                <TokenImage
                  imageUrl={selectedToken.imageUrl}
                  symbol={selectedToken.symbol}
                />
                <span className="text-sm font-medium leading-none truncate">
                  {selectedToken.symbol}
                </span>
                <span className="ml-2 text-[11px] text-muted-foreground tabular-nums">
                  {formatBalance(selectedToken)}
                </span>
              </span>
              <ChevronDownIcon
                className={cn(
                  "ml-auto h-4 w-4 transition-transform duration-200",
                  open && "rotate-180",
                )}
              />
            </Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl border border-border shadow-2xl">
            <DialogHeader className="px-4 pt-4 pb-2">
              <DialogTitle className="text-base">
                {t("tokenSelector.select_token", {
                  defaultValue: "Select a token",
                })}
              </DialogTitle>
            </DialogHeader>

            {/* Keep ALL cmdk parts inside <Command> so context exists */}
            <Command className="px-0">
              {/* Sticky search + recents */}
              <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur-sm">
                <div className="px-4 pb-3 border-b">
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <CommandInput
                      placeholder={t("tokenSelector.search_tokens", {
                        defaultValue: "Search coins by name, address, or ID",
                      })}
                      className={cn("pl-9 h-10 rounded-none")}
                      value={query}
                      onValueChange={setQuery}
                    />
                  </div>

                  {/* Recency row */}
                  {recentTokens.length > 0 && (
                    <div className="mt-3">
                      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock4 className="h-3.5 w-3.5" />
                        <span>
                          {t("tokenSelector.recent", {
                            defaultValue: "Recent",
                          })}
                        </span>
                      </div>
                      <div className="flex gap-2 overflow-x-auto py-1">
                        {recentTokens.map((tkn) => (
                          <button
                            key={getTokenKey(tkn)}
                            onClick={() => handleSelect(tkn)}
                            className={cn(
                              "flex items-center gap-2 px-2 py-1 rounded-xl",
                              "bg-muted hover:bg-accent transition-colors shrink-0",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                            )}
                            aria-label={`Select ${tkn.symbol}`}
                          >
                            <TokenImage
                              imageUrl={tkn.imageUrl}
                              symbol={tkn.symbol}
                            />
                            <span className="text-xs font-medium">
                              {tkn.symbol}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Let CommandList handle its own scrolling */}
              <CommandList className="max-h-[60vh] sm:max-h-[50vh] overflow-y-auto">
                <CommandEmpty className="py-10 text-center text-sm text-muted-foreground">
                  {t("tokenSelector.no_results", {
                    defaultValue: "No tokens found",
                  })}
                </CommandEmpty>

                <CommandGroup className="px-0">
                  {filtered.map(({ token, balance, key, isSelected }) => (
                    <CommandItem
                      key={key}
                      value={`${token.symbol} ${token.name} ${token.id} ${String(token.address)}`}
                      onSelect={() => handleSelect(token)}
                      className={cn(
                        "px-3 py-2 rounded-lg mx-2",
                        "data-[selected=true]:bg-accent/70 hover:bg-accent",
                        isSelected && "bg-muted",
                      )}
                    >
                      <div className="flex w-full items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <TokenImage
                            imageUrl={token.imageUrl}
                            symbol={token.symbol}
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium truncate">
                              {token.symbol}
                            </span>
                            <span className="text-xs text-muted-foreground truncate">
                              {token.name}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right min-w-[72px]">
                            <div className="text-sm font-medium h-[18px] tabular-nums">
                              {balance}
                            </div>
                          </div>
                          {isSelected && (
                            <Check
                              className="h-4 w-4 text-primary"
                              aria-hidden
                            />
                          )}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
              <div className="p-6 text-muted-foreground text-xs text-center">
                <p>{selectedToken.description}</p>
              </div>
            </Command>
          </DialogContent>
        </Dialog>
      </div>
    );
  },
  (prev, next) =>
    prev.selectedToken.id === next.selectedToken.id &&
    String(prev.selectedToken.address).toLowerCase() ===
      String(next.selectedToken.address).toLowerCase() &&
    prev.selectedToken.balance === next.selectedToken.balance &&
    prev.tokens.length === next.tokens.length,
);
