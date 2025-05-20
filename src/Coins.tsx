import { useState, useCallback, useMemo } from "react";
import { ExplorerGrid } from "./ExplorerGrid";
import { usePagedCoins } from "./hooks/metadata";
import { useCoinsData } from "./hooks/metadata/use-coins-data";
import { useChronologicalCoins } from "./hooks/use-chronological-coins";
import { useTrendingCoins } from "./hooks/use-trending-coins";
import { usePriceChanges } from "./hooks/use-price-changes";
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
  const [sortType, setSortType] = useState<"liquidity" | "recency" | "trending">("liquidity");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  /* ------------------------------------------------------------------
   *  Paged & global coin data
   * ------------------------------------------------------------------ */
  const {
    coins,
    allCoins,
    page,
    goToNextPage,
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

  // Fix for previous page bug - force setting the page directly to ensure correct navigation
  const debouncedPrevPage = useMemo(
    () => debounce(() => {
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
   *  Get trending metrics for sorting by trading activity
   * ------------------------------------------------------------------ */
  const { data: trendingMetrics = [], isLoading: isTrendingLoading } = useTrendingCoins(allCoinsUnpaged);
  
  /* ------------------------------------------------------------------
   *  Get price change data for display in coin cards (4-hour changes)
   * ------------------------------------------------------------------ */
  const { data: priceChanges = [], isLoading: isPriceChangesLoading } = usePriceChanges(allCoinsUnpaged);
  
  // Combine coin data with trending metrics and price changes
  const coinsWithMetrics = useMemo(() => {
    if (!allCoinsUnpaged || allCoinsUnpaged.length === 0) {
      return allCoinsUnpaged;
    }
    
    // Create a map of coinId -> trending metrics for quick lookup
    const trendingMap = new Map(
      trendingMetrics.map(metrics => [metrics.coinId.toString(), metrics])
    );
    
    // Create a map of coinId -> price changes for quick lookup
    const priceChangeMap = new Map(
      priceChanges.map(change => [change.coinId.toString(), change])
    );
    
    // Merge trending metrics and price changes into coin data
    return allCoinsUnpaged.map(coin => {
      const trending = trendingMap.get(coin.coinId.toString());
      const priceChange = priceChangeMap.get(coin.coinId.toString());
      
      const updatedCoin = { ...coin };
      
      // Add trending metrics if available
      if (trending) {
        updatedCoin.txCount24h = trending.txCount24h;
        updatedCoin.volumeEth24h = trending.volumeEth24h;
        updatedCoin.uniqueTraders24h = trending.uniqueTraders24h;
        updatedCoin.trendingScore = trending.trendingScore;
        updatedCoin.movementScore = trending.movementScore;
        updatedCoin.velocityScore = trending.velocityScore;
        updatedCoin.volumeAcceleration = trending.volumeAcceleration;
        updatedCoin.recencyFactor = trending.recencyFactor;
        updatedCoin.isTrending = trending.isTrending;
      }
      
      // Add price change data if available
      if (priceChange) {
        updatedCoin.priceChange4h = priceChange.priceChange4h;
        updatedCoin.priceChangePct4h = priceChange.priceChangePct4h;
        updatedCoin.hasPriceChangeData = priceChange.hasData;
      }
      
      return updatedCoin;
    });
  }, [allCoinsUnpaged, trendingMetrics, priceChanges]);

  /* ------------------------------------------------------------------
   *  Sorting handlers
   * ------------------------------------------------------------------ */
  // Function to ensure we have chronological data
  const { refetch: refetchChronologicalData } = useChronologicalCoins();
  // Function to ensure we have trending data
  const { refetch: refetchTrendingData } = useTrendingCoins(allCoinsUnpaged);
  
  const handleSortTypeChange = useCallback((newSortType: "liquidity" | "recency" | "trending") => {
    setSortType(newSortType);
    // Reset to page 1 when changing sort type
    if (sortType !== newSortType) {
      setPage(0);
      
      // If switching to recency sort type, ensure we have the chronological data
      if (newSortType === "recency" && (!chronologicalCoinIds || chronologicalCoinIds.length === 0)) {
        // Explicitly trigger a refetch to ensure we have the data
        refetchChronologicalData();
      }
      
      // If switching to trending sort type, ensure we have the trending data
      if (newSortType === "trending" && (!trendingMetrics || trendingMetrics.length === 0)) {
        // Explicitly trigger a refetch to ensure we have the data
        refetchTrendingData();
      }
    }
  }, [sortType, setPage, chronologicalCoinIds, trendingMetrics, refetchChronologicalData, refetchTrendingData]);

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
      const validCoins = coinsToSort.filter(coin => 
        coin && coin.coinId !== undefined && coin.coinId !== null && 
        Number(coin.coinId) > 0 // Explicitly exclude ID 0
      );
      
      // If all coins were filtered out, return empty array
      if (validCoins.length === 0) return [];
      
      // Always create a copy to avoid mutating the original array
      const coinsCopy = [...validCoins];

      if (sortType === "trending") {
        // For trending sort, prioritize coins with higher trending scores
        return coinsCopy.sort((a, b) => {
          // Trending sort now focuses entirely on the combined trendingScore
          // The trendingScore now includes anti-correlation with liquidity
          
          // Use the adjusted and combined trending score for primary sorting
          const scoreA = a.trendingScore ?? 0;
          const scoreB = b.trendingScore ?? 0;
          
          // First use the overall trending score - enough separation now to be meaningful
          if (Math.abs(scoreA - scoreB) > 0.05) { // Using smaller threshold to capture more differences
            return sortOrder === "asc" 
              ? scoreA - scoreB
              : scoreB - scoreA;
          }
          
          // If trending scores are very close, break ties intelligently
          
          // Tie-breaker 1: Prefer coins with more recent activity
          const recencyFactorA = a.recencyFactor ?? 0;
          const recencyFactorB = b.recencyFactor ?? 0;
          
          if (Math.abs(recencyFactorA - recencyFactorB) > 0.1) {
            return sortOrder === "asc" 
              ? recencyFactorA - recencyFactorB
              : recencyFactorB - recencyFactorA;
          }
          
          // Tie-breaker 2: Prefer coins with higher trading velocity
          const velocityScoreA = a.velocityScore ?? 0;  
          const velocityScoreB = b.velocityScore ?? 0;
          
          if (Math.abs(velocityScoreA - velocityScoreB) > 0.1) {
            return sortOrder === "asc"
              ? velocityScoreA - velocityScoreB
              : velocityScoreB - velocityScoreA;
          }
          
          // Tie-breaker 3: Prefer coins with stronger directional movement
          const absMovementA = a.movementScore ? Math.abs(a.movementScore) : 0;
          const absMovementB = b.movementScore ? Math.abs(b.movementScore) : 0;
          
          if (Math.abs(absMovementA - absMovementB) > 0.1) {
            return sortOrder === "asc"
              ? absMovementA - absMovementB
              : absMovementB - absMovementA;
          }
          
          // Tie-breaker 4: Prefer coins with unusual volume spikes relative to typical activity
          const volAccelerationA = a.volumeAcceleration ?? 0;
          const volAccelerationB = b.volumeAcceleration ?? 0;
          
          if (Math.abs(volAccelerationA - volAccelerationB) > 0.1) {
            return sortOrder === "asc"
              ? volAccelerationA - volAccelerationB
              : volAccelerationB - volAccelerationA;
          }
          
          // Final tie-breaker: For coins with identical metrics, use ID as stable sort
          // This ensures consistent ordering between renders and helps with stable pagination
          const aId = Number(a.coinId);
          const bId = Number(b.coinId);
          
          return sortOrder === "asc"
            ? aId - bId
            : bId - aId;
        });
      } else if (sortType === "liquidity") {
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
              ? aIndex - bIndex  // Ascending (oldest first - lower index)
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
              ? aId - bId  // Ascending (oldest first - assuming lower IDs are older)
              : bId - aId; // Descending (newest first - assuming higher IDs are newer)
          });
        }
      }
    },
    [sortType, sortOrder, chronologicalCoinIds]
  );

  /* ------------------------------------------------------------------
   *  Helper to filter out invalid coins (like Token 0)
   * ------------------------------------------------------------------ */
  const filterValidCoins = useCallback((coinsList: CoinData[]): CoinData[] => {
    return coinsList.filter(coin => 
      coin && coin.coinId !== undefined && coin.coinId !== null && 
      Number(coin.coinId) > 0 // Exclude ID 0 and any negative IDs
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
    
    // Use coins with metrics data for trending sort and display
    const validCoinsWithMetrics = filterValidCoins(coinsWithMetrics || []);
    
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
      // For trending sort, use the coins with trending data
      if (sortType === "trending" && validCoinsWithMetrics.length > 0) {
        // Apply sorting to the dataset with trending metrics
        const trendingSorted = sortCoins(validCoinsWithMetrics);
        // Paginate the sorted results
        result = trendingSorted.slice(startIdx, endIdx);
      }
      // For both recency and liquidity sorting, use the complete dataset for consistent sorting
      else if (validAllCoins.length > 0) {
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
    return result.filter(coin => coin && Number(coin.coinId) > 0);
  }, [isSearchActive, searchResults, sortType, sortOrder, allCoinsUnpaged, coinsWithMetrics, coins, sortCoins, page, PAGE_SIZE, filterValidCoins]);

  /* ------------------------------------------------------------------
   *  Render – trade view OR explorer grid
   * ------------------------------------------------------------------ */
  return (
    <>
      {/* Main grid with search bar passed as prop */}
      <ExplorerGrid
        coins={displayCoins}
        total={isSearchActive 
          ? (filterValidCoins(searchResults || []).length) 
          : (filterValidCoins(sortType === "recency" ? (allCoinsUnpaged || []) : (allCoins || [])).length)
        }
        canPrev={!isSearchActive && page > 0}
        canNext={!isSearchActive && ((page + 1) * PAGE_SIZE < filterValidCoins(sortType === "recency" ? (allCoinsUnpaged || []) : (allCoins || [])).length)}
        onPrev={debouncedPrevPage}
        onNext={debouncedNextPage}
        isLoading={isLoading || 
          (sortType === "recency" && isChronologicalLoading) ||
          (sortType === "trending" && (isTrendingLoading || isPriceChangesLoading))
        }
        currentPage={page + 1}
        totalPages={Math.max(1, Math.ceil(
          (isSearchActive 
            ? filterValidCoins(searchResults || []).length 
            : filterValidCoins(sortType === "recency" ? (allCoinsUnpaged || []) : (allCoins || [])).length
          ) / PAGE_SIZE
        ))}
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
