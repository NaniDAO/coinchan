import { useState } from "react";
import { useTranslation } from "react-i18next";

import { LiquidityActions } from "./LiquidityActions";
import { SwapAction } from "./components/swap/SwapAction";
import { LoadingLogo } from "./components/ui/loading-logo";
import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { cn } from "./lib/utils";
import { ErrorBoundary } from "./components/ErrorBoundary";

/* ────────────────────────────────────────────────────────────────────────────
  Mode types and constants - Simplified to focus on core swap functionality
──────────────────────────────────────────────────────────────────────────── */
type TileMode = "swap" | "liquidity";

/* ────────────────────────────────────────────────────────────────────────────
  Pool Actions - Terminal Style
──────────────────────────────────────────────────────────────────────────── */
export const PoolActions = () => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<TileMode>("swap");
  const { tokenCount, loading, error: loadError } = useAllCoins();

  // Loading state
  if (loading) {
    return (
      <div className="p-2 flex items-center justify-center py-12">
        <LoadingLogo size="lg" />
      </div>
    );
  }

  // Main UI
  return (
    <div className="w-full !mb-10 mt-5 mx-auto !p-4 bg-background ">
      <h2 className="sr-only m-0 font-display uppercase tracking-widest text-lg">
        SWAP TERMINAL
      </h2>

      {/* Load error notification */}
      {loadError && (
        <div className="p-2.5 mb-5 bg-terminal-gray border-2 border-terminal-black text-xs text-center">
          {loadError}
        </div>
      )}

      {/* Content based on mode */}
      <div className="w-full flex items-center justify-center">
        <div className="relative flex flex-col !w-xl outline-2 outline-offset-1 border-1 border-foreground outline-foreground p-5">
          {/* Mode toggle button in the corner of the tile */}
          <button
            className={cn(
              "absolute top-2 right-2 !px-3 !py-1.5 text-xs font-bold border-2 transition-all z-10",
              "bg-accent text-accent-foreground hover:bg-background hover:text-foreground",
              "uppercase tracking-wider",
            )}
            onClick={() => setMode(mode === "swap" ? "liquidity" : "swap")}
          >
            {mode === "swap"
              ? t("common.add").toUpperCase()
              : t("common.swap").toUpperCase()}
          </button>
          {mode === "swap" && (
            <ErrorBoundary fallback={<div>Error</div>}>
              <SwapAction />
            </ErrorBoundary>
          )}
          {mode === "liquidity" && (
            <ErrorBoundary fallback={<div>Error</div>}>
              <LiquidityActions />
            </ErrorBoundary>
          )}
          {/* Info showing token count */}
          <div className="text-xs mt-5 text-center font-mono">
            {t("common.available_tokens")} {tokenCount}{" "}
            {t("common.eth_plus_coins", { count: tokenCount - 1 })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PoolActions;
