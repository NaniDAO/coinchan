import type { CoinData } from "@/hooks/metadata/coin-utils";

// Helper function to check if a sale should be filtered out
export const shouldFilterSale = (coin: CoinData, saleDeadlines: Map<string, number>): boolean => {
  // Filter out coins with no sale at all (null/undefined saleStatus)
  if (!coin.saleStatus) {
    return true;
  }
  
  // Filter out explicitly finalized/expired sales
  if (coin.saleStatus === "FINALIZED" || coin.saleStatus === "EXPIRED") {
    return true;
  }
  
  // For active sales, check if deadline has expired (implicitly expired)
  const coinId = coin.coinId.toString();
  const deadlineLast = saleDeadlines.get(coinId);
  
  if (deadlineLast) {
    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    return deadlineLast <= now; // Filter out if deadline has passed
  }
  
  // If no deadline info available but coin has ACTIVE status, keep the sale
  // This handles the case where the indexer hasn't loaded deadline data yet
  return false;
};