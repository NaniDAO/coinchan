import { SearchIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEther } from "viem";
import { ExplorerGrid, type SortType } from "./ExplorerGrid";
import { usePagedCoins } from "./hooks/metadata";
import type { CoinData } from "./hooks/metadata/coin-utils";
import { useCoinsData } from "./hooks/metadata/use-coins-data";
import { useLaunchSalesDeadlines } from "./hooks/use-launch-sales-deadlines";
import { debounce } from "./lib/utils";

// Page size for pagination
const PAGE_SIZE = 20;

// Helper function to check if a coin should appear in Launch Sales tab
const shouldShowInLaunchSales = (coin: CoinData): boolean => {
  // Show coins that have any sale status (ACTIVE, EXPIRED, FINALIZED)
  return coin.saleStatus !== null && coin.saleStatus !== undefined;
};

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Helper function to check if an ACTIVE sale should be filtered out due to expiration
const shouldFilterExpiredActiveSale = (
  coin: CoinData,
  saleDeadlines: Map<string, number>,
): boolean => {
  // Only check ACTIVE sales for deadline expiration
  if (coin.saleStatus !== "ACTIVE") {
    return false; // Don't filter non-active sales here
  }

  // For active sales, check if deadline has expired (implicitly expired)
  const coinId = coin.coinId.toString();
  const deadlineLast = saleDeadlines.get(coinId);

  if (deadlineLast) {
    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    return deadlineLast <= now; // Filter out if deadline has passed
  }

  // If no deadline info available for active sale, keep it
  return false;
};

// Helper function to get filtered launch sales data for pagination
const getFilteredLaunchSales = (
  coins: CoinData[],
  saleDeadlines: Map<string, number>,
): CoinData[] => {
  // First filter to include only coins that should appear in Launch Sales
  const launchSalesCoins = coins.filter((coin) =>
    shouldShowInLaunchSales(coin),
  );

  // Then filter out expired active sales based on deadlines
  return launchSalesCoins.filter(
    (coin) => !shouldFilterExpiredActiveSale(coin, saleDeadlines || new Map()),
  );
};

