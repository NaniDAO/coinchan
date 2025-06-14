import { useState } from "react";

import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { LiquidityActions } from "./LiquidityActions";
import { SwapAction } from "./SwapAction";
import { LoadingLogo } from "./components/ui/loading-logo";
import { cn } from "./lib/utils";

/* ────────────────────────────────────────────────────────────────────────────
  Mode types and constants - Simplified to focus on core swap functionality
──────────────────────────────────────────────────────────────────────────── */
type TileMode = "swap" | "liquidity";

/* ────────────────────────────────────────────────────────────────────────────
  Pool Actions - Terminal Style
──────────────────────────────────────────────────────────────────────────── */
export const PoolActions = () => {
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
      {/* Header with mode switcher matching HTML design */}
      <div className="flex justify-end items-center mb-5">
        <h2 className="sr-only m-0 font-display uppercase tracking-widest text-lg">
          SWAP TERMINAL
        </h2>

        <div className="flex p-0.5 gap-0">
          <button
            className={cn(
              `!px-2 !py-1 text-xs border-2 transition-colors hover:!text-underline`,
              mode === "swap"
                ? "bg-background text-foreground"
                : "bg-accent text-accent-foreground",
            )}
            onClick={() => setMode("swap")}
          >
            SWAP
          </button>
          <button
            className={cn(
              `!px-2 !py-1 text-xs border-2 transition-colors hover:!text-underline`,
              mode === "liquidity"
                ? "bg-background text-foreground"
                : "bg-accent text-accent-foreground",
            )}
            onClick={() => setMode("liquidity")}
          >
            ADD
          </button>
        </div>
      </div>

      {/* Load error notification */}
      {loadError && (
        <div className="p-2.5 mb-5 bg-terminal-gray border-2 border-terminal-black text-xs text-center">
          {loadError}
        </div>
      )}

      {/* Content based on mode */}
      <div className="w-full flex items-center justify-center">
        <div className="relative flex flex-col !w-xl outline-2 outline-offset-1 border-1 border-foreground outline-foreground p-5">
          {mode === "swap" && <SwapAction />}
          {mode === "liquidity" && <LiquidityActions />}
          {/* Info showing token count */}
          <div className="text-xs mt-5 text-center font-mono">
            Available tokens: {tokenCount} (ETH + {tokenCount - 1} coins)
          </div>
        </div>
      </div>
    </div>
  );
};

export default PoolActions;
