import { useState, useEffect, useMemo } from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
  CommandGroup,
} from "@/components/ui/command";
import { useAllCoins } from "@/hooks/metadata/use-all-coins";
import { SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { TokenImage } from "./TokenImage";
import { Link } from "@tanstack/react-router";

export function TokenCommandMenu() {
  const { theme } = useTheme();
  const { tokens } = useAllCoins();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Cmd+K or Ctrl+K to toggle
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Token filtering
  const filteredTokens = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return tokens.filter(
      (t) =>
        (t.name && t.name.toLowerCase().includes(q)) ||
        (t.symbol && t.symbol.toLowerCase().includes(q)),
    );
  }, [query, tokens]);

  const isDark = theme === "dark";

  return (
    <>
      {/* Fake Search Bar */}
      <div
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center justify-between w-full px-4 py-2 rounded-xl backdrop-blur-md border transition",
          isDark
            ? "bg-black/10 border-white/20 hover:bg-white/20 text-white"
            : "text-black bg-white/50 border-white/30 hover:bg-white/30",
        )}
      >
        <div className="flex items-center gap-2 text-white">
          <SearchIcon className="h-4 w-4 text-gray-300" />
          <span
            className={cn(
              "text-sm",
              isDark ? "text-white/80" : "text-black/80",
            )}
          >
            Search tokens...
          </span>
        </div>
        <kbd
          className={cn(
            "text-xs border border-white/20 px-1.5 py-0.5 rounded",
            isDark ? "text-white/50 bg-black/60" : "text-black/50 bg-white/10",
          )}
        >
          ⌘ K
        </kbd>
      </div>

      {/* Command Dialog */}
      <CommandDialog
        className={cn(
          "backdrop-blur-md rounded-xl p-2 shadow-xl",
          isDark ? "bg-black/20" : "bg-white/30",
        )}
        open={open}
        onOpenChange={setOpen}
      >
        <CommandInput
          placeholder="Search tokens..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList className={cn("p-2")}>
          {filteredTokens.length === 0 ? (
            <CommandEmpty>No tokens found.</CommandEmpty>
          ) : (
            <CommandGroup heading="Matching Tokens">
              {filteredTokens.map((token) => (
                <CommandItem
                  className="blur-none"
                  key={token.id?.toString() ?? "eth-pseudo"}
                  onSelect={() => {
                    setQuery(token.symbol);
                    setOpen(false);
                  }}
                >
                  <div className="flex justify-between w-full items-center space-x-2">
                    <div className="flex items-center space-x-2">
                      <TokenImage token={token} />
                      <div className="flex flex-col text-left">
                        <span className="font-medium">{token.symbol}</span>
                        <span className="text-xs opacity-70">{token.name}</span>
                      </div>
                    </div>
                    {token?.id !== null && (
                      <Link
                        to="/c/$coinId"
                        params={{ coinId: token.id.toString() }}
                      >
                        View
                      </Link>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