export const Coins = () => {
  const { t } = useTranslation();

  /* ------------------------------------------------------------------
   *  Local state
   * ------------------------------------------------------------------ */
  const [searchQuery, setSearchQuery] = useState("");
  const [sortType, setSortType] = useState<SortType>("liquidity");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  /* ------------------------------------------------------------------
   *  Paged & global coin data
   * ------------------------------------------------------------------ */
  const { coins, allCoins, page, goToNextPage, isLoading, setPage } =
    usePagedCoins(PAGE_SIZE);

  /* ------------------------------------------------------------------
   *  Launch sales deadline data (for filtering expired sales)
   * ------------------------------------------------------------------ */
  const { data: saleDeadlines } = useLaunchSalesDeadlines();

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
        const escapedTerm = escapeRegExp(term);
        return (
          coinId.includes(term) ||
          symbol.includes(term) ||
          name.includes(term) ||
          description.includes(term) ||
          symbol.replace(/[^a-z0-9]/g, "").includes(term) ||
          name.match(new RegExp(`\\b${escapedTerm}`, "i")) ||
          description.match(new RegExp(`\\b${escapedTerm}`, "i"))
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
   *  Sorting handlers
   * ------------------------------------------------------------------ */
  const handleSortTypeChange = useCallback(
    (newSortType: SortType) => {
      setSortType(newSortType);
      // Reset to page 1 when changing sort type
      if (sortType !== newSortType) {
        setPage(0);
      }
    },
    [sortType, setPage],
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
        (coin) =>
          coin &&
          coin.coinId !== undefined &&
          coin.coinId !== null &&
          Number(coin.coinId) > 0, // Explicitly exclude ID 0
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
      } else if (sortType === "votes") {
        return coinsCopy.sort((a, b) => {
          // Convert BigInt to number (or fallback to 0)
          const aVotes =
            a.votes !== undefined ? Number(formatEther(a.votes)) : 0;
          const bVotes =
            b.votes !== undefined ? Number(formatEther(b.votes)) : 0;

          if (aVotes === bVotes) {
            // Tiebreaker: use coinId descending when votes are equal
            return sortOrder === "asc"
              ? Number(a.coinId) - Number(b.coinId)
              : Number(b.coinId) - Number(a.coinId);
          }
          return sortOrder === "asc" ? aVotes - bVotes : bVotes - aVotes;
        });
      } else if (sortType === "launch") {
        // Use the same filtering logic as pagination for consistency
        const filteredLaunchSales = getFilteredLaunchSales(
          coinsCopy,
          saleDeadlines || new Map(),
        );

        // Sort the remaining sales
        return filteredLaunchSales.sort((a, b) => {
          const aId = Number(a.coinId);
          const bId = Number(b.coinId);

          return sortOrder === "asc"
            ? aId - bId // Ascending (oldest first - assuming lower IDs are older)
            : bId - aId; // Descending (newest first - assuming higher IDs are newer)
        });
      } else {
        // For recency sorting, use the createdAt timestamp
        return coinsCopy.sort((a, b) => {
          // This check should be redundant due to filtering above,
          // but keeping it for extra safety
          if (
            !a?.coinId ||
            !b?.coinId ||
            Number(a.coinId) === 0 ||
            Number(b.coinId) === 0
          ) {
            return 0;
          }

          // Get the created timestamps (unix seconds)
          const aCreatedAt = a.createdAt || 0;
          const bCreatedAt = b.createdAt || 0;

          // Sort by creation timestamp
          return sortOrder === "asc"
            ? aCreatedAt - bCreatedAt // Ascending (oldest first)
            : bCreatedAt - aCreatedAt; // Descending (newest first)
        });
      }
    },
    [sortType, sortOrder, saleDeadlines],
  );

  /* ------------------------------------------------------------------
   *  Helper to filter out invalid coins (like Token 0)
   * ------------------------------------------------------------------ */
  const filterValidCoins = useCallback((coinsList: CoinData[]): CoinData[] => {
    return coinsList.filter(
      (coin) =>
        coin &&
        coin.coinId !== undefined &&
        coin.coinId !== null &&
        Number(coin.coinId) > 0, // Exclude ID 0 and any negative IDs
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
            : sortType === "launch"
              ? getFilteredLaunchSales(
                  filterValidCoins(allCoins || []),
                  saleDeadlines || new Map(),
                ).length
              : filterValidCoins(
                  sortType === "recency"
                    ? allCoinsUnpaged || []
                    : allCoins || [],
                ).length
        }
        canPrev={!isSearchActive && page > 0}
        canNext={
          !isSearchActive &&
          (page + 1) * PAGE_SIZE <
            (sortType === "launch"
              ? getFilteredLaunchSales(
                  filterValidCoins(allCoins || []),
                  saleDeadlines || new Map(),
                ).length
              : filterValidCoins(
                  sortType === "recency"
                    ? allCoinsUnpaged || []
                    : allCoins || [],
                ).length)
        }
        onPrev={debouncedPrevPage}
        onNext={debouncedNextPage}
        isLoading={isLoading}
        currentPage={page + 1}
        totalPages={Math.max(
          1,
          Math.ceil(
            (isSearchActive
              ? filterValidCoins(searchResults || []).length
              : sortType === "launch"
                ? getFilteredLaunchSales(
                    filterValidCoins(allCoins || []),
                    saleDeadlines || new Map(),
                  ).length
                : filterValidCoins(
                    sortType === "recency"
                      ? allCoinsUnpaged || []
                      : allCoins || [],
                  ).length) / PAGE_SIZE,
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
          <div className="relative w-full">
            <input
              type="text"
              placeholder={t("tokenSelector.search_tokens")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-2 border-border p-2 bg-muted text-muted focus:outline-none focus:text-foreground focus:shadow-none w-full pl-10 pr-8 text-sm font-body py-2.5 px-10"
            />
            {searchQuery && (
              <button
                onClick={resetSearch}
                className="button absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 text-center text-xs font-bold"
                aria-label={t("common.cancel")}
                style={{
                  lineHeight: "1",
                  fontSize: "12px",
                  padding: "2px",
                  minWidth: "24px",
                }}
              >
                ✕
              </button>
            )}
            <SearchIcon className="text-foreground absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" />
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
