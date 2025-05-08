import { useState, useMemo } from "react";
import { ExplorerGrid } from "./ExplorerGrid";
import { TradeView } from "./TradeView";
import { usePagedCoins } from "./hooks/metadata";
import { useGlobalCoinsData } from "./hooks/metadata";

// Page size for pagination
const PAGE_SIZE = 20;

export const Coins = () => {
  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Use our paged coins hook for efficient data fetching
  const { coins, total, page, totalPages, hasNextPage, hasPreviousPage, goToNextPage, goToPreviousPage, isLoading } =
    usePagedCoins(PAGE_SIZE);

  // Get access to all coins for global search
  const { allCoins, isLoading: isGlobalLoading } = useGlobalCoinsData();

  // Which coin is being traded
  const [selectedTokenId, setSelectedTokenId] = useState<bigint | null>(null);

  // Event handlers
  const openTrade = (id: bigint) => setSelectedTokenId(id);
  const closeTrade = () => setSelectedTokenId(null);

  // If a token is selected, show the trade view
  if (selectedTokenId !== null) {
    return <TradeView tokenId={selectedTokenId} onBack={closeTrade} />;
  }

  // Filter coins based on search query
  const filteredCoins = useMemo(() => {
    if (!searchQuery.trim()) {
      // When no search, use the paginated coins
      return coins;
    }
    
    // When searching, use the full dataset if available
    const dataToSearch = allCoins && allCoins.length > 0 ? allCoins : coins;
    
    const query = searchQuery.toLowerCase().trim();
    return dataToSearch.filter((coin) => {
      // Search by coin ID
      if (coin.coinId.toString().includes(query)) return true;
      
      // Search by symbol (if available)
      if (coin.symbol && coin.symbol.toLowerCase().includes(query)) return true;
      
      // Search by name (if available)
      if (coin.name && coin.name.toLowerCase().includes(query)) return true;
      
      return false;
    });
  }, [coins, allCoins, searchQuery]);

  // Calculate offset for display purposes
  const offset = page * PAGE_SIZE;

  // Log data to help with debugging
  console.log(`Coins component rendering: ${coins.length} coins on page ${page + 1} of ${totalPages}`);

  // Check if we have metadata in the coins
  const coinsWithMetadata = coins.filter((coin) => coin.metadata !== null).length;
  const coinsWithImages = coins.filter((coin) => coin.imageUrl !== null).length;
  console.log(
    `Coins with metadata: ${coinsWithMetadata}/${coins.length}, Coins with images: ${coinsWithImages}/${coins.length}`,
  );

  // Log the first coin data to help debug
  if (coins.length > 0) {
    console.log("First coin data:", {
      coinId: coins[0].coinId.toString(),
      tokenURI: coins[0].tokenURI,
      name: coins[0].name,
      symbol: coins[0].symbol,
      hasMetadata: coins[0].metadata !== null,
      hasImage: coins[0].imageUrl !== null,
      imageUrl: coins[0].imageUrl,
    });
  }

  // Determine if search mode is active
  const isSearchMode = searchQuery.trim() !== "";

  // Show the explorer grid
  return (
    <>
      <div className="flex justify-between items-center mb-2">
        <div className="text-sm text-gray-500">
          {isSearchMode 
            ? `Showing ${filteredCoins.length} result${filteredCoins.length !== 1 ? 's' : ''}`
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
        coins={filteredCoins}
        total={isSearchMode ? filteredCoins.length : total}
        canPrev={!isSearchMode && hasPreviousPage}
        canNext={!isSearchMode && hasNextPage}
        onPrev={goToPreviousPage}
        onNext={goToNextPage}
        onTrade={openTrade}
        isLoading={isLoading || (isSearchMode && isGlobalLoading)}
        currentPage={page + 1}
        totalPages={totalPages}
        isSearchActive={isSearchMode}
      />
    </>
  );
};

export default Coins;
