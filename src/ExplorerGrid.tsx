import { CoinCard } from "./components/CoinCard";
import { type CoinData } from "./hooks/metadata";

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
  // Debug: Log coin data for troubleshooting
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
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 sm:gap-3 min-h-[300px]">
        {coins.map((coin) => (
          <div key={coin.coinId.toString()} className={isLoading ? "opacity-60 pointer-events-none" : ""}>
            <CoinCard coin={coin} onTrade={onTrade} />
          </div>
        ))}

        {/* Show skeleton loaders for empty grid during initial load */}
        {coins.length === 0 &&
          total > 0 &&
          Array.from({ length: Math.min(total, PAGE_SIZE) }).map((_, index) => (
            <div
              key={`skeleton-${index}`}
              className="flex border-2 border-red-900/30 rounded-md bg-yellow-50/50 w-full flex-col items-right p-1 gap-2 shadow h-32 animate-pulse"
            ></div>
          ))}
      </div>

      <div className="pagination-buttons flex justify-between items-center mt-6 mb-4">
        <button
          onClick={onPrev}
          disabled={!canPrev || isLoading}
          className={`px-4 py-2 rounded-md border border-red-300 hover:bg-red-50 touch-manipulation ${
            !canPrev || isLoading ? "text-gray-400 opacity-50" : "text-red-500 font-bold"
          }`}
        >
          Previous
        </button>

        {/* Page info from parent */}
        {total > 0 && (
          <span className="text-sm text-gray-500">
            Page {currentPage} of {totalPages}
          </span>
        )}

        <button
          onClick={onNext}
          disabled={!canNext || isLoading}
          className={`px-4 py-2 rounded-md border border-red-300 hover:bg-red-50 touch-manipulation ${
            !canNext || isLoading ? "text-gray-400 opacity-50" : "text-red-500 font-bold"
          }`}
        >
          Next
        </button>
      </div>
    </div>
  );
};
