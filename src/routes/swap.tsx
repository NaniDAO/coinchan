import { LoadingLogo } from "@/components/ui/loading-logo";
import { TokenSelectionProvider } from "../contexts/TokenSelectionContext";

import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAllCoins } from "@/hooks/metadata/use-all-coins";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SwapAction } from "@/components/swap/SwapAction";
import { RecommendationsPanel } from "@/components/swap/RecommendationsPanel";
import type { Recommendation } from "@/types/recommendations";
import { useState, useRef } from "react";

export const Route = createFileRoute("/swap")({
  component: RouteComponent,
  validateSearch: (search: { buyToken?: string; sellToken?: string }) => search,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { tokenCount, loading, error: loadError } = useAllCoins();
  const [selectedRecommendationIndex, setSelectedRecommendationIndex] = useState<number | undefined>(undefined);
  const swapActionRef = useRef<{ setTokensFromRecommendation: (rec: Recommendation) => void }>(null);

  // Loading state
  if (loading) {
    return (
      <div className="p-2 flex items-center justify-center py-12">
        <LoadingLogo size="lg" />
      </div>
    );
  }

  const handleRecommendationSelect = (rec: Recommendation, index: number) => {
    setSelectedRecommendationIndex(index);
    swapActionRef.current?.setTokensFromRecommendation(rec);
  };

  return (
    <TokenSelectionProvider>
      <div className="w-full !mb-10 mt-5 mx-auto !p-4 bg-background">
        {/* Load error notification */}
        {loadError && (
          <div className="p-2.5 mb-5 bg-terminal-gray border-2 border-terminal-black text-xs text-center">
            {loadError}
          </div>
        )}

        {/* Two-column grid layout: swap on left, recommendations on right (desktop) / stacked (mobile) */}
        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          {/* Left column: Swap interface */}
          <div className="flex flex-col">
            <div className="relative flex flex-col p-5">
              <ErrorBoundary
                fallback={
                  <div className="flex items-center justify-center p-8">
                    <div className="text-sm text-muted-foreground">Loading...</div>
                  </div>
                }
              >
                <SwapAction action="instant" ref={swapActionRef} />
              </ErrorBoundary>
              {/* Info showing token count */}
              <div className="text-xs mt-5 text-center font-mono">
                {t("common.available_tokens")} {tokenCount} {t("common.eth_plus_coins", { count: tokenCount - 1 })}
              </div>
            </div>
          </div>

          {/* Right column: Recommendations panel */}
          <div className="flex flex-col">
            <ErrorBoundary
              fallback={
                <div className="flex items-center justify-center p-8">
                  <div className="text-sm text-muted-foreground">Loading recommendations...</div>
                </div>
              }
            >
              <RecommendationsPanel
                onSelectRecommendation={handleRecommendationSelect}
                selectedIndex={selectedRecommendationIndex}
              />
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </TokenSelectionProvider>
  );
}
