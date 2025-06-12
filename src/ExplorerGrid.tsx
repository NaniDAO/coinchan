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
    <div className="w-full max-w-full" style={{ padding: '0' }}>
      {/* Search Bar Section */}
      {searchBar && (
        <div className="mb-4">
          {searchBar}
          {searchResults && (
            <div className="mt-2 text-sm text-muted-foreground text-center">
              {searchResults}
            </div>
          )}
        </div>
      )}

      {/* Results Count and Loading */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
          <h2 className="text-sm md:text-lg font-bold" style={{ 
            fontFamily: 'var(--font-display)',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>
            {total === 0
              ? t("explore.no_results")
              : total === 1
                ? `1 ${t("common.coin")}`
                : `${total} ${t("common.coins")}`}
          </h2>
        </div>

        {/* Loading indicator */}
        {isPending && (
          <div className="flex items-center">
            <LoadingLogo size="sm" className="mr-2" />
            <span className="text-sm" style={{ fontFamily: 'var(--font-body)' }}>
              {isTransitioning
                ? direction === "next"
                  ? t("common.loading_next")
                  : t("common.loading_previous")
                : t("common.loading")}
            </span>
          </div>
        )}
      </div>

      {/* Filter Tabs Section - Terminal Style */}
      <div className="filter-nav-bar mb-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          {/* Sort Type Tabs */}
          {onSortTypeChange && (
            <div className="flex">
              <button
                onClick={() => onSortTypeChange("liquidity")}
                className={`nav-item ${sortType === "liquidity" ? "active" : ""}`}
                title={t("common.sort_by", { field: t("common.liquidity") })}
                disabled={isLoading || isTransitioning}
              >
                <CoinsIcon className="w-4 h-4 mr-1" />
                LIQUIDITY
              </button>
              
              <button
                onClick={() => onSortTypeChange("recency")}
                className={`nav-item ${sortType === "recency" ? "active" : ""}`}
                title={t("common.sort_by", { field: t("explore.new") })}
                disabled={isLoading || isTransitioning}
              >
                <ArrowDownAZ className="w-4 h-4 mr-1" />
                NEW
              </button>
              
              <button
                onClick={() => onSortTypeChange("votes")}
                className={`nav-item ${sortType === "votes" ? "active" : ""}`}
                title={t("common.sort_by", { field: t("common.votes") })}
                disabled={isLoading || isTransitioning}
              >
                <ThumbsUp className="w-4 h-4 mr-1" />
                VOTES
              </button>
            </div>
          )}

          {/* Sort Order Button */}
          {onSortOrderChange && (
            <button
              onClick={() => onSortOrderChange(sortOrder === "asc" ? "desc" : "asc")}
              className="button"
              style={{ fontSize: '12px', padding: '6px 12px' }}
              title={
                sortType === "recency"
                  ? sortOrder === "asc" ? "Currently: Oldest first" : "Currently: Newest first"
                  : sortType === "votes"
                    ? sortOrder === "asc" ? "Currently: Lowest votes first" : "Currently: Highest votes first"
                    : sortOrder === "asc" ? "Currently: Lowest liquidity first" : "Currently: Highest liquidity first"
              }
              disabled={isLoading || isTransitioning}
            >
              {sortOrder === "asc" ? <ArrowUpAZ className="w-4 h-4 mr-1" /> : <ArrowDownAZ className="w-4 h-4 mr-1" />}
              {sortType === "recency"
                ? sortOrder === "asc" ? "OLDEST" : "NEWEST"
                : sortType === "votes"
                  ? sortOrder === "asc" ? "LOWEST" : "HIGHEST"
                  : sortOrder === "asc" ? "LOWEST" : "HIGHEST"}
            </button>
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
          className="button touch-manipulation relative"
          style={{
            padding: '12px 20px',
            fontSize: '14px',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            opacity: (!canPrev || isPending) ? '0.5' : '1',
            cursor: (!canPrev || isPending) ? 'not-allowed' : 'pointer',
            minWidth: '100px'
          }}
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
          <span 
            className="text-sm font-bold"
            style={{
              fontFamily: 'var(--font-body)',
              color: 'var(--terminal-black)',
              padding: '8px 16px',
              background: 'var(--terminal-gray)',
              border: '1px solid var(--terminal-black)'
            }}
          >
            {t("common.page")} {currentPage} {t("common.of")} {totalPages}
          </span>
        )}

        <button
          onClick={handleNext}
          disabled={!canNext || isPending}
          aria-label="Go to next page"
          className="button touch-manipulation relative"
          style={{
            padding: '12px 20px',
            fontSize: '14px',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            opacity: (!canNext || isPending) ? '0.5' : '1',
            cursor: (!canNext || isPending) ? 'not-allowed' : 'pointer',
            minWidth: '100px'
          }}
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
