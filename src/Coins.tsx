import { useState } from "react";
import { ExplorerGrid } from "./ExplorerGrid";
import { TradeView } from "./TradeView";
import { usePagedCoins } from "./hooks/metadata";

// Page size for pagination
const PAGE_SIZE = 20;

export const Coins = () => {
  // Use our new paged coins hook for efficient data fetching
  const { coins, total, page, totalPages, hasNextPage, hasPreviousPage, goToNextPage, goToPreviousPage, isLoading } =
    usePagedCoins(PAGE_SIZE);

  // Which coin is being traded
  const [selectedTokenId, setSelectedTokenId] = useState<bigint | null>(null);

  // Event handlers
  const openTrade = (id: bigint) => setSelectedTokenId(id);
  const closeTrade = () => setSelectedTokenId(null);

  // If a token is selected, show the trade view
  if (selectedTokenId !== null) {
    return <TradeView tokenId={selectedTokenId} onBack={closeTrade} />;
  }

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

  // Show the explorer grid
  return (
    <>
      <div className="text-sm text-gray-500 mb-2">
        Page {page + 1} of {totalPages} • Showing items {offset + 1}-{Math.min(offset + coins.length, total)} of {total}
      </div>

      <ExplorerGrid
        coins={coins}
        total={total}
        canPrev={hasPreviousPage}
        canNext={hasNextPage}
        onPrev={goToPreviousPage}
        onNext={goToNextPage}
        onTrade={openTrade}
        isLoading={isLoading}
        currentPage={page + 1}
        totalPages={totalPages}
      />
    </>
  );
};

export default Coins;