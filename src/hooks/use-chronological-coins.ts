import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { CoinchanAbi, CoinchanAddress } from "@/constants/Coinchan";

// Create a public client for direct RPC calls
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http("https://eth-mainnet.g.alchemy.com/v2/demo"),
});

/**
 * Helper function to retry a failed operation with exponential backoff
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let retries = 0;
  let lastError: Error | null = null;

  while (retries < maxRetries) {
    try {
      return await operation();
    } catch (err) {
      lastError = err as Error;
      retries++;
      
      if (retries >= maxRetries) break;
      
      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, retries - 1) * (0.5 + Math.random() * 0.5);
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error("Operation failed after multiple retries");
}

/**
 * Custom hook to fetch the complete list of coin IDs in chronological order
 * Uses direct RPC calls to the Coinchan contract to get accurate data
 */
export function useChronologicalCoins() {
  return useQuery({
    queryKey: ["chronological-coins"],
    queryFn: async () => {
      try {
        // First, get the total count of coins
        const coinCount = await retryWithBackoff(async () => {
          return publicClient.readContract({
            address: CoinchanAddress,
            abi: CoinchanAbi,
            functionName: "getCoinsCount",
          }) as Promise<bigint>;
        });
        
        // Convert to number for easier handling
        const totalCoins = Number(coinCount);
        
        if (totalCoins === 0) {
          return [];
        }
        
        // Get all coins (in batches if needed)
        // The contract's getCoins function takes start and finish indices
        // Adjust batch size based on total size
        const BATCH_SIZE = totalCoins > 2000 ? 250 : (totalCoins > 1000 ? 500 : 1000);
        let allCoinIds: bigint[] = [];
        
        for (let i = 0; i < totalCoins; i += BATCH_SIZE) {
          const end = Math.min(i + BATCH_SIZE, totalCoins);
          
          const batch = await retryWithBackoff(async () => {
            return publicClient.readContract({
              address: CoinchanAddress,
              abi: CoinchanAbi,
              functionName: "getCoins",
              args: [BigInt(i), BigInt(end - 1)],
            }) as Promise<bigint[]>;
          });
          
          if (batch && batch.length > 0) {
            allCoinIds = [...allCoinIds, ...batch];
          }
        }
        
        // Validate results before returning
        if (allCoinIds.length === 0 && totalCoins > 0) {
          throw new Error("Failed to retrieve coin IDs despite non-zero count");
        }
        
        // Return the complete list of coin IDs in chronological order
        return allCoinIds;
      } catch (error) {
        console.error("Error fetching chronological coins:", error);
        // Rethrow to trigger React Query's retry mechanism
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 3, // Use React Query's built-in retry mechanism
    retryDelay: attemptIndex => Math.min(1000 * Math.pow(2, attemptIndex), 30000), // Exponential backoff
  });
}