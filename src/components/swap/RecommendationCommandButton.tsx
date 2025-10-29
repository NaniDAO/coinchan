import { cn } from "@/lib/utils";
import { useAccount } from "wagmi";

interface RecommendationCommandButtonProps {
  loading: boolean;
  hasRecommendations: boolean;
  recommendationCount: number;
  onClick: () => void;
  className?: string;
}

export function RecommendationCommandButton({
  loading,
  hasRecommendations,
  recommendationCount,
  onClick,
  className,
}: RecommendationCommandButtonProps) {
  const { isConnected } = useAccount();

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isConnected}
      className={cn(
        "relative flex items-center justify-center w-12 h-12 rounded-lg border-2 transition-all duration-200",
        "hover:shadow-[2px_2px_0_var(--terminal-black)]",
        !isConnected && "opacity-40 cursor-not-allowed border-terminal-black/30 bg-terminal-gray",
        isConnected && !loading && "border-terminal-black bg-terminal-white hover:bg-secondary",
        isConnected && loading && "border-terminal-black bg-terminal-white",
        className,
      )}
      title={
        !isConnected
          ? "Connect wallet to view recommendations"
          : loading
            ? "Loading recommendations..."
            : `${recommendationCount} recommendation${recommendationCount === 1 ? "" : "s"} available`
      }
    >
      {/* Command Symbol */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("w-6 h-6", loading && "animate-spin", !isConnected && "text-muted-foreground")}
      >
        {/* Command key symbol: ⌘ */}
        <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
      </svg>

      {/* Badge for recommendation count */}
      {!loading && hasRecommendations && recommendationCount > 0 && (
        <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-red-500 text-white rounded-full border-2 border-terminal-white">
          {recommendationCount > 9 ? "9+" : recommendationCount}
        </span>
      )}
    </button>
  );
}
