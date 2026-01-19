import { LoadingLogo } from "@/components/ui/loading-logo";
import { SEO } from "@/components/SEO";
import { TokenSelectionProvider } from "../contexts/TokenSelectionContext";

import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAllCoins } from "@/hooks/metadata/use-all-coins";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SwapAction } from "@/components/swap/SwapAction";
import { RecommendationsSidebar } from "@/components/swap/RecommendationsSidebar";
import { RecommendationCommandButton } from "@/components/swap/RecommendationCommandButton";
import type { Recommendation } from "@/types/recommendations";
import { useState, useRef, useEffect } from "react";
import { useRecommendations } from "@/hooks/use-recommendations";

export const Route = createFileRoute("/swap")({
  component: RouteComponent,
  validateSearch: (search: { buyToken?: string; sellToken?: string }) => search,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { tokenCount, loading, error: loadError } = useAllCoins();
  const { recommendations, loading: recsLoading } = useRecommendations();
  const [selectedRecommendationIndex, setSelectedRecommendationIndex] = useState<number | undefined>(undefined);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const swapActionRef = useRef<{ setTokensFromRecommendation: (rec: Recommendation) => void }>(null);

  // Keyboard shortcut: Cmd/Ctrl + K to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  const recommendationCount = recommendations?.recommendations?.length ?? 0;
  const hasRecommendations = recommendationCount > 0;

  return (
    <TokenSelectionProvider>
      <SEO
        title="Swap Tokens"
        description="Swap ETH and ERC-20 tokens instantly on ZAMM. The cheapest gas fees on Ethereum with no custody and instant execution."
        url="/swap"
      />
      <div className="w-full !mb-10 mt-5 mx-auto !p-4 bg-background">
        {/* Load error notification */}
        {loadError && (
          <div className="p-2.5 mb-5 bg-terminal-gray border-2 border-terminal-black text-xs text-center">
            {loadError}
          </div>
        )}

        {/* Single column layout with floating command button */}
        <div className="w-full max-w-2xl mx-auto">
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

            {/* Floating Command Button - positioned at top-right of swap card */}
            <div className="absolute top-5 right-5">
              <RecommendationCommandButton
                loading={recsLoading}
                hasRecommendations={hasRecommendations}
                recommendationCount={recommendationCount}
                onClick={() => setSidebarOpen(true)}
              />
            </div>
          </div>
        </div>

        {/* Recommendations Sidebar */}
        <RecommendationsSidebar
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
          onSelectRecommendation={handleRecommendationSelect}
          selectedIndex={selectedRecommendationIndex}
        />
      </div>
    </TokenSelectionProvider>
  );
}
