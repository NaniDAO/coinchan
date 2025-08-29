import { memo, useMemo, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon, SearchIcon, Clock4 } from "lucide-react";
import { formatEther, formatUnits } from "viem";

import { cn } from "@/lib/utils";
import { getCoinKey, type TokenMeta } from "@/lib/coins";
import { TokenImage } from "./TokenImage";

// shadcn/ui
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

/* -----------------------------------------------------------------------------
 * useRecentTokens hook
 * - Stores up to 4 recently selected tokens in localStorage as their coin keys.
 * - Derives current TokenMeta objects from the provided `tokens` list.
 * ---------------------------------------------------------------------------*/

const DEFAULT_STORAGE_KEY = "recent_tokens_v1";

function useRecentTokens(
  tokens: TokenMeta[],
  storageKey = DEFAULT_STORAGE_KEY,
) {
  const [recentKeys, setRecentKeys] = useState<string[]>([]);

  // Build a map for quick lookup from key -> TokenMeta
  const tokenMap = useMemo(() => {
    const m = new Map<string, TokenMeta>();
    for (const t of tokens) m.set(getCoinKey(t), t);
    return m;
  }, [tokens]);

  // Read from localStorage on mount (client-only)
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
    (token: TokenMeta) => {
      const key = getCoinKey(token);
      setRecentKeys((prev) => {
        const next = [key, ...prev.filter((k) => k !== key)].slice(0, 4);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  // Filter to only those keys that still exist in the current token list
  const recentTokens: TokenMeta[] = useMemo(() => {
    const seen = new Set<string>();
    const list: TokenMeta[] = [];
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
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    const { recentTokens, addRecent } = useRecentTokens(tokens);

    const isDisabled = tokens.length <= 1;

    const handleSelect = (token: TokenMeta) => {
      onSelect(token);
      addRecent(token); // <-- track recency
      setOpen(false);
    };

    const formatBalance = (token: TokenMeta) => {
      if (token.balance === undefined) return token.id === null ? "0" : "";
      if (token.balance === 0n) return "0";
      try {
        if (token.id === null) {
          const eth = Number(formatEther(token.balance));
          if (eth === 0) return "0";
          if (eth >= 1000) return `${Math.floor(eth).toLocaleString()}`;
          if (eth >= 1) return eth.toFixed(4);
          if (eth >= 0.001) return eth.toFixed(6);
          if (eth >= 0.0000001) return eth.toFixed(8);
          return eth.toExponential(4);
        }
        const decimals = token.decimals || 18;
        const val = Number(formatUnits(token.balance, decimals));
        if (val >= 1000) return `${Math.floor(val).toLocaleString()}`;
        if (val >= 1) return val.toFixed(3);
        if (val >= 0.001) return val.toFixed(4);
        if (val >= 0.0001) return val.toFixed(6);
        if (val > 0) return val.toExponential(2);
        return "0";
      } catch {
        return token.id === null ? "0" : "";
      }
    };

    const items = useMemo(
      () =>
        tokens.map((t) => ({
          token: t,
          balance: formatBalance(t),
          key: getCoinKey(t),
          isSelected:
            t.id === selectedToken?.id &&
            t.poolId === selectedToken?.poolId &&
            t?.token1 === selectedToken?.token1,
        })),
      [
        tokens,
        selectedToken?.id,
        selectedToken?.poolId,
        selectedToken?.token1,
        isEthBalanceFetching,
      ],
    );

    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return items;
      return items.filter(({ token }) => {
        const symbol = token.symbol?.toLowerCase() ?? "";
        const name = token.name?.toLowerCase() ?? "";
        const id = token.id?.toString() ?? "eth";
        const queryIsNumber = !isNaN(Number(q));
        const idMatches = queryIsNumber
          ? id.startsWith(q)
          : id.toLowerCase().includes(q);
        return symbol.includes(q) || name.includes(q) || idMatches;
      });
    }, [items, query]);

    return (
      <div className={cn("relative", className)}>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "h-11 px-3 pr-2 gap-2 items-center justify-between w-full sm:w-auto rounded-xl",
                isDisabled && "pointer-events-none opacity-70",
              )}
              disabled={isDisabled}
            >
              <span className="flex items-center gap-2">
                <TokenImage token={selectedToken} />
                <span className="text-sm font-medium leading-none">
                  {selectedToken.symbol}
                </span>
                <span className="ml-2 text-[11px] text-muted-foreground">
                  {formatBalance(selectedToken)}
                </span>
              </span>
              <ChevronDownIcon className="ml-auto h-4 w-4" />
            </Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl border border-border shadow-xl">
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
              <div className="px-4 pb-3 sticky top-0 bg-background z-10">
                <div className="relative">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <CommandInput
                    placeholder={t("tokenSelector.search_tokens", {
                      defaultValue: "Search tokens",
                    })}
                    className="pl-9 h-10"
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
                          key={getCoinKey(tkn)}
                          onClick={() => handleSelect(tkn)}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1 rounded-lg border border-border",
                            "hover:bg-accent transition-colors shrink-0",
                          )}
                          aria-label={`Select ${tkn.symbol}`}
                        >
                          <TokenImage token={tkn} />
                          <span className="text-xs font-medium">
                            {tkn.symbol}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Let CommandList handle its own scrolling */}
              <CommandList className="max-h-[60vh] sm:max-h-[50vh] overflow-y-auto">
                <CommandEmpty>
                  {t("tokenSelector.no_results", {
                    defaultValue: "No tokens found",
                  })}
                </CommandEmpty>

                <CommandGroup>
                  {filtered.map(({ token, balance, key, isSelected }) => (
                    <CommandItem
                      key={key}
                      value={`${token.symbol} ${token.name} ${token.id ?? "eth"}`}
                      onSelect={() => handleSelect(token)}
                      className={cn(
                        "px-3 py-2 rounded-lg mx-2",
                        isSelected ? "bg-muted" : "hover:bg-accent",
                      )}
                    >
                      <div className="flex w-full items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <TokenImage token={token} />
                          <div className="flex flex-col">
                            <span className="font-medium">{token.symbol}</span>
                            <span className="text-xs text-muted-foreground">
                              {token.name}
                            </span>
                          </div>
                        </div>
                        <div className="text-right min-w-[64px]">
                          <div className="text-sm font-medium h-[18px] tabular-nums">
                            {balance}
                          </div>
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </DialogContent>
        </Dialog>
      </div>
    );
  },
  (prev, next) =>
    prev.selectedToken.id === next.selectedToken.id &&
    prev.selectedToken.balance === next.selectedToken.balance &&
    prev.selectedToken.token1 === next.selectedToken.token1 &&
    prev.tokens.length === next.tokens.length &&
    prev.isEthBalanceFetching === next.isEthBalanceFetching,
);
