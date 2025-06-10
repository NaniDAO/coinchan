import { useQuery } from '@tanstack/react-query';
import { formatEther } from 'viem';
import { INDEXER_URL } from '../lib/indexer';

export interface TopPoolData {
  poolId: string;
  coinSymbol: string;
  ethAmount: string;
  ethReserve: bigint;
}

const GET_TOP_POOLS = `
  query GetTopPools {
    pools(limit: 10, orderBy: "reserve0", orderDirection: "desc") {
      items {
        id
        reserve0
        reserve1
        coin1 {
          symbol
        }
      }
    }
  }
`;

async function fetchTopPoolsData(): Promise<TopPoolData[]> {
  try {
    const response = await fetch(INDEXER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: GET_TOP_POOLS }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const { data, errors } = await response.json();
    
    if (errors?.length) {
      throw new Error(errors[0].message);
    }

    if (!data?.pools?.items) {
      return [];
    }

    return data.pools.items
      .filter((pool: any) => pool.coin1?.symbol && BigInt(pool.reserve0) > 0n)
      .map((pool: any) => {
        const ethReserve = BigInt(pool.reserve0);
        const ethAmount = formatEther(ethReserve);
        
        // Format ETH amount for display (limit to 2 decimal places for large amounts, more for small)
        const ethValue = parseFloat(ethAmount);
        const formattedEth = ethValue >= 1 
          ? ethValue.toFixed(2)
          : ethValue.toFixed(6).replace(/\.?0+$/, '');

        return {
          poolId: pool.id,
          coinSymbol: pool.coin1.symbol,
          ethAmount: `${formattedEth} Ξ`,
          ethReserve: ethReserve,
        };
      });
  } catch (error) {
    console.error('Failed to fetch top pools:', error);
    // Return empty array on error rather than throwing
    return [];
  }
}

export const useTopPools = () => {
  return useQuery<TopPoolData[]>({
    queryKey: ['top-pools'],
    queryFn: fetchTopPoolsData,
    refetchInterval: 30000, // Refetch every 30 seconds
    retry: 1,
    // Provide empty array as fallback
    placeholderData: [],
  });
};