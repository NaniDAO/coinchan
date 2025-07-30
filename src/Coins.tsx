import { SearchIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEther } from "viem";
import { ExplorerGrid, type SortType } from "./ExplorerGrid";
import { usePagedCoins } from "./hooks/metadata";
import type { CoinData } from "./hooks/metadata/coin-utils";
import { useCoinsData } from "./hooks/metadata/use-coins-data";
import { debounce } from "./lib/utils";

// Page size for pagination
const PAGE_SIZE = 20;

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

      // Filter out invalid coins (undefined/null IDs)
      // Allow special tokens like ENS (ID 0) and CULT (ID 999999)
      const validCoins = coinsToSort.filter(
        (coin) => {
          if (!coin || coin.coinId === undefined || coin.coinId === null) return false;
          
          // Allow special tokens
          const isSpecialToken = 
            coin.symbol === "ENS" || 
            coin.symbol === "CULT" || 
            coin.symbol === "USDT";
          
          // For regular coins, exclude ID 0 or negative
          if (!isSpecialToken && Number(coin.coinId) <= 0) return false;
          
          return true;
        }
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
          const aVotes = a.votes !== undefined ? Number(formatEther(a.votes)) : 0;
          const bVotes = b.votes !== undefined ? Number(formatEther(b.votes)) : 0;

          if (aVotes === bVotes) {
            // Tiebreaker: use coinId descending when votes are equal
            return sortOrder === "asc" ? Number(a.coinId) - Number(b.coinId) : Number(b.coinId) - Number(a.coinId);
          }
          return sortOrder === "asc" ? aVotes - bVotes : bVotes - aVotes;
        });
      } else {
        // For recency sorting, use the createdAt timestamp
        return coinsCopy.sort((a, b) => {
          // Basic null checks
          if (!a?.coinId || !b?.coinId) {
            return 0;
          }
          
          // Allow special tokens with ID 0
          const aIsSpecial = a.symbol === "ENS" || a.symbol === "CULT" || a.symbol === "USDT";
          const bIsSpecial = b.symbol === "ENS" || b.symbol === "CULT" || b.symbol === "USDT";
          
          // For regular coins, skip if ID is 0 or negative
          if (!aIsSpecial && Number(a.coinId) <= 0) return 0;
          if (!bIsSpecial && Number(b.coinId) <= 0) return 0;

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
    [sortType, sortOrder],
  );

  /* ------------------------------------------------------------------
   *  Helper to filter out invalid coins (like Token 0) and expired unsold tranche sales
   * ------------------------------------------------------------------ */
  const filterValidCoins = useCallback((coinsList: CoinData[]): CoinData[] => {
    return coinsList.filter((coin) => {
      // Basic validation - exclude null, undefined
      if (!coin || coin.coinId === undefined || coin.coinId === null) {
        return false;
      }
      
      // Allow special tokens (ENS has ID 0, CULT has ID 999999)
      const isSpecialToken = 
        coin.symbol === "ENS" || 
        coin.symbol === "CULT" || 
        coin.symbol === "USDT";
      
      // For regular coins, exclude ID 0 or negative
      if (!isSpecialToken && Number(coin.coinId) <= 0) {
        return false;
      }
      
      // Filter out expired and unsold tranche sales
      // A tranche sale is considered expired and unsold if:
      // 1. It has EXPIRED status AND
      // 2. It has no liquidity (meaning it never sold)
      if (coin.saleStatus === "EXPIRED" && (!coin.liquidity || coin.liquidity === 0n)) {
        return false;
      }
      
      return true;
    });
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
    return result.filter((coin) => {
      if (!coin) return false;
      
      // Allow special tokens
      const isSpecialToken = 
        coin.symbol === "ENS" || 
        coin.symbol === "CULT" || 
        coin.symbol === "USDT";
      
      // For special tokens, allow ID 0 or specific IDs
      if (isSpecialToken) return true;
      
      // For regular coins, exclude ID 0 or negative
      return Number(coin.coinId) > 0;
    });
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
        isLoading={isLoading}
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
