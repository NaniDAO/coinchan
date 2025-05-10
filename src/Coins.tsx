import { useState, useEffect, useCallback, useMemo } from "react";
import { ExplorerGrid } from "./ExplorerGrid";
import { TradeView } from "./TradeView";
import { usePagedCoins } from "./hooks/metadata";
import { useGlobalCoinsData, type CoinData } from "./hooks/metadata";
import { debounce } from "./utils";

// Page size for pagination
const PAGE_SIZE = 20;

export const Coins = () => {
  /* ------------------------------------------------------------------
   *  Local state
   * ------------------------------------------------------------------ */
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CoinData[]>([]);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState<bigint | null>(null);

  /* ------------------------------------------------------------------
   *  Paged & global coin data
   * ------------------------------------------------------------------ */
  const { coins, total, page, totalPages, hasNextPage, hasPreviousPage, goToNextPage, goToPreviousPage, isLoading } =
    usePagedCoins(PAGE_SIZE);

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
      if (coin.symbol && coin.symbol.toLowerCase().includes(trimmed)) return true;
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
   *  Navigation helpers
   * ------------------------------------------------------------------ */
  const openTrade = (id: bigint) => {
    setSelectedTokenId(id);
    resetSearch();
  };

  const closeTrade = () => {
    setSelectedTokenId(null);
  };

  /* ------------------------------------------------------------------
   *  Debounced pagination handlers to prevent rapid clicks
   * ------------------------------------------------------------------ */
  const debouncedNextPage = useMemo(() => debounce(goToNextPage, 350), [goToNextPage]);

  const debouncedPrevPage = useMemo(() => debounce(goToPreviousPage, 350), [goToPreviousPage]);

  /* ------------------------------------------------------------------
   *  Trade view (moved out of conditional return)
   * ------------------------------------------------------------------ */
  // Keeping hook execution consistent in React components.
  const tradeView = selectedTokenId !== null ? <TradeView tokenId={selectedTokenId} onBack={closeTrade} /> : null;

  /* ------------------------------------------------------------------
   *  Data for ExplorerGrid
   * ------------------------------------------------------------------ */
  const displayCoins = isSearchActive ? searchResults : coins;

  /* ------------------------------------------------------------------
   *  Debug logging
   * ------------------------------------------------------------------ */
  console.log(`Coins component: ${coins.length} coins • page ${page + 1}/${totalPages}`);
  if (isSearchActive) {
    console.log(`Search mode: ${searchResults.length} results for “${searchQuery}”`);
  }

  /* ------------------------------------------------------------------
   *  Render – trade view OR explorer grid
   * ------------------------------------------------------------------ */
  return (
    tradeView || (
      <>
        {/* Main grid with search bar passed as prop */}
        <ExplorerGrid
          coins={displayCoins}
          total={isSearchActive ? searchResults.length : total}
          canPrev={!isSearchActive && hasPreviousPage}
          canNext={!isSearchActive && hasNextPage}
          onPrev={debouncedPrevPage}
          onNext={debouncedNextPage}
          onTrade={openTrade}
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
              <svg
                className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          }
          searchResults={
            isSearchActive ? `Showing ${searchResults.length} result${searchResults.length !== 1 ? "s" : ""}` : ""
          }
        />
      </>
    )
  );
};

export default Coins;
