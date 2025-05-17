import { useQuery } from "@tanstack/react-query";
import { CoinData } from "./metadata/coin-utils";

interface PricePoint {
  timestamp: number;
  price: number;  // Price in ETH
}

export interface PriceChangeData {
  coinId: bigint;
  priceChange4h: number;  // Percentage change
  priceChangePct4h: number;  // Percentage change
  hasData: boolean;
}

/**
 * Custom hook to calculate price changes over different time periods
 * Uses pool events API to calculate price changes
 */
export function usePriceChanges(coins: CoinData[]) {
  return useQuery({
    queryKey: ["price-changes"],
    queryFn: async () => {
      if (!coins || coins.length === 0) return [];

      const now = Math.floor(Date.now() / 1000);
      const fourHoursAgo = now - 4 * 60 * 60;

      // Fetch events for all pools in parallel
      const poolEventsPromises = coins
        .filter(coin => coin.poolId && coin.poolId > 0n)
        .map(async (coin) => {
          try {
            const url = `${import.meta.env.VITE_INDEXER_URL}/api/events?poolId=${coin.poolId.toString()}&after=${fourHoursAgo}&limit=100`;
            const res = await fetch(url);
            
            if (!res.ok) {
              console.warn(`Failed to fetch events for pool ${coin.poolId.toString()}`);
              return { coinId: coin.coinId, events: [] };
            }
            
            const data = await res.json();
            return { coinId: coin.coinId, events: data.data || [] };
          } catch (error) {
            console.error(`Error fetching events for coin ${coin.coinId.toString()}:`, error);
            return { coinId: coin.coinId, events: [] };
          }
        });
      
      const poolEventsResults = await Promise.all(poolEventsPromises);
      
      // Calculate price changes for each coin
      const priceChanges = poolEventsResults.map(({ coinId, events }) => {
        // Filter for swap events only
        const swapEvents = events.filter(e => e.type === "BUY" || e.type === "SELL");
        
        if (swapEvents.length === 0) {
          return {
            coinId,
            priceChange4h: 0,
            priceChangePct4h: 0,
            hasData: false
          };
        }
        
        // Sort events by timestamp, oldest first
        const sortedEvents = [...swapEvents].sort((a, b) => a.timestamp - b.timestamp);
        
        // Extract price points from events
        const pricePoints: PricePoint[] = [];
        
        for (const event of sortedEvents) {
          let price: number | null = null;
          
          try {
            // Calculate effective price from the event
            if (event.type === "BUY" && event.amount0_in && event.amount1_out) {
              // Buy: ETH in / tokens out = price per token
              const ethIn = Number(BigInt(event.amount0_in)) / 1e18;
              const tokensOut = Number(BigInt(event.amount1_out)) / 1e18;
              
              // Check for division by zero or extremely small values that could cause issues
              if (tokensOut > 1e-10) {
                price = ethIn / tokensOut;
              }
            } else if (event.type === "SELL" && event.amount0_out && event.amount1_in) {
              // Sell: ETH out / tokens in = price per token
              const ethOut = Number(BigInt(event.amount0_out)) / 1e18;
              const tokensIn = Number(BigInt(event.amount1_in)) / 1e18;
              
              // Check for division by zero or extremely small values that could cause issues
              if (tokensIn > 1e-10) {
                price = ethOut / tokensIn;
              }
            }
            
            // Filter out extreme price values that might skew the analysis
            if (price !== null) {
              // Filter out extreme outliers (prices that are 20x higher or 20x lower than current price)
              const currentCoinPrice = coins.find(c => c.coinId === coinId)?.priceInEth;
              if (currentCoinPrice && currentCoinPrice > 0) {
                if (price > currentCoinPrice * 20 || price < currentCoinPrice / 20) {
                  // Extreme price outlier, skip it
                  price = null;
                }
              }
              
              if (price !== null && isFinite(price) && !isNaN(price)) {
                pricePoints.push({
                  timestamp: event.timestamp,
                  price
                });
              }
            }
          } catch (error) {
            console.error(`Error calculating price for event in pool with coinId ${coinId}:`, error);
            // Continue processing other events
          }
        }
        
        // Calculate price change over 4 hours
        // If not enough data points, use what we have
        if (pricePoints.length === 0) {
          return {
            coinId,
            priceChange4h: 0,
            priceChangePct4h: 0,
            hasData: false
          };
        }
        
        // Get current price from coin data or most recent event
        const currentPrice = coins.find(c => c.coinId === coinId)?.priceInEth || 
                             pricePoints[pricePoints.length - 1].price || 0;
        
        // Find price 4 hours ago (or earliest available)
        const earliestPrice = pricePoints[0].price;
        
        // Sanity check on both prices before calculating
        if (!isFinite(currentPrice) || !isFinite(earliestPrice) || 
            isNaN(currentPrice) || isNaN(earliestPrice) ||
            currentPrice <= 0 || earliestPrice <= 0) {
          return {
            coinId,
            priceChange4h: 0,
            priceChangePct4h: 0,
            hasData: false
          };
        }
        
        // Calculate absolute and percentage changes
        const priceChange = currentPrice - earliestPrice;
        
        // Calculate percentage change with additional safety checks
        let priceChangePct = earliestPrice > 0 
          ? (priceChange / earliestPrice) * 100 
          : 0;
          
        // Sanity check - cap to reasonable range to prevent display issues
        priceChangePct = Math.max(Math.min(priceChangePct, 1000), -100);
        
        return {
          coinId,
          priceChange4h: priceChange,
          priceChangePct4h: priceChangePct,
          hasData: true
        };
      });
      
      return priceChanges;
    },
    // Refresh every 3 minutes for price data to ensure timely updates
    staleTime: 3 * 60 * 1000,
    // Only fetch if we have coins data
    enabled: coins.length > 0,
  });
}