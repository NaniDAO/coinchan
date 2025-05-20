import { useQuery } from "@tanstack/react-query";
import { CoinData } from "./metadata/coin-utils";

// Event data from pool events API
export interface PoolEvent {
  type: string;
  timestamp: number;
  amount0_in?: string;
  amount1_in?: string;
  amount0_out?: string;
  amount1_out?: string;
  maker?: string;
  txhash: string;
}

export interface TrendingMetrics {
  coinId: bigint;
  txCount24h: number;
  volumeEth24h: number;
  uniqueTraders24h: number;
  lastTxTimestamp: number;
  trendingScore: number;
  movementScore?: number;        // Direction of trading (-1 to 1, sell to buy)
  velocityScore?: number;        // Speed of recent transactions
  volumeAcceleration?: number;   // Is volume increasing?
  recencyFactor?: number;        // How recent was last activity
  isTrending: boolean;
}

/**
 * Custom hook to calculate trending metrics for coins based on recent transaction activity
 * Uses existing pool events API to avoid requiring indexer changes
 */
export function useTrendingCoins(coins: CoinData[]) {
  return useQuery({
    queryKey: ["trending-coins"],
    queryFn: async () => {
      if (!coins || coins.length === 0) return [];

      const now = Math.floor(Date.now() / 1000);
      const oneDayAgo = now - 24 * 60 * 60;

      // Fetch recent events for all pools in parallel
      // Only fetch for coins that have a poolId
      const poolEventsPromises = coins
        .filter(coin => coin.poolId && coin.poolId > 0n)
        .map(async (coin) => {
          try {
            const url = `${import.meta.env.VITE_INDEXER_URL}/api/events?poolId=${coin.poolId.toString()}&after=${oneDayAgo}&limit=100`;
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
      
      // Calculate trending metrics for each coin
      const trendingMetrics = poolEventsResults.map(({ coinId, events }) => {
        // Filter events to only include BUY and SELL transactions
        const tradeEvents = events.filter((e: any) => 
          e.type === "BUY" || e.type === "SELL"
        );
        
        // Calculate volume in ETH
        let volumeEth = 0;
        tradeEvents.forEach((e: any) => {
          // For BUY events, ETH goes in (amount0_in)
          // For SELL events, ETH comes out (amount0_out)
          const ethAmount = e.type === "BUY" 
            ? BigInt(e.amount0_in || "0") 
            : BigInt(e.amount0_out || "0");
          
          // Convert from wei to ETH for calculations (simplified)
          volumeEth += Number(ethAmount) / 1e18;
        });
        
        // Count unique traders
        const uniqueTraders = new Set(
          tradeEvents.map((e: any) => e.maker).filter(Boolean)
        ).size;
        
        // Get timestamp of most recent transaction
        const lastTxTimestamp = tradeEvents.length > 0 
          ? Math.max(...tradeEvents.map((e: any) => e.timestamp))
          : 0;
          
        // Count transactions by type for movement analysis
        const buyCount = tradeEvents.filter((e: any) => e.type === "BUY").length;
        const sellCount = tradeEvents.filter((e: any) => e.type === "SELL").length;
        const txCount = tradeEvents.length;
        
        // Calculate movement score - higher when there's a significant directional trend
        // Values closer to 1 indicate strong buying trend, values closer to -1 indicate strong selling trend
        // Values close to 0 indicate balanced trading (or no activity)
        const movementScore = txCount > 0 
          ? (buyCount - sellCount) / txCount 
          : 0;
        
        // Calculate absolute movement (volatility) - how much directional activity regardless of buy/sell
        const absMovementScore = Math.abs(movementScore);
        
        // Enhanced recency factor - exponential decay for older transactions
        // This makes very recent transactions (last few hours) much more impactful
        const hoursSinceLastTx = lastTxTimestamp > 0 
          ? (now - lastTxTimestamp) / 3600 
          : 24;
          
        // Exponential decay with 6-hour half-life - activity within 6 hours is highly valued
        const recencyFactor = lastTxTimestamp > 0 
          ? Math.exp(-hoursSinceLastTx / 6) 
          : 0;
        
        // Velocity score - rapid succession of transactions indicates momentum
        // Look at time gaps between transactions and reward smaller gaps
        let velocityScore = 0;
        if (tradeEvents.length >= 3) {
          // Sort events by timestamp
          const sortedEvents = [...tradeEvents].sort((a, b) => b.timestamp - a.timestamp);
          // Calculate average time between recent transactions (last 5 or fewer)
          const recentEvents = sortedEvents.slice(0, Math.min(5, sortedEvents.length));
          let totalGap = 0;
          for (let i = 0; i < recentEvents.length - 1; i++) {
            totalGap += recentEvents[i].timestamp - recentEvents[i+1].timestamp;
          }
          const avgGapHours = (totalGap / (recentEvents.length - 1)) / 3600;
          // Convert to score (smaller gaps = higher score)
          velocityScore = Math.max(0, 1 - (avgGapHours / 6)); // 6-hour or smaller gaps max out
        }
        
        // Volume acceleration - is trading volume increasing?
        // Compare recent vs older volume when enough data is available
        let volumeAcceleration = 0;
        if (tradeEvents.length >= 4) {
          const sortedEvents = [...tradeEvents].sort((a, b) => b.timestamp - a.timestamp);
          const halfwayPoint = Math.floor(sortedEvents.length / 2);
          
          // Calculate volume in recent half vs older half
          let recentVolume = 0;
          let olderVolume = 0;
          
          for (let i = 0; i < sortedEvents.length; i++) {
            const event = sortedEvents[i];
            const ethAmount = event.type === "BUY" 
              ? BigInt(event.amount0_in || "0") 
              : BigInt(event.amount0_out || "0");
            
            if (i < halfwayPoint) {
              recentVolume += Number(ethAmount) / 1e18;
            } else {
              olderVolume += Number(ethAmount) / 1e18;
            }
          }
          
          // Calculate ratio, but avoid division by zero
          if (olderVolume > 0) {
            volumeAcceleration = Math.min(recentVolume / olderVolume, 3) / 3; // Cap at 3x
          } else if (recentVolume > 0) {
            volumeAcceleration = 1; // All volume is recent
          }
        }
        
        // Normalize raw metrics to scores between 0-1
        const volumeScore = Math.min(volumeEth / 0.25, 1); // 0.25 ETH volume = max score
        const txCountScore = Math.min(txCount / 10, 1);    // 10 transactions = max score
        const uniqueTradersScore = Math.min(uniqueTraders / 5, 1); // 5 unique traders = max score
        
        // Calculate preliminary trending score with new weights emphasizing recency and movement
        let trendingScore = 
          (recencyFactor * 0.35) + 
          (velocityScore * 0.25) +
          (absMovementScore * 0.15) +
          (volumeAcceleration * 0.10) +
          (volumeScore * 0.10) + 
          (uniqueTradersScore * 0.05);
          
        // Important: Apply an anti-correlation factor with liquidity
        // This ensures coins with lower liquidity but good momentum get boosted
        // Get reference to coin to access liquidity data
        const coin = coins.find(c => c.coinId === coinId);
        if (coin && coin.reserve0) {
          // Convert liquidity to a normalized value between 0-1
          // Using log scale to handle wide range of liquidity values
          // Coins with very high liquidity will be closer to 1, low liquidity closer to 0
          const liquidityETH = Number(coin.reserve0) / 1e18;
          const normalizedLiquidity = Math.min(Math.log10(1 + liquidityETH) / 3, 1);
          
          // Dynamic scaling factor - more aggressive for coins with good activity
          // This boosts coins with lower liquidity but good activity metrics
          const activityStrength = (txCountScore + velocityScore + recencyFactor) / 3;
          
          // For coins with substantial activity, apply inverse liquidity boost
          if (activityStrength > 0.3 && normalizedLiquidity > 0.1) {
            // Decrease score for high-liquidity coins, increase for lower-liquidity
            // More active coins get stronger adjustment
            const liquidityAdjustment = (1 - normalizedLiquidity) * 0.5 * activityStrength;
            trendingScore = trendingScore + liquidityAdjustment;
          }
        }
        
        // Randomness factor to create more diversity at the top
        // This small randomness is stable for each coin but creates diversity in the rankings
        // It's small enough to not overwhelm the real metrics but big enough to avoid ties
        // Since the randomness is based on the coin ID hash, it's consistent between refreshes
        const uniqueHash = Number(coinId) % 1000; // Simple hash from coinId
        
        // Only apply randomness if we have actual activity data
        // This prevents random boosting of inactive coins
        if (txCount > 0) {
          // Reduce the random factor even further for less active coins
          const activityLevel = Math.min((txCount / 5) * (volumeEth / 0.1), 1.0);
          const randomOffset = (uniqueHash / 1000) * 0.05 * activityLevel; // Scaled by activity
          
          // Apply a very small random component that's stable for each coin ID
          trendingScore = Math.min(trendingScore + randomOffset, 1.0);
        }
        
        // Coin is trending if score exceeds threshold OR meets certain key criteria
        // Threshold is a bit higher now since scores can be boosted
        const isTrending = 
          trendingScore > 0.4 || // Above overall threshold
          (recencyFactor > 0.8 && txCount >= 3) || // Very recent activity with multiple trades
          (velocityScore > 0.7 && txCount >= 5) || // High velocity with reasonable volume
          (absMovementScore > 0.7 && txCount >= 7); // Strong directional movement with volume
        
        return {
          coinId,
          txCount24h: txCount,
          volumeEth24h: volumeEth,
          uniqueTraders24h: uniqueTraders,
          lastTxTimestamp,
          trendingScore,
          movementScore,        // Added for UI display and sorting flexibility
          velocityScore,        // Added for UI display and sorting flexibility
          volumeAcceleration,   // Added for UI display and sorting flexibility
          recencyFactor,        // Added for UI display and sorting flexibility
          isTrending
        };
      });
      
      return trendingMetrics;
    },
    // Refresh every 5 minutes
    staleTime: 5 * 60 * 1000,
    // Only fetch if we have coins data
    enabled: coins.length > 0,
  });
}