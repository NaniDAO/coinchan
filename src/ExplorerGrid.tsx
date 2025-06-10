import { CoinCard } from "./components/CoinCard";
import { type CoinData } from "./hooks/metadata";
import { useEffect, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, Coins as CoinsIcon, ThumbsUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LoadingLogo } from "./components/ui/loading-logo";

// Default page size
const PAGE_SIZE = 20;

// Sort type options
export type SortType = "liquidity" | "recency" | "votes";

export const ExplorerGrid = ({
  coins,
  total,
  canPrev,
  canNext,
  onPrev,
  onNext,
  isLoading = false,
  currentPage = 1,
  totalPages = 1,
  isSearchActive = false,
  searchBar,
  searchResults = "",
  sortType = "liquidity",
  sortOrder = "desc",
  onSortTypeChange,
  onSortOrderChange,
}: {
  coins: CoinData[];
  total: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  isLoading?: boolean;
  currentPage?: number;
  totalPages?: number;
  isSearchActive?: boolean;
  searchBar?: React.ReactNode;
  searchResults?: string;
  sortType?: SortType;
  sortOrder?: "asc" | "desc";
  onSortTypeChange?: (type: SortType) => void;
  onSortOrderChange?: (order: "asc" | "desc") => void;
}) => {
  const { t } = useTranslation();

  // Track page transition state for better UX
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [direction, setDirection] = useState<"next" | "prev" | null>(null);

  // Reset transition state when coins change or loading completes
  useEffect(() => {
    setIsTransitioning(false);
    setDirection(null);
  }, [coins, isLoading]);

  // Enhanced prev/next handlers with transition state
  const handlePrev = () => {
    if (canPrev && !isLoading && !isTransitioning) {
      setIsTransitioning(true);
      setDirection("prev");
      onPrev();
    }
  };

  const handleNext = () => {
    if (canNext && !isLoading && !isTransitioning) {
      setIsTransitioning(true);
      setDirection("next");
      onNext();
    }
  };

  // Combined loading state including transitions
  const isPending = isLoading || isTransitioning;

  return (
    <div className="w-full max-w-full"
         style={{ padding: '0' }}>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
          <h2 className="text-xs md:text-xl font-semibold text-center sm:text-left">
            {total === 0
              ? t("explore.no_results")
              : total === 1
                ? `1 ${t("common.coin")}`
                : `${total} ${t("common.coins")}`}
          </h2>

          {searchResults && <div className="ml-4 text-sm text-muted-foreground">{searchResults}</div>}
        </div>

        <div className="flex items-center">
          {/* Sort Type Button */}
          {onSortTypeChange && (
            <div className="flex space-x-2 mr-2">
              {/* Liquidity button */}
              <button
                onClick={() => onSortTypeChange("liquidity")}
                className={`
                  flex items-center px-2 py-1 rounded-md border text-sm
                  ${
                    sortType === "liquidity"
                      ? "border-accent bg-accent/10"
                      : "border-primary/30 hover:bg-secondary-foreground"
                  }
                `}
                title={
                  sortType === "liquidity"
                    ? t("common.currently_sorting", {
                        field: t("common.liquidity"),
                      })
                    : t("common.sort_by", { field: t("common.liquidity") })
                }
                disabled={isLoading || isTransitioning}
              >
                <CoinsIcon className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">{t("common.liquidity")}</span>
              </button>

              {/* Recency button */}
              <button
                onClick={() => onSortTypeChange("recency")}
                className={`
                  flex items-center px-2 py-1 rounded-md border text-sm
                  ${
                    sortType === "recency"
                      ? "border-accent bg-accent/10"
                      : "border-primary/30 hover:bg-secondary-foreground"
                  }
                `}
                title={
                  sortType === "recency"
                    ? t("common.currently_sorting", { field: t("explore.new") })
                    : t("common.sort_by", { field: t("explore.new") })
                }
                disabled={isLoading || isTransitioning}
              >
                <ArrowDownAZ className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">{t("explore.new")}</span>
              </button>

              {/* Votes button */}
              <button
                onClick={() => onSortTypeChange("votes")}
                className={`
                  flex items-center px-2 py-1 rounded-md border text-sm
                  ${
                    sortType === "votes"
                      ? "border-accent bg-accent/10"
                      : "border-primary/30 hover:bg-secondary-foreground"
                  }
                `}
                title={
                  sortType === "votes"
                    ? t("common.currently_sorting", {
                        field: t("common.votes"),
                      })
                    : t("common.sort_by", { field: t("common.votes") })
                }
                disabled={isLoading || isTransitioning}
              >
                <ThumbsUp className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">{t("common.votes")}</span>
              </button>
            </div>
          )}

          {/* Sort Order Button - Now visible for both sort modes */}
          {onSortOrderChange && (
            <button
              onClick={() => onSortOrderChange(sortOrder === "asc" ? "desc" : "asc")}
              className="flex items-center justify-center px-2 py-1 mr-2 rounded-md border border-primary/30 hover:bg-secondary-foreground text-sm"
              aria-label={
                sortType === "recency"
                  ? sortOrder === "asc"
                    ? "Sort newest first"
                    : "Sort oldest first"
                  : sortType === "votes" // Added votes condition
                    ? sortOrder === "asc"
                      ? "Sort lowest votes first"
                      : "Sort highest votes first"
                    : sortOrder === "asc"
                      ? "Sort highest liquidity first"
                      : "Sort lowest liquidity first"
              }
              title={
                sortType === "recency"
                  ? sortOrder === "asc"
                    ? "Currently: Oldest first"
                    : "Currently: Newest first"
                  : sortType === "votes" // Added votes condition
                    ? sortOrder === "asc"
                      ? "Currently: Lowest votes first"
                      : "Currently: Highest votes first"
                    : sortOrder === "asc"
                      ? "Currently: Lowest liquidity first"
                      : "Currently: Highest liquidity first"
              }
              disabled={isLoading || isTransitioning}
            >
              {sortOrder === "asc" ? <ArrowUpAZ className="w-4 h-4 mr-1" /> : <ArrowDownAZ className="w-4 h-4 mr-1" />}
              <span className="hidden sm:inline">
                {sortType === "recency"
                  ? sortOrder === "asc"
                    ? "Oldest"
                    : "Newest"
                  : sortType === "votes" // Added votes condition
                    ? sortOrder === "asc"
                      ? "Lowest"
                      : "Highest"
                    : sortOrder === "asc"
                      ? "Lowest"
                      : "Highest"}
              </span>
            </button>
          )}

          {/* Search Bar */}
          {searchBar}

          {/* Enhanced loading indicator */}
          {isPending && (
            <div className="flex items-center ml-3">
              <LoadingLogo size="sm" className="mr-2" />
              <span className="text-sm text-primary">
                {isTransitioning
                  ? direction === "next"
                    ? t("common.loading_next")
                    : t("common.loading_previous")
                  : t("common.loading")}
              </span>
            </div>
          )}
        </div>
      </div>

      <div
        className={`coin-explorer-grid min-h-[300px] ${isTransitioning ? "transition-opacity duration-300 opacity-50" : ""}`}
      >
        {coins.map((coin) => (
          <div key={coin.coinId.toString()} className={isPending ? "opacity-60 pointer-events-none" : ""}>
            <CoinCard coin={coin} />
          </div>
        ))}

        {/* Show skeleton loaders for empty grid during initial load */}
        {coins.length === 0 &&
          total > 0 &&
          !isSearchActive &&
          Array.from({ length: Math.min(total, PAGE_SIZE) }).map((_, index) => (
            <div
              key={`skeleton-${index}`}
              className="flex border-2 border-primary/30 rounded-md bg-secondary/30 w-full flex-col items-right p-1 gap-2 shadow h-32 animate-pulse"
            ></div>
          ))}

        {/* Show message when no search results */}
        {coins.length === 0 && isSearchActive && (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            {t("explore.no_results")}
          </div>
        )}
      </div>

      <div className="pagination-buttons flex justify-between items-center mt-6 mb-4">
        <button
          onClick={handlePrev}
          disabled={!canPrev || isPending}
          aria-label="Go to previous page"
          className={`px-4 py-2 rounded-md border border-primary hover:bg-secondary-foreground touch-manipulation
            ${!canPrev || isPending ? "text-muted-foreground opacity-50 cursor-not-allowed" : "text-primary font-bold"}
            ${isTransitioning && direction === "prev" ? "relative bg-secondary/30" : ""}
          `}
        >
          {isTransitioning && direction === "prev" ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <LoadingLogo size="sm" className="scale-75" />
            </span>
          ) : null}
          <span className={isTransitioning && direction === "prev" ? "opacity-0" : ""}>{t("common.previous")}</span>
        </button>

        {/* Page info from parent */}
        {total > 0 && !isSearchActive && (
          <span className="text-sm text-muted-foreground">
            {t("common.page")} {currentPage} {t("common.of")} {totalPages}
          </span>
        )}

        <button
          onClick={handleNext}
          disabled={!canNext || isPending}
          aria-label="Go to next page"
          className={`px-4 py-2 rounded-md border border-primary/30 hover:bg-secondary-foreground touch-manipulation
            ${!canNext || isPending ? "text-muted-foreground opacity-50 cursor-not-allowed" : "text-primary font-bold"}
            ${isTransitioning && direction === "next" ? "relative bg-secondary/30" : ""}
          `}
        >
          {isTransitioning && direction === "next" ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <LoadingLogo size="sm" className="scale-75" />
            </span>
          ) : null}
          <span className={isTransitioning && direction === "next" ? "opacity-0" : ""}>{t("common.next")}</span>
        </button>
      </div>
    </div>
  );
};
