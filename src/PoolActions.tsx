import { useTranslation } from "react-i18next";

import { SwapAction } from "./components/swap/SwapAction";
import { LoadingLogo } from "./components/ui/loading-logo";
import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { ErrorBoundary } from "./components/ErrorBoundary";

/* ────────────────────────────────────────────────────────────────────────────
  Pool Actions - Terminal Style
──────────────────────────────────────────────────────────────────────────── */
export const PoolActions = () => {
  const { t } = useTranslation();
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
      {/* Load error notification */}
      {loadError && (
        <div className="p-2.5 mb-5 bg-terminal-gray border-2 border-terminal-black text-xs text-center">
          {loadError}
        </div>
      )}

      {/* Content based on mode */}
      <div className="w-full flex items-center justify-center">
        <div className="relative flex flex-col !w-xl p-5">
          <ErrorBoundary fallback={<div>Error</div>}>
            <SwapAction />
          </ErrorBoundary>
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
