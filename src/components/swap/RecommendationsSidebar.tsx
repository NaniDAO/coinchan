import { useRecommendations } from "@/hooks/use-recommendations";
import type { Recommendation } from "@/types/recommendations";
import { cn } from "@/lib/utils";
import { LoadingLogo } from "@/components/ui/loading-logo";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

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

  const handleSelectRecommendation = (rec: Recommendation, index: number) => {
    onSelectRecommendation(rec, index);
    onOpenChange(false); // Close sidebar after selection
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>AI Recommendations</SheetTitle>
          <SheetDescription>
            {loading
              ? "Loading personalized swap recommendations..."
              : recommendations && recommendations.recommendations.length > 0
              ? `${recommendations.recommendations.length} suggestion${
                  recommendations.recommendations.length === 1 ? "" : "s"
                } based on your transaction history`
              : "Connect your wallet and make some swaps to get personalized suggestions"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <LoadingLogo size="sm" />
            </div>
          )}

          {error && (
            <div className="text-xs text-muted-foreground text-center py-8 px-4">
              Failed to load recommendations. Please try again later.
            </div>
          )}

          {!loading && !error && (!recommendations || recommendations.recommendations.length === 0) && (
            <div className="text-xs text-muted-foreground text-center py-8 px-4">
              No recommendations available at this time.
            </div>
          )}

          {!loading && !error && recommendations && recommendations.recommendations.length > 0 && (
            <>
              <div className="flex flex-col gap-3">
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
                <div className="mt-4 pt-4 border-t border-terminal-black/10 text-xs text-muted-foreground text-center">
                  Based on {recommendations.hits} transaction{recommendations.hits === 1 ? "" : "s"}
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

  // Helper to resolve IPFS URLs
  const resolveImageUrl = (url: string): string => {
    if (url.startsWith("ipfs://")) {
      return url.replace("ipfs://", "https://ipfs.io/ipfs/");
    }
    return url;
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left p-4 border-2 transition-all duration-150",
        "hover:shadow-[2px_2px_0_var(--terminal-black)]",
        isSelected
          ? "border-terminal-black bg-secondary"
          : "border-terminal-black/30 bg-terminal-white hover:border-terminal-black"
      )}
    >
      {/* Token Pair Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center -space-x-2">
            <img
              src={resolveImageUrl(tokenIn.imageUrl)}
              alt={tokenIn.symbol}
              className="w-7 h-7 rounded-full border-2 border-terminal-white"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "https://via.placeholder.com/28";
              }}
            />
            <img
              src={resolveImageUrl(tokenOut.imageUrl)}
              alt={tokenOut.symbol}
              className="w-7 h-7 rounded-full border-2 border-terminal-white"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "https://via.placeholder.com/28";
              }}
            />
          </div>
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <span>{tokenIn.symbol}</span>
            <span className="text-muted-foreground">→</span>
            <span>{tokenOut.symbol}</span>
          </div>
        </div>

        {confidence !== null && (
          <span className="text-xs font-medium text-green-600 dark:text-green-400">
            {Math.round(confidence * 100)}%
          </span>
        )}
      </div>

      {/* Amount */}
      <div className="text-xs text-muted-foreground mb-2">
        {side === "SWAP_EXACT_IN" ? "Sell" : "Buy"} {amount}{" "}
        {side === "SWAP_EXACT_IN" ? tokenIn.symbol : tokenOut.symbol}
      </div>

      {/* Reasoning */}
      <div className="text-xs mb-2">{why}</div>

      {/* Signals */}
      {signals.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {signals.map((signal) => (
            <SignalBadge key={signal} signal={signal} />
          ))}
        </div>
      )}

      {/* References */}
      {references && references.length > 0 && (
        <div className="mt-2 pt-2 border-t border-terminal-black/10">
          <h4 className="text-[10px] font-medium text-muted-foreground uppercase mb-1">References</h4>
          <div className="flex flex-wrap gap-1">
            {references.map((ref, idx) => (
              <span key={idx} className="text-[10px] text-muted-foreground">
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
      className={cn("inline-block px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide", getSignalColor(signal))}
    >
      {signal.replace(/_/g, " ")}
    </span>
  );
}
