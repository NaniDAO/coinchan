import { CoinCard } from "./components/CoinCard";
import { type CoinData } from "./hooks/metadata";
import { useState, useEffect, useMemo } from "react";

// Default page size
const PAGE_SIZE = 20;

export const ExplorerGrid = ({
  coins,
  total,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onTrade,
  isLoading = false,
  currentPage = 1,
  totalPages = 1,
}: {
  coins: CoinData[];
  total: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onTrade: (id: bigint) => void;
  isLoading?: boolean;
  currentPage?: number;
  totalPages?: number;
}) => {
  // Search functionality
  const [searchQuery, setSearchQuery] = useState("");

  // Filter coins based on search query
  const filteredCoins = useMemo(() => {
    if (!searchQuery.trim()) return coins;
    
    const query = searchQuery.toLowerCase().trim();
    return coins.filter((coin) => {
      // Search by coin ID
      if (coin.coinId.toString().includes(query)) return true;
      
      // Search by symbol (if available)
      if (coin.symbol && coin.symbol.toLowerCase().includes(query)) return true;
      
      // Search by name (if available)
      if (coin.name && coin.name.toLowerCase().includes(query)) return true;
      
      return false;
    });
  }, [coins, searchQuery]);

  // Debug: Log coin data for troubleshooting
  useEffect(() => {
    console.log(`ExplorerGrid rendering with ${coins.length} coins, page ${currentPage}/${totalPages}`);

    // Check if we have metadata and images
    const coinsWithMetadata = coins.filter((coin) => coin.metadata !== null).length;
    const coinsWithImages = coins.filter((coin) => coin.imageUrl !== null).length;
    console.log(
      `ExplorerGrid - Coins with metadata: ${coinsWithMetadata}/${coins.length}, Coins with images: ${coinsWithImages}/${coins.length}`,
    );

    // Log detailed data about the first few coins
    if (coins.length > 0) {
      const sampleSize = Math.min(3, coins.length);
      for (let i = 0; i < sampleSize; i++) {
        const coin = coins[i];
        console.log(`Coin ${i + 1} (ID: ${coin.coinId.toString()})`, {
          name: coin.name,
          symbol: coin.symbol,
          tokenURI: coin.tokenURI,
          hasMetadata: coin.metadata !== null,
          metadata: coin.metadata
            ? {
                name: coin.metadata.name,
                symbol: coin.metadata.symbol,
                image: coin.metadata.image,
              }
            : null,
          imageUrl: coin.imageUrl,
        });
      }
    }
  }, [coins, currentPage, totalPages]);

  return (
    <div className="w-full px-2 sm:px-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg sm:text-xl font-semibold text-center sm:text-left">
          {total === 0 ? "NO COINS DEPLOYED" : total === 1 ? "1 COIN DEPLOYED" : `${total} COINS DEPLOYED`}
        </h2>

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full border-2 border-red-500 border-t-transparent animate-spin mr-2"></div>
            <span className="text-sm text-red-500">Loading...</span>
          </div>
        )}

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

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 sm:gap-3 min-h-[300px]">
        {filteredCoins.map((coin) => (
          <div key={coin.coinId.toString()} className={isLoading ? "opacity-60 pointer-events-none" : ""}>
            <CoinCard coin={coin} onTrade={onTrade} />
          </div>
        ))}

        {/* Show skeleton loaders for empty grid during initial load */}
        {filteredCoins.length === 0 &&
          total > 0 &&
          !searchQuery && 
          Array.from({ length: Math.min(total, PAGE_SIZE) }).map((_, index) => (
            <div
              key={`skeleton-${index}`}
              className="flex border-2 border-red-900/30 rounded-md bg-yellow-50/50 w-full flex-col items-right p-1 gap-2 shadow h-32 animate-pulse"
            ></div>
          ))}
          
        {/* Show message when no search results */}
        {filteredCoins.length === 0 && searchQuery && (
          <div className="col-span-3 sm:col-span-4 md:col-span-5 text-center py-8 text-gray-500">
            No coins found matching "{searchQuery}"
          </div>
        )}
      </div>

      <div className="pagination-buttons flex justify-between items-center mt-6 mb-4">
        <button
          onClick={onPrev}
          disabled={!canPrev || isLoading || searchQuery !== ""}
          className={`px-4 py-2 rounded-md border border-red-300 hover:bg-red-50 touch-manipulation ${
            !canPrev || isLoading || searchQuery !== "" ? "text-gray-400 opacity-50" : "text-red-500 font-bold"
          }`}
        >
          Previous
        </button>

        {/* Page info from parent */}
        {total > 0 && (
          <span className="text-sm text-gray-500">
            {searchQuery ? `Showing ${filteredCoins.length} results` : `Page ${currentPage} of ${totalPages}`}
          </span>
        )}

        <button
          onClick={onNext}
          disabled={!canNext || isLoading || searchQuery !== ""}
          className={`px-4 py-2 rounded-md border border-red-300 hover:bg-red-50 touch-manipulation ${
            !canNext || isLoading || searchQuery !== "" ? "text-gray-400 opacity-50" : "text-red-500 font-bold"
          }`}
        >
          Next
        </button>
      </div>
    </div>
  );
};