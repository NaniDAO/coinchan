import { useState, useCallback, useMemo } from "react";
import { ExplorerGrid } from "./ExplorerGrid";
import { usePagedCoins } from "./hooks/metadata";
import { useCoinsData } from "./hooks/metadata/use-coins-data";
import { useChronologicalCoins } from "./hooks/use-chronological-coins";
import { SearchIcon } from "lucide-react";
import { CoinData } from "./hooks/metadata/coin-utils";
import { debounce } from "./lib/utils";
import { useTranslation } from "react-i18next";

// Page size for pagination
const PAGE_SIZE = 20;

export const Coins = () => {
  const { t } = useTranslation();

  /* ------------------------------------------------------------------
   *  Local state
   * ------------------------------------------------------------------ */
  const [searchQuery, setSearchQuery] = useState("");
  const [sortType, setSortType] = useState<"liquidity" | "recency">("liquidity");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  /* ------------------------------------------------------------------
   *  Paged & global coin data
   * ------------------------------------------------------------------ */
  const { coins, allCoins, page, goToNextPage, isLoading, setPage } = usePagedCoins(PAGE_SIZE);

  /* ------------------------------------------------------------------
   *  Search handling
   * ------------------------------------------------------------------ */
  // 1) memoize the trimmed query
  const trimmedQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);

  // 2) derive `searchResults` (and "active" flag) purely from inputs
  const searchResults = useMemo(() => {
    if (!trimmedQuery) return [];

    // Use the full dataset when it's loaded, fall back to paged data while waiting
    const dataToSearch = allCoins && allCoins.length > 0 ? allCoins : coins;

    return dataToSearch.filter((coin) => {
      // Split the search query into words for multi-term searching
      const searchTerms = trimmedQuery.split(/\s+/).filter((term) => term.length > 0);

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
          symbol
            .replace(/[^a-z0-9]/g, "")
            .includes(term) ||
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
  const debouncedNextPage = useMemo(() => debounce(goToNextPage, 350), [goToNextPage]);

  // Fix for previous page bug - force setting the page directly to ensure correct navigation
  const debouncedPrevPage = useMemo(
    () =>
      debounce(() => {
        if (page > 0) {
          setPage(page - 1);
        }
      }, 350),
    [page, setPage],
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

  const handleSortTypeChange = useCallback(
    (newSortType: "liquidity" | "recency") => {
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
    },
    [sortType, setPage, chronologicalCoinIds, refetchChronologicalData],
  );

  const handleSortOrderChange = useCallback((newSortOrder: "asc" | "desc") => {
    setSortOrder(newSortOrder);
  }, []);

  /* ------------------------------------------------------------------
   *  Apply sorting to coins based on sort type and order
   * ------------------------------------------------------------------ */
  const sortCoins = useCallback(
    (coinsToSort: CoinData[]): CoinData[] => {
      if (!coinsToSort || coinsToSort.length === 0) return [];

      // Filter out invalid coins (with ID 0 or undefined/null IDs)
      // This prevents the "Token 0" issue by removing problematic entries
      const validCoins = coinsToSort.filter(
        (coin) => coin && coin.coinId !== undefined && coin.coinId !== null && Number(coin.coinId) > 0, // Explicitly exclude ID 0
      );

      // If all coins were filtered out, return empty array
      if (validCoins.length === 0) return [];

      // Always create a copy to avoid mutating the original array
      const coinsCopy = [...validCoins];

      if (sortType === "liquidity") {
        // Sort by ETH liquidity (reserve0)
        // Note: The indexer already returns data sorted by reserve0 in descending order,
        // but we re-sort here to ensure consistency and to handle the ascending case
        return coinsCopy.sort((a, b) => {
          // Safely convert to numbers, handling potential null/undefined values
          const aLiquidity = a?.reserve0 ? Number(a.reserve0) : 0;
          const bLiquidity = b?.reserve0 ? Number(b.reserve0) : 0;

          // If liquidity values are identical, use coinId as secondary sort
          if (aLiquidity === bLiquidity) {
            const aId = Number(a.coinId);
            const bId = Number(b.coinId);
            return bId - aId; // Secondary sort by coinId (newest first)
          }

          return sortOrder === "asc"
            ? aLiquidity - bLiquidity // Ascending (lowest liquidity first)
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
            // Skip undefined or zero IDs
            if (id !== undefined && id > 0n) {
              chronologicalMap.set(String(id), index);
            }
          });

          return coinsCopy.sort((a, b) => {
            // This check should be redundant due to filtering above,
            // but keeping it for extra safety
            if (!a?.coinId || !b?.coinId || Number(a.coinId) === 0 || Number(b.coinId) === 0) {
              return 0;
            }

            // Get the chronological positions (or high value as fallback)
            const aIndex = chronologicalMap.get(String(a.coinId)) ?? Number.MAX_SAFE_INTEGER;
            const bIndex = chronologicalMap.get(String(b.coinId)) ?? Number.MAX_SAFE_INTEGER;

            // Sort by chronological index, with ascending/descending option
            return sortOrder === "asc"
              ? aIndex - bIndex // Ascending (oldest first - lower index)
              : bIndex - aIndex; // Descending (newest first - higher index)
          });
        }
        // 2. Fallback to numeric coinId comparison if chronological data isn't available
        else {
          return coinsCopy.sort((a, b) => {
            // This check should be redundant due to filtering above
            if (!a?.coinId || !b?.coinId || Number(a.coinId) === 0 || Number(b.coinId) === 0) {
              return 0;
            }

            const aId = Number(a.coinId);
            const bId = Number(b.coinId);

            return sortOrder === "asc"
              ? aId - bId // Ascending (oldest first - assuming lower IDs are older)
              : bId - aId; // Descending (newest first - assuming higher IDs are newer)
          });
        }
      }
    },
    [sortType, sortOrder, chronologicalCoinIds],
  );

  /* ------------------------------------------------------------------
   *  Helper to filter out invalid coins (like Token 0)
   * ------------------------------------------------------------------ */
  const filterValidCoins = useCallback((coinsList: CoinData[]): CoinData[] => {
    return coinsList.filter(
      (coin) => coin && coin.coinId !== undefined && coin.coinId !== null && Number(coin.coinId) > 0, // Exclude ID 0 and any negative IDs
    );
  }, []);

  /* ------------------------------------------------------------------
   *  Data for ExplorerGrid
   * ------------------------------------------------------------------ */
  const displayCoins = useMemo(() => {
    // Safety checks for undefined data and filter out invalid coins
    const validCoins = filterValidCoins(coins || []);
    const validAllCoins = filterValidCoins(allCoinsUnpaged || []);
    const validSearchResults = filterValidCoins(searchResults || []);

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

    // Final safety check to ensure no invalid coins make it to the display
    return result.filter((coin) => coin && Number(coin.coinId) > 0);
  }, [
    isSearchActive,
    searchResults,
    sortType,
    sortOrder,
    allCoinsUnpaged,
    coins,
    sortCoins,
    page,
    PAGE_SIZE,
    filterValidCoins,
  ]);

  /* ------------------------------------------------------------------
   *  Render – trade view OR explorer grid
   * ------------------------------------------------------------------ */
  return (
    <>
      {/* Main grid with search bar passed as prop */}
      <ExplorerGrid
        coins={displayCoins}
        total={
          isSearchActive
            ? filterValidCoins(searchResults || []).length
            : filterValidCoins(sortType === "recency" ? allCoinsUnpaged || [] : allCoins || []).length
        }
        canPrev={!isSearchActive && page > 0}
        canNext={
          !isSearchActive &&
          (page + 1) * PAGE_SIZE <
            filterValidCoins(sortType === "recency" ? allCoinsUnpaged || [] : allCoins || []).length
        }
        onPrev={debouncedPrevPage}
        onNext={debouncedNextPage}
        isLoading={isLoading || (sortType === "recency" && isChronologicalLoading)}
        currentPage={page + 1}
        totalPages={Math.max(
          1,
          Math.ceil(
            (isSearchActive
              ? filterValidCoins(searchResults || []).length
              : filterValidCoins(sortType === "recency" ? allCoinsUnpaged || [] : allCoins || []).length) / PAGE_SIZE,
          ),
        )}
        isSearchActive={isSearchActive}
        sortType={sortType}
        sortOrder={sortOrder}
        onSortTypeChange={handleSortTypeChange}
        onSortOrderChange={handleSortOrderChange}
        /* Unused variables removed from usePagedCoins destructuring:
         * - total (replaced with direct filtered counts)
         * - totalPages
         * - hasNext (renamed to hasNextPage)
         * - hasPrev (renamed to hasPreviousPage)
         */
        searchBar={
          <div className="relative">
            <input
              type="text"
              placeholder={t("tokenSelector.search_tokens")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-56 p-1 pl-7 border border-primary rounded-md focus:outline-none focus:ring-1 focus:ring-accent text-sm"
            />
            {searchQuery && (
              <button
                onClick={resetSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 hover:text-gray-600"
                aria-label={t("common.cancel")}
              >
                ✕
              </button>
            )}
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          </div>
        }
        searchResults={
          isSearchActive
            ? `${t("common.showing")} ${searchResults.length} ${searchResults.length !== 1 ? t("common.results") : t("common.result")}`
            : ""
        }
      />
    </>
  );
};

export default Coins;
