import { useState, useMemo, useEffect, useCallback } from "react";
import { ExplorerGrid } from "./ExplorerGrid";
import { TradeView } from "./TradeView";
import { usePagedCoins } from "./hooks/metadata";
import { useGlobalCoinsData, type CoinData } from "./hooks/metadata";

// Page size for pagination
const PAGE_SIZE = 20;

export const Coins = () => {
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  
  // Separate state for filtered coins to avoid dependencies on trade navigation
  const [searchResults, setSearchResults] = useState<CoinData[]>([]);
  const [isSearchActive, setIsSearchActive] = useState(false);

  // Use our paged coins hook for efficient data fetching
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
    setPage 
  } = usePagedCoins(PAGE_SIZE);

  // Get access to all coins for global search
  const { allCoins, isLoading: isGlobalLoading } = useGlobalCoinsData();

  // Which coin is being traded
  const [selectedTokenId, setSelectedTokenId] = useState<bigint | null>(null);

  // Run search when query changes
  useEffect(() => {
    const trimmedQuery = searchQuery.trim().toLowerCase();
    
    if (!trimmedQuery) {
      setSearchResults([]);
      setIsSearchActive(false);
      return;
    }
    
    setIsSearchActive(true);
    
    // When searching, use the full dataset if available
    const dataToSearch = allCoins && allCoins.length > 0 ? allCoins : coins;
    
    const results = dataToSearch.filter((coin) => {
      // Search by coin ID
      if (coin.coinId.toString().includes(trimmedQuery)) return true;
      
      // Search by symbol (if available)
      if (coin.symbol && coin.symbol.toLowerCase().includes(trimmedQuery)) return true;
      
      // Search by name (if available)
      if (coin.name && coin.name.toLowerCase().includes(trimmedQuery)) return true;
      
      return false;
    });
    
    setSearchResults(results);
  }, [searchQuery, allCoins, coins]);

  // Reset search state when closing trade view
  const resetSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setIsSearchActive(false);
  }, []);

  // Event handlers
  const openTrade = (id: bigint) => {
    // Save the ID first, then clear search state
    setSelectedTokenId(id);
    
    // Clear search to prevent state issues
    resetSearch();
  };
  
  const closeTrade = () => {
    setSelectedTokenId(null);
  };

  // If a token is selected, show the trade view
  if (selectedTokenId !== null) {
    return <TradeView tokenId={selectedTokenId} onBack={closeTrade} />;
  }

  // Get the coins to display - either search results or paginated coins
  const displayCoins = isSearchActive ? searchResults : coins;
  
  // Calculate offset for display purposes
  const offset = page * PAGE_SIZE;

  // Log data to help with debugging
  console.log(`Coins component rendering: ${coins.length} coins on page ${page + 1} of ${totalPages}`);
  
  if (isSearchActive) {
    console.log(`Search mode active with ${searchResults.length} results for query "${searchQuery}"`);
  }

  // Check if we have metadata in the coins
  const coinsWithMetadata = coins.filter((coin) => coin.metadata !== null).length;
  const coinsWithImages = coins.filter((coin) => coin.imageUrl !== null).length;
  console.log(
    `Coins with metadata: ${coinsWithMetadata}/${coins.length}, Coins with images: ${coinsWithImages}/${coins.length}`,
  );

  // Show the explorer grid
  return (
    <>
      <div className="flex justify-between items-center mb-2">
        <div className="text-sm text-gray-500">
          {isSearchActive 
            ? `Showing ${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`
            : `Page ${page + 1} of ${totalPages} • Showing items ${offset + 1}-${Math.min(offset + coins.length, total)} of ${total}`
          }
        </div>

        {/* Search input */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search by symbol or ID..."
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
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      <ExplorerGrid
        coins={displayCoins}
        total={isSearchActive ? searchResults.length : total}
        canPrev={!isSearchActive && hasPreviousPage}
        canNext={!isSearchActive && hasNextPage}
        onPrev={goToPreviousPage}
        onNext={goToNextPage}
        onTrade={openTrade}
        isLoading={isLoading || (isSearchActive && isGlobalLoading)}
        currentPage={page + 1}
        totalPages={totalPages}
        isSearchActive={isSearchActive}
      />
    </>
  );
};

export default Coins;
