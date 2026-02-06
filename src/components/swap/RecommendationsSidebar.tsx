import { useRecommendations } from "@/hooks/use-recommendations";
import type { Recommendation } from "@/types/recommendations";
import { cn } from "@/lib/utils";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useTranslation } from "react-i18next";

interface RecommendationsSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectRecommendation: (rec: Recommendation, index: number) => void;
  selectedIndex?: number;
}

export function RecommendationsSidebar({
  open,
  onOpenChange,
  onSelectRecommendation,
  selectedIndex,
}: RecommendationsSidebarProps) {
  const { recommendations, loading, error } = useRecommendations();
  const { t } = useTranslation();

  const handleSelectRecommendation = (rec: Recommendation, index: number) => {
    onSelectRecommendation(rec, index);
    onOpenChange(false); // Close sidebar after selection
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[90%] sm:w-full sm:max-w-md overflow-y-auto p-0">
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6">
          <SheetTitle className="text-base sm:text-lg">{t("recommendations.title")}</SheetTitle>
          <SheetDescription className="text-xs sm:text-sm">
            {loading
              ? t("recommendations.loading")
              : recommendations && recommendations.recommendations.length > 0
                ? recommendations.recommendations.length === 1
                  ? t("recommendations.suggestions_count", { count: recommendations.recommendations.length })
                  : t("recommendations.suggestions_count_plural", { count: recommendations.recommendations.length })
                : t("recommendations.empty_state")}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4 sm:px-6 sm:pb-6">
          {loading && (
            <div className="flex items-center justify-center py-8 sm:py-12">
              <LoadingLogo size="sm" />
            </div>
          )}

          {error && (
            <div className="text-xs sm:text-sm text-muted-foreground text-center py-6 sm:py-8">
              {t("recommendations.error")}
            </div>
          )}

          {!loading && !error && (!recommendations || recommendations.recommendations.length === 0) && (
            <div className="text-xs sm:text-sm text-muted-foreground text-center py-6 sm:py-8">
              {t("recommendations.no_recommendations")}
            </div>
          )}

          {!loading && !error && recommendations && recommendations.recommendations.length > 0 && (
            <>
              <div className="flex flex-col gap-2 sm:gap-3">
                {recommendations.recommendations.map((rec, idx) => (
                  <RecommendationCard
                    key={idx}
                    recommendation={rec}
                    onClick={() => handleSelectRecommendation(rec, idx)}
                    isSelected={selectedIndex === idx}
                  />
                ))}
              </div>

              {recommendations.hits > 0 && (
                <div className="mt-3 pt-3 sm:mt-4 sm:pt-4 border-t border-border/50 text-xs sm:text-sm text-muted-foreground text-center">
                  {recommendations.hits === 1
                    ? t("recommendations.based_on_transactions", { count: recommendations.hits })
                    : t("recommendations.based_on_transactions_plural", { count: recommendations.hits })}
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface RecommendationCardProps {
  recommendation: Recommendation;
  onClick: () => void;
  isSelected?: boolean;
}

function RecommendationCard({ recommendation, onClick, isSelected = false }: RecommendationCardProps) {
  const { tokenIn, tokenOut, amount, side, why, signals, confidence, references } = recommendation;
  const { t } = useTranslation();

  // Helper to resolve IPFS URLs
  const resolveImageUrl = (url: string | undefined): string => {
    if (!url) {
      return "/placeholder.jpeg";
    }
    if (url.startsWith("ipfs://")) {
      return url.replace("ipfs://", "https://content.wrappr.wtf/ipfs/");
    }
    return url;
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 sm:p-4 border-2 transition-all duration-150 min-h-[100px]",
        "hover:shadow-[2px_2px_0_var(--border)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]",
        isSelected ? "border-foreground bg-secondary" : "border-border bg-card hover:border-foreground",
      )}
    >
      {/* Token Pair Header */}
      <div className="flex items-center justify-between mb-2 sm:mb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center -space-x-2">
            <img
              src={resolveImageUrl(tokenIn.imageUrl)}
              alt={tokenIn.symbol}
              className="w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 border-card"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/placeholder.jpeg";
              }}
            />
            <img
              src={resolveImageUrl(tokenOut.imageUrl)}
              alt={tokenOut.symbol}
              className="w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 border-card"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/placeholder.jpeg";
              }}
            />
          </div>
          <div className="flex items-center gap-1.5 text-sm sm:text-base font-medium">
            <span>{tokenIn.symbol}</span>
            <span className="text-muted-foreground">→</span>
            <span>{tokenOut.symbol}</span>
          </div>
        </div>

        {confidence !== null && (
          <span className="text-xs sm:text-sm font-medium text-green-600 dark:text-green-400 flex-shrink-0">
            {Math.round(confidence * 100)}%
          </span>
        )}
      </div>

      {/* Amount */}
      <div className="text-xs sm:text-sm text-muted-foreground mb-2">
        {side === "SWAP_EXACT_IN" ? t("common.sell") : t("common.buy")} {amount}{" "}
        {side === "SWAP_EXACT_IN" ? tokenIn.symbol : tokenOut.symbol}
      </div>

      {/* Reasoning */}
      <div className="text-xs sm:text-sm mb-2 leading-relaxed">{why}</div>

      {/* Signals */}
      {signals.length > 0 && (
        <div className="flex flex-wrap gap-1 sm:gap-1.5">
          {signals.map((signal) => (
            <SignalBadge key={signal} signal={signal} />
          ))}
        </div>
      )}

      {/* References */}
      {references && references.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <h4 className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase mb-1">
            {t("recommendations.references")}
          </h4>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            {references.map((ref, idx) => (
              <span key={idx} className="text-[10px] sm:text-xs text-muted-foreground">
                #{ref}
              </span>
            ))}
          </div>
        </div>
      )}
    </button>
  );
}

function SignalBadge({ signal }: { signal: string }) {
  const getSignalColor = (signal: string) => {
    switch (signal) {
      case "DUST_CONSOLIDATION":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "LP_UNWIND":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "REBALANCE":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
      case "RISK_TRIM":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "STABLECOIN_MIGRATION":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "REDUNDANT_ASSET":
        return "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300";
      case "FEE_EFFICIENCY":
        return "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
    }
  };

  return (
    <span
      className={cn(
        "inline-block px-1.5 py-0.5 sm:px-2 text-[10px] sm:text-[11px] font-medium uppercase tracking-wide",
        getSignalColor(signal),
      )}
    >
      {signal.replace(/_/g, " ")}
    </span>
  );
}
