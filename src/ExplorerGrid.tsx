import { CoinCard } from "./components/CoinCard";
import { type CoinData } from "./hooks/metadata";
import { useEffect, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, Coins as CoinsIcon, ThumbsUp, Rocket } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LoadingLogo } from "./components/ui/loading-logo";

// Default page size
const PAGE_SIZE = 20;

// Sort type options
export type SortType = "liquidity" | "recency" | "votes" | "launch";

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

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [direction, setDirection] = useState<"next" | "prev" | null>(null);

  useEffect(() => {
    setIsTransitioning(false);
    setDirection(null);
  }, [coins, isLoading]);

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

  const isPending = isLoading || isTransitioning;

  return (
    <div className="w-full max-w-full p-0">
      {searchBar && (
        <div className="mb-4">
          {searchBar}
          {searchResults && <div className="mt-2 text-sm text-muted-foreground text-center">{searchResults}</div>}
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
          <h2 className="text-sm md:text-lg font-bold font-display uppercase tracking-wider">
            {total === 0
              ? t("explore.no_results")
              : total === 1
                ? `1 ${t("common.coin")}`
                : `${total} ${t("common.coins")}`}
          </h2>
        </div>

        {isPending && (
          <div className="flex items-center">
            <LoadingLogo size="sm" className="mr-2" />
            <span className="text-sm font-body">
              {isTransitioning
                ? direction === "next"
                  ? t("common.loading_next")
                  : t("common.loading_previous")
                : t("common.loading")}
            </span>
          </div>
        )}
      </div>

      <div className="mb-6">
        <div className="p-2 !mb-2 flex items-center justify-between flex-wrap gap-2">
          {onSortTypeChange && (
            <div className="flex">
              <button
                onClick={() => onSortTypeChange("liquidity")}
                className={`flex items-center !px-3 !py-2 text-sm font-medium ${
                  sortType === "liquidity"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 dark:text-foreground dark:hover:text-foreground"
                }`}
                title={t("common.sort_by", { field: t("common.liquidity") })}
                disabled={isLoading || isTransitioning}
              >
                <CoinsIcon className="w-4 h-4 mr-1" />
                {t("common.liquidity").toUpperCase()}
              </button>

              <button
                onClick={() => onSortTypeChange("recency")}
                className={`flex items-center px-3 py-2 text-sm font-medium ${
                  sortType === "recency"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 dark:text-foreground dark:hover:text-foreground"
                }`}
                title={t("common.sort_by", { field: t("explore.new") })}
                disabled={isLoading || isTransitioning}
              >
                <ArrowDownAZ className="w-4 h-4 mr-1" />
                {t("explore.new").toUpperCase()}
              </button>

              <button
                onClick={() => onSortTypeChange("votes")}
                className={`flex items-center px-3 py-2 text-sm font-medium ${
                  sortType === "votes"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 dark:text-foreground dark:hover:text-foreground"
                }`}
                title={t("common.sort_by", { field: t("common.votes") })}
                disabled={isLoading || isTransitioning}
              >
                <ThumbsUp className="w-4 h-4 mr-1" />
                {t("common.votes").toUpperCase()}
              </button>

              <button
                onClick={() => onSortTypeChange("launch")}
                className={`flex items-center px-3 py-2 text-sm font-medium ${
                  sortType === "launch"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 dark:text-foreground dark:hover:text-foreground"
                }`}
                title={t("common.sort_by", { field: t("explore.launch_sales") })}
                disabled={isLoading || isTransitioning}
              >
                <Rocket className="w-4 h-4 mr-1" />
                {t("explore.launch_sales").toUpperCase()}
              </button>
            </div>
          )}

          {onSortOrderChange && (
            <button
              onClick={() => onSortOrderChange(sortOrder === "asc" ? "desc" : "asc")}
              className="flex items-center px-3 py-2 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 dark:text-foreground dark:hover:text-foreground"
              title={
                sortType === "recency"
                  ? sortOrder === "asc"
                    ? t("explore.sort_order_oldest_first")
                    : t("explore.sort_order_newest_first")
                  : sortType === "votes"
                    ? sortOrder === "asc"
                      ? t("explore.sort_order_lowest_votes_first")
                      : t("explore.sort_order_highest_votes_first")
                    : sortOrder === "asc"
                      ? t("explore.sort_order_lowest_liquidity_first")
                      : t("explore.sort_order_highest_liquidity_first")
              }
              disabled={isLoading || isTransitioning}
            >
              {sortOrder === "asc" ? <ArrowUpAZ className="w-4 h-4 mr-1" /> : <ArrowDownAZ className="w-4 h-4 mr-1" />}
              {sortType === "recency"
                ? sortOrder === "asc"
                  ? t("explore.oldest").toUpperCase()
                  : t("explore.newest").toUpperCase()
                : sortType === "votes"
                  ? sortOrder === "asc"
                    ? t("explore.lowest").toUpperCase()
                    : t("explore.highest").toUpperCase()
                  : sortOrder === "asc"
                    ? t("explore.lowest").toUpperCase()
                    : t("explore.highest").toUpperCase()}
            </button>
          )}
        </div>
      </div>

      <div
        className={`grid grid-cols-3 gap-4 min-h-[300px] ${isTransitioning ? "transition-opacity duration-300 opacity-50" : ""}`}
      >
        {coins.map((coin) => (
          <div key={coin.coinId.toString()} className={isPending ? "opacity-60 pointer-events-none" : ""}>
            <CoinCard coin={coin} />
          </div>
        ))}

        {coins.length === 0 &&
          total > 0 &&
          !isSearchActive &&
          Array.from({ length: Math.min(total, PAGE_SIZE) }).map((_, index) => (
            <div
              key={`skeleton-${index}`}
              className="flex border-2 border-primary/30 rounded-md bg-secondary/30 w-full flex-col items-right p-1 gap-2 shadow h-32 animate-pulse"
            ></div>
          ))}

        {coins.length === 0 && isSearchActive && (
          <div className="col-span-full text-center py-8 text-muted-foreground">{t("explore.no_results")}</div>
        )}
      </div>

      <div className="flex justify-between items-center mt-6 mb-4">
        <button
          onClick={handlePrev}
          disabled={!canPrev || isPending}
          aria-label="Go to previous page"
          className={`relative px-5 py-3 text-sm font-bold uppercase min-w-[100px] bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80 transition-colors dark:text-foreground dark:hover:text-foreground ${
            !canPrev || isPending ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          {isTransitioning && direction === "prev" ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <LoadingLogo size="sm" className="scale-75" />
            </span>
          ) : null}
          <span className={isTransitioning && direction === "prev" ? "opacity-0" : ""}>{t("common.previous")}</span>
        </button>

        {total > 0 && !isSearchActive && (
          <span className="px-4 py-2 text-sm font-bold font-body bg-muted text-muted-foreground border border-border dark:text-foreground">
            {t("common.page")} {currentPage} {t("common.of")} {totalPages}
          </span>
        )}

        <button
          onClick={handleNext}
          disabled={!canNext || isPending}
          aria-label="Go to next page"
          className={`relative px-5 py-3 text-sm font-bold uppercase min-w-[100px] bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80 transition-colors dark:text-foreground dark:hover:text-foreground ${
            !canNext || isPending ? "opacity-50 cursor-not-allowed" : ""
          }`}
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
