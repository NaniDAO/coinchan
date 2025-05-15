import { useState, useCallback, useMemo } from "react";
import { ExplorerGrid } from "./ExplorerGrid";
import { usePagedCoins } from "./hooks/metadata";
import { debounce } from "./utils";
import { SearchIcon } from "lucide-react";

// Page size for pagination
const PAGE_SIZE = 20;

export const Coins = () => {
  /* ------------------------------------------------------------------
   *  Local state
   * ------------------------------------------------------------------ */
  const [searchQuery, setSearchQuery] = useState("");

  /* ------------------------------------------------------------------
   *  Paged & global coin data
   * ------------------------------------------------------------------ */
  const {
    coins,
    allCoins,
    total,
    page,
    totalPages,
    hasNext: hasNextPage,
    hasPrev: hasPreviousPage,
    goToNextPage,
    goToPreviousPage,
    isLoading,
  } = usePagedCoins(PAGE_SIZE);

  /* ------------------------------------------------------------------
   *  Search handling
   * ------------------------------------------------------------------ */
  // 1) memoize the trimmed query
  const trimmedQuery = useMemo(
    () => searchQuery.trim().toLowerCase(),
    [searchQuery],
  );

  // 2) derive `searchResults` (and "active" flag) purely from inputs
  const searchResults = useMemo(() => {
    if (!trimmedQuery) return [];

    // Use the full dataset when it's loaded, fall back to paged data while waiting
    const dataToSearch = allCoins && allCoins.length > 0 ? allCoins : coins;

    return dataToSearch.filter((coin) => {
      // Split the search query into words for multi-term searching
      const searchTerms = trimmedQuery
        .split(/\s+/)
        .filter((term) => term.length > 0);

      // If no valid search terms, return empty results
      if (searchTerms.length === 0) return false;

      // Check each property with null/undefined handling
      const coinId = String(coin.coinId || "");
      const symbol = (coin.symbol || "").toLowerCase();
      const name = (coin.name || "").toLowerCase();
      const description = (coin.description || "").toLowerCase();

      // Check if ALL search terms match at least one property (AND logic between terms)
      return searchTerms.every((term) => {
        return (
          coinId.includes(term) ||
          symbol.includes(term) ||
          name.includes(term) ||
          description.includes(term) ||
          // Add fuzzy matching for common symbols
          symbol.replace(/[^a-z0-9]/g, "").includes(term) ||
          // Match word boundaries in name and description
          name.match(new RegExp(`\\b${term}`, "i")) ||
          description.match(new RegExp(`\\b${term}`, "i"))
        );
      });
    });
  }, [trimmedQuery, allCoins, coins]);

  const isSearchActive = Boolean(trimmedQuery);

  const resetSearch = useCallback(() => {
    setSearchQuery("");
  }, []);

  /* ------------------------------------------------------------------
   *  Debounced pagination handlers to prevent rapid clicks
   * ------------------------------------------------------------------ */
  const debouncedNextPage = useMemo(
    () => debounce(goToNextPage, 350),
    [goToNextPage],
  );

  const debouncedPrevPage = useMemo(
    () => debounce(goToPreviousPage, 350),
    [goToPreviousPage],
  );

  /* ------------------------------------------------------------------
   *  Data for ExplorerGrid
   * ------------------------------------------------------------------ */
  const displayCoins = isSearchActive ? searchResults : coins;

  /* ------------------------------------------------------------------
   *  Render – trade view OR explorer grid
   * ------------------------------------------------------------------ */
  return (
    <>
      {/* Main grid with search bar passed as prop */}
      <ExplorerGrid
        coins={displayCoins}
        total={isSearchActive ? searchResults.length : total}
        canPrev={!isSearchActive && hasPreviousPage}
        canNext={!isSearchActive && hasNextPage}
        onPrev={debouncedPrevPage}
        onNext={debouncedNextPage}
        isLoading={isLoading}
        currentPage={page + 1}
        totalPages={totalPages}
        isSearchActive={isSearchActive}
        searchBar={
          <div className="relative">
            <input
              type="text"
              placeholder="Search by symbol or ID…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-56 p-1 pl-7 border border-primary rounded-md focus:outline-none focus:ring-1 focus:ring-accent text-sm"
            />
            {searchQuery && (
              <button
                onClick={resetSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          </div>
        }
        searchResults={
          isSearchActive
            ? `Showing ${searchResults.length} result${searchResults.length !== 1 ? "s" : ""}`
            : ""
        }
      />
    </>
  );
};

export default Coins;
