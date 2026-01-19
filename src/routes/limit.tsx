import { createFileRoute } from "@tanstack/react-router";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { SEO } from "@/components/SEO";
import { TokenSelectionProvider } from "../contexts/TokenSelectionContext";

import { useTranslation } from "react-i18next";
import { useAllCoins } from "@/hooks/metadata/use-all-coins";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SwapAction } from "@/components/swap/SwapAction";

export const Route = createFileRoute("/limit")({
  component: RouteComponent,
});

function RouteComponent() {
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

  return (
    <TokenSelectionProvider>
      <SEO
        title="Limit Orders"
        description="Place limit orders on ZAMM DEX. Set your price and let the order execute automatically when the market reaches your target. Gas-efficient on-chain orders."
        url="/limit"
      />
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
            <ErrorBoundary
              fallback={
                <div className="flex items-center justify-center p-8">
                  <div className="text-sm text-muted-foreground">Loading...</div>
                </div>
              }
            >
              <SwapAction action="limit" />
            </ErrorBoundary>
            {/* Info showing token count */}
            <div className="text-xs mt-5 text-center font-mono">
              {t("common.available_tokens")} {tokenCount} {t("common.eth_plus_coins", { count: tokenCount - 1 })}
            </div>
          </div>
        </div>
      </div>
    </TokenSelectionProvider>
  );
}
