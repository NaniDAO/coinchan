import { useQuery } from '@tanstack/react-query';
import { INDEXER_URL } from '../lib/indexer';

export interface ProtocolStats {
  totalEthSwapped: string;
  totalEthSwappedUsd: string;
  totalSwaps: number;
  swaps24h: number;
  totalCoins: number;
  activeCoins: number;
}

export const useProtocolStats = () => {
  return useQuery<ProtocolStats>({
    queryKey: ['protocol-stats'],
    queryFn: async () => {
      const query = `
        query ProtocolStats {
          swaps(first: 1000, orderBy: "timestamp", orderDirection: "desc") {
            items {
              id
              amountIn
              amountOut
              timestamp
              poolId
            }
          }
          pools {
            items {
              id
              createdAtTimestamp
              reserve0
              reserve1
            }
          }
        }
      `;

      const response = await fetch(INDEXER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error(`Error fetching protocol stats: ${response.statusText}`);
      }

      const { data, errors } = await response.json();
      if (errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(errors)}`);
      }

      // Calculate stats from raw data
      const swaps = data.swaps.items || [];
      const pools = data.pools.items || [];

      // Calculate total ETH swapped (approximate)
      let totalEthWei = BigInt(0);
      swaps.forEach((swap: any) => {
        // Approximate ETH value - this is simplified
        const amountIn = BigInt(swap.amountIn || 0);
        totalEthWei += amountIn;
      });

      const totalEthSwapped = Number(totalEthWei) / 1e18;
      
      // Calculate 24h swaps
      const oneDayAgo = Date.now() / 1000 - 24 * 60 * 60;
      const swaps24h = swaps.filter((swap: any) => 
        Number(swap.timestamp) > oneDayAgo
      ).length;

      // Estimate USD value (using approximate $3000/ETH)
      const ethPriceUsd = 3000; // Fallback price
      const totalEthSwappedUsd = totalEthSwapped * ethPriceUsd;

      return {
        totalEthSwapped: `${totalEthSwapped.toFixed(6)} Ξ`,
        totalEthSwappedUsd: `($${totalEthSwappedUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })})`,
        totalSwaps: swaps.length,
        swaps24h: swaps24h,
        totalCoins: pools.length,
        activeCoins: pools.filter((pool: any) => 
          BigInt(pool.reserve0 || 0) > 0 || BigInt(pool.reserve1 || 0) > 0
        ).length,
      };
    },
    refetchInterval: 60000, // Refetch every minute
    retry: 2,
    // Provide fallback data while loading
    placeholderData: {
      totalEthSwapped: '0.000000 Ξ',
      totalEthSwappedUsd: '($0)',
      totalSwaps: 0,
      swaps24h: 0,
      totalCoins: 0,
      activeCoins: 0,
    },
  });
};