import { CoinCard } from "./components/CoinCard";
import { type CoinData } from "./hooks/metadata";
import { useEffect, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, Coins as CoinsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

// Default page size
const PAGE_SIZE = 20;

// Sort type options
export type SortType = "liquidity" | "recency";

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
    <div className="w-full px-2 sm:px-4">
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
            <button
              onClick={() => onSortTypeChange(sortType === "liquidity" ? "recency" : "liquidity")}
              className={`flex items-center justify-center px-2 py-1 mr-2 rounded-md border ${
                sortType === "recency" ? "border-accent bg-accent/10" : "border-primary/30"
              } hover:bg-secondary-foreground text-sm`}
              aria-label={sortType === "liquidity" ? t("explore.sort_by_recency") : t("explore.sort_by_liquidity")}
              title={
                sortType === "liquidity"
                  ? t("explore.currently_sorting_by_liquidity")
                  : t("explore.currently_sorting_by_recency")
              }
              disabled={isLoading || isTransitioning}
            >
              {sortType === "liquidity" ? (
                <CoinsIcon className="w-4 h-4 mr-1" />
              ) : (
                <ArrowDownAZ className="w-4 h-4 mr-1" />
              )}
              <span className="hidden sm:inline">
                {sortType === "liquidity" ? t("common.liquidity") : t("explore.new")}
              </span>
            </button>
          )}

          {/* Sort Order Button - Now visible for both sort modes */}
          {onSortOrderChange && (
            <button
              onClick={() => onSortOrderChange(sortOrder === "asc" ? "desc" : "asc")}
              className="flex items-center justify-center px-2 py-1 mr-2 rounded-md border border-primary/30 hover:bg-secondary-foreground text-sm"
              aria-label={
                sortType === "recency"
                  ? sortOrder === "asc"
                    ? t("explore.sort_newest_first")
                    : t("explore.sort_oldest_first")
                  : sortOrder === "asc"
                    ? t("explore.sort_highest_liquidity_first")
                    : t("explore.sort_lowest_liquidity_first")
              }
              title={
                sortType === "recency"
                  ? sortOrder === "asc"
                    ? t("explore.currently_oldest_first")
                    : t("explore.currently_newest_first")
                  : sortOrder === "asc"
                    ? t("explore.currently_lowest_liquidity_first")
                    : t("explore.currently_highest_liquidity_first")
              }
              disabled={isLoading || isTransitioning}
            >
              {sortOrder === "asc" ? <ArrowUpAZ className="w-4 h-4 mr-1" /> : <ArrowDownAZ className="w-4 h-4 mr-1" />}
              <span className="hidden sm:inline">
                {sortType === "recency"
                  ? sortOrder === "asc"
                    ? t("explore.oldest")
                    : t("explore.newest")
                  : sortOrder === "asc"
                    ? t("explore.lowest")
                    : t("explore.highest")}
              </span>
            </button>
          )}

          {/* Search Bar */}
          {searchBar}

          {/* Enhanced loading indicator */}
          {isPending && (
            <div className="flex items-center ml-3">
              <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin mr-2"></div>
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
        className={`grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 sm:gap-3 min-h-[300px] ${isTransitioning ? "transition-opacity duration-300 opacity-50" : ""}`}
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
          <div className="col-span-3 sm:col-span-4 md:col-span-5 text-center py-8 text-muted-foreground">
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
              <span className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin mr-1"></span>
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
              <span className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin mr-1"></span>
            </span>
          ) : null}
          <span className={isTransitioning && direction === "next" ? "opacity-0" : ""}>{t("common.next")}</span>
        </button>
      </div>
    </div>
  );
};
