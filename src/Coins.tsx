import { useState, useCallback, useMemo } from "react";
import { ExplorerGrid } from "./ExplorerGrid";
import { usePagedCoins } from "./hooks/metadata";
import { useCoinsData } from "./hooks/metadata/use-coins-data";
import { useChronologicalCoins } from "./hooks/use-chronological-coins";
import { debounce } from "./utils";
import { SearchIcon } from "lucide-react";
import { CoinData } from "./hooks/metadata/coin-utils";

// Page size for pagination
const PAGE_SIZE = 20;

export const Coins = () => {
  /* ------------------------------------------------------------------
   *  Local state
   * ------------------------------------------------------------------ */
  const [searchQuery, setSearchQuery] = useState("");
  const [sortType, setSortType] = useState<"liquidity" | "recency">("liquidity");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

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
    setPage,
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
   *  Get all coins for sorting
   * ------------------------------------------------------------------ */
  const { data: allCoinsUnpaged = [] } = useCoinsData();

  /* ------------------------------------------------------------------
   *  Get chronological coin IDs directly from the contract for accurate recency sorting
   * ------------------------------------------------------------------ */
  const { data: chronologicalCoinIds = [], isLoading: isChronologicalLoading } = useChronologicalCoins();

  /* ------------------------------------------------------------------
   *  Sorting handlers
   * ------------------------------------------------------------------ */
  // Function to ensure we have chronological data
  const { refetch: refetchChronologicalData } = useChronologicalCoins();
  
  const handleSortTypeChange = useCallback((newSortType: "liquidity" | "recency") => {
    setSortType(newSortType);
    // Reset to page 1 when changing sort type
    if (sortType !== newSortType) {
      setPage(0);
      
      // If switching to recency sort type, ensure we have the chronological data
      if (newSortType === "recency" && (!chronologicalCoinIds || chronologicalCoinIds.length === 0)) {
        // Explicitly trigger a refetch to ensure we have the data
        refetchChronologicalData();
      }
    }
  }, [sortType, setPage, chronologicalCoinIds, refetchChronologicalData]);

  const handleSortOrderChange = useCallback((newSortOrder: "asc" | "desc") => {
    setSortOrder(newSortOrder);
  }, []);

  /* ------------------------------------------------------------------
   *  Apply sorting to coins based on sort type and order
   * ------------------------------------------------------------------ */
  const sortCoins = useCallback(
    (coinsToSort: CoinData[]): CoinData[] => {
      if (!coinsToSort || coinsToSort.length === 0) return [];
      
      // Always create a copy to avoid mutating the original array
      const coinsCopy = [...coinsToSort];

      if (sortType === "liquidity") {
        // Sort by ETH liquidity (reserve0)
        // Note: The indexer already returns data sorted by reserve0 in descending order,
        // but we re-sort here to ensure consistency and to handle the ascending case
        return coinsCopy.sort((a, b) => {
          // Safely convert to numbers, handling potential null/undefined values
          const aLiquidity = a?.reserve0 ? Number(a.reserve0) : 0;
          const bLiquidity = b?.reserve0 ? Number(b.reserve0) : 0;
          
          return sortOrder === "asc"
            ? aLiquidity - bLiquidity  // Ascending (lowest liquidity first)
            : bLiquidity - aLiquidity; // Descending (highest liquidity first)
        });
      } else {
        // For recency sorting, there are two approaches:
        
        // 1. If we have chronological data from the contract, use that for accurate ordering
        if (chronologicalCoinIds && chronologicalCoinIds.length > 0) {
          // Create a map of coinId -> index in the chronological array
          // This gives us the true chronological position of each coin
          const chronologicalMap = new Map<string, number>();
          chronologicalCoinIds.forEach((id, index) => {
            if (id !== undefined) {
              chronologicalMap.set(String(id), index);
            }
          });
          
          return coinsCopy.sort((a, b) => {
            if (!a?.coinId || !b?.coinId) return 0;
            
            // Get the chronological positions (or high value as fallback)
            const aIndex = chronologicalMap.get(String(a.coinId)) ?? Number.MAX_SAFE_INTEGER;
            const bIndex = chronologicalMap.get(String(b.coinId)) ?? Number.MAX_SAFE_INTEGER;
            
            // Sort by chronological index, with ascending/descending option
            return sortOrder === "asc" 
              ? aIndex - bIndex  // Ascending (oldest first - lower index)
              : bIndex - aIndex; // Descending (newest first - higher index)
          });
        } 
        // 2. Fallback to numeric coinId comparison if chronological data isn't available
        else {
          return coinsCopy.sort((a, b) => {
            if (!a?.coinId || !b?.coinId) return 0;
            
            const aId = Number(a.coinId);
            const bId = Number(b.coinId);
            
            return sortOrder === "asc" 
              ? aId - bId  // Ascending (oldest first - assuming lower IDs are older)
              : bId - aId; // Descending (newest first - assuming higher IDs are newer)
          });
        }
      }
    },
    [sortType, sortOrder, chronologicalCoinIds]
  );

  /* ------------------------------------------------------------------
   *  Data for ExplorerGrid
   * ------------------------------------------------------------------ */
  const displayCoins = useMemo(() => {
    // Safety checks for undefined data
    const validCoins = coins || [];
    const validAllCoins = allCoinsUnpaged || [];
    const validSearchResults = searchResults || [];
    
    // Calculate starting and ending indices for pagination
    const startIdx = page * PAGE_SIZE;
    const endIdx = startIdx + PAGE_SIZE;
    
    let result: CoinData[] = [];
    
    if (isSearchActive) {
      // For search results, apply sorting to the search results
      const sortedResults = sortCoins(validSearchResults);
      
      // Paginate search results if there are many of them (optional)
      if (sortedResults.length > PAGE_SIZE * 2) {
        result = sortedResults.slice(startIdx, endIdx);
      } else {
        result = sortedResults;
      }
    } else {
      // For both recency and liquidity sorting, use the complete dataset for consistent sorting
      if (validAllCoins.length > 0) {
        // Apply sorting to the complete dataset
        const allSorted = sortCoins(validAllCoins);
        // Paginate the sorted results
        result = allSorted.slice(startIdx, endIdx);
      } else {
        // Fallback to paginated data if full dataset isn't available yet
        // This ensures we at least have something to display while loading
        result = sortCoins(validCoins);
      }
    }
    
    return result;
  }, [isSearchActive, searchResults, sortType, sortOrder, allCoinsUnpaged, coins, sortCoins, page, PAGE_SIZE]);

  /* ------------------------------------------------------------------
   *  Render – trade view OR explorer grid
   * ------------------------------------------------------------------ */
  return (
    <>
      {/* Main grid with search bar passed as prop */}
      <ExplorerGrid
        coins={displayCoins}
        total={isSearchActive ? (searchResults?.length || 0) : (total || 0)}
        canPrev={!isSearchActive && page > 0}
        canNext={!isSearchActive && ((page + 1) * PAGE_SIZE < ((sortType === "recency" ? allCoinsUnpaged?.length : total) || 0))}
        onPrev={debouncedPrevPage}
        onNext={debouncedNextPage}
        isLoading={isLoading || (sortType === "recency" && isChronologicalLoading)}
        currentPage={page + 1}
        totalPages={Math.max(1, Math.ceil(((sortType === "recency" ? allCoinsUnpaged?.length : total) || 0) / PAGE_SIZE))}
        isSearchActive={isSearchActive}
        sortType={sortType}
        sortOrder={sortOrder}
        onSortTypeChange={handleSortTypeChange}
        onSortOrderChange={handleSortOrderChange}
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
