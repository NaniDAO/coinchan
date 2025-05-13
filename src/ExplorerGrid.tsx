import { Link } from "@tanstack/react-router";
import { CoinCard } from "./components/CoinCard";
import { type CoinData } from "./hooks/metadata";
import { useEffect, useState } from "react";

// Default page size
const PAGE_SIZE = 20;

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
}) => {
  // Track page transition state for better UX
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [direction, setDirection] = useState<"next" | "prev" | null>(null);

  // Reset transition state when coins change
  useEffect(() => {
    setIsTransitioning(false);
    setDirection(null);
  }, [coins]);

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
          <h2 className="text-lg sm:text-xl font-semibold text-center sm:text-left">
            {total === 0
              ? "NO COINS DEPLOYED"
              : total === 1
                ? "1 COIN DEPLOYED"
                : `${total} COINS DEPLOYED`}
          </h2>

          {searchResults && (
            <div className="ml-4 text-sm text-gray-500">{searchResults}</div>
          )}
        </div>

        <div className="flex items-center">
          {/* Search Bar */}
          {searchBar}

          {/* Enhanced loading indicator */}
          {isPending && (
            <div className="flex items-center ml-3">
              <div className="w-4 h-4 rounded-full border-2 border-red-500 border-t-transparent animate-spin mr-2"></div>
              <span className="text-sm text-red-500">
                {isTransitioning
                  ? direction === "next"
                    ? "Loading next page..."
                    : "Loading previous page..."
                  : "Loading..."}
              </span>
            </div>
          )}
        </div>
      </div>

      <div
        className={`grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 sm:gap-3 min-h-[300px] ${isTransitioning ? "transition-opacity duration-300 opacity-50" : ""}`}
      >
        {coins.map((coin) => (
          <div
            key={coin.coinId.toString()}
            className={isPending ? "opacity-60 pointer-events-none" : ""}
          >
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
              className="flex border-2 border-red-900/30 rounded-md bg-yellow-50/50 w-full flex-col items-right p-1 gap-2 shadow h-32 animate-pulse"
            ></div>
          ))}

        {/* Show message when no search results */}
        {coins.length === 0 && isSearchActive && (
          <div className="col-span-3 sm:col-span-4 md:col-span-5 text-center py-8 text-gray-500">
            No coins found matching your search
          </div>
        )}
      </div>

      <div className="pagination-buttons flex justify-between items-center mt-6 mb-4">
        <button
          onClick={handlePrev}
          disabled={!canPrev || isPending}
          aria-label="Go to previous page"
          className={`px-4 py-2 rounded-md border border-red-300 hover:bg-red-50 touch-manipulation
            ${!canPrev || isPending ? "text-gray-400 opacity-50 cursor-not-allowed" : "text-red-500 font-bold"}
            ${isTransitioning && direction === "prev" ? "relative bg-red-50" : ""}
          `}
        >
          {isTransitioning && direction === "prev" ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="w-3 h-3 rounded-full border-2 border-red-500 border-t-transparent animate-spin mr-1"></span>
            </span>
          ) : null}
          <span
            className={
              isTransitioning && direction === "prev" ? "opacity-0" : ""
            }
          >
            Previous
          </span>
        </button>

        {/* Page info from parent */}
        {total > 0 && !isSearchActive && (
          <span className="text-sm text-gray-500">
            Page {currentPage} of {totalPages}
          </span>
        )}

        <button
          onClick={handleNext}
          disabled={!canNext || isPending}
          aria-label="Go to next page"
          className={`px-4 py-2 rounded-md border border-red-300 hover:bg-red-50 touch-manipulation
            ${!canNext || isPending ? "text-gray-400 opacity-50 cursor-not-allowed" : "text-red-500 font-bold"}
            ${isTransitioning && direction === "next" ? "relative bg-red-50" : ""}
          `}
        >
          {isTransitioning && direction === "next" ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="w-3 h-3 rounded-full border-2 border-red-500 border-t-transparent animate-spin mr-1"></span>
            </span>
          ) : null}
          <span
            className={
              isTransitioning && direction === "next" ? "opacity-0" : ""
            }
          >
            Next
          </span>
        </button>
      </div>
    </div>
  );
};
