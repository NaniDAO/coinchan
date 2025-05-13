import { useState, useEffect, useCallback, useMemo } from "react";
import { ExplorerGrid } from "./ExplorerGrid";
import { usePagedCoins } from "./hooks/metadata";
import { useGlobalCoinsData, type CoinData } from "./hooks/metadata";
import { debounce } from "./utils";
import { SearchIcon } from "lucide-react";

// Page size for pagination
const PAGE_SIZE = 20;

export const Coins = ({ onSend }: { onSend?: () => void }) => {
  /* ------------------------------------------------------------------
   *  Local state
   * ------------------------------------------------------------------ */
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CoinData[]>([]);
  const [isSearchActive, setIsSearchActive] = useState(false);

  /* ------------------------------------------------------------------
   *  Paged & global coin data
   * ------------------------------------------------------------------ */
  const {
    coins,
    total,
    page,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    goToNextPage,
    goToPreviousPage,
    isLoading,
  } = usePagedCoins(PAGE_SIZE);

  const { allCoins, isLoading: isGlobalLoading } = useGlobalCoinsData();

  /* ------------------------------------------------------------------
   *  Search handling
   * ------------------------------------------------------------------ */
  useEffect(() => {
    const trimmed = searchQuery.trim().toLowerCase();

    if (!trimmed) {
      setSearchResults([]);
      setIsSearchActive(false);
      return;
    }

    setIsSearchActive(true);

    // Use the full dataset when it’s loaded, fall back to paged data while waiting
    const dataToSearch = allCoins && allCoins.length > 0 ? allCoins : coins;

    const results = dataToSearch.filter((coin) => {
      if (coin.coinId.toString().includes(trimmed)) return true;
      if (coin.symbol && coin.symbol.toLowerCase().includes(trimmed))
        return true;
      if (coin.name && coin.name.toLowerCase().includes(trimmed)) return true;
      return false;
    });

    setSearchResults(results);
  }, [searchQuery, allCoins, coins]);

  const resetSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setIsSearchActive(false);
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
        isLoading={isLoading || (isSearchActive && isGlobalLoading)}
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
              className="w-full sm:w-56 p-1 pl-7 border border-red-300 rounded-md focus:outline-none focus:ring-1 focus:ring-red-500 text-sm"
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
