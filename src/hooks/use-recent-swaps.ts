import { useQuery } from '@tanstack/react-query';
import { formatEther } from 'viem';
import { INDEXER_URL } from '../lib/indexer';

export interface RecentSwapData {
  id: string;
  coinSymbol: string;
  amountIn: string;
  amountOut: string;
  isEthToToken: boolean;
  timestamp: string;
}

const GET_RECENT_SWAPS = `
  query GetRecentSwaps {
    swaps(limit: 20, orderBy: "timestamp", orderDirection: "desc") {
      items {
        id
        amountIn
        amountOut
        zeroToOne
        timestamp
        pool {
          coin1 {
            symbol
          }
        }
      }
    }
  }
`;

async function fetchRecentSwapsData(): Promise<RecentSwapData[]> {
  try {
    const response = await fetch(INDEXER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: GET_RECENT_SWAPS }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const { data, errors } = await response.json();
    
    if (errors?.length) {
      throw new Error(errors[0].message);
    }

    if (!data?.swaps?.items) {
      return [];
    }

    return data.swaps.items
      .filter((swap: any) => swap.pool?.coin1?.symbol)
      .map((swap: any) => {
        const isEthToToken = swap.zeroToOne; // true means ETH->Token
        const amountInWei = BigInt(swap.amountIn);
        const amountOutWei = BigInt(swap.amountOut);
        
        // Format amounts for display
        const amountInFormatted = isEthToToken 
          ? `${parseFloat(formatEther(amountInWei)).toFixed(4)} Ξ`
          : `${parseFloat(formatEther(amountInWei)).toFixed(0)} ${swap.pool.coin1.symbol}`;
          
        const amountOutFormatted = isEthToToken
          ? `${parseFloat(formatEther(amountOutWei)).toFixed(0)} ${swap.pool.coin1.symbol}`
          : `${parseFloat(formatEther(amountOutWei)).toFixed(4)} Ξ`;

        return {
          id: swap.id,
          coinSymbol: swap.pool.coin1.symbol,
          amountIn: amountInFormatted,
          amountOut: amountOutFormatted,
          isEthToToken,
          timestamp: new Date(parseInt(swap.timestamp) * 1000).toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit' 
          }),
        };
      });
  } catch (error) {
    console.error('Failed to fetch recent swaps:', error);
    return [];
  }
}

export const useRecentSwaps = () => {
  return useQuery<RecentSwapData[]>({
    queryKey: ['recent-swaps'],
    queryFn: fetchRecentSwapsData,
    refetchInterval: 10000, // Refetch every 10 seconds for real-time feel
    retry: 1,
    placeholderData: [],
  });
};