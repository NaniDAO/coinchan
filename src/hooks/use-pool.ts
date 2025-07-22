import { useQuery } from "@tanstack/react-query";

interface Coin {
  name: string;
  symbol: string;
  decimals: number;
}

interface Pool {
  coin0Id: string;
  coin1Id: string;
  feeOrHook: string;
  hook: string;
  hookType: string;
  id: string;
  price0: string;
  price1: string;
  reserve0: string;
  reserve1: string;
  source: string;
  swapFee: string;
  token0: string;
  token1: string;
  updatedAt: string;
  coin0: Coin;
  coin1: Coin;
}

interface PoolQueryResponse {
  pool: Pool | null;
}

const GET_POOL_QUERY = `
  query GetPool($id: BigInt!) {
    pool(id: $id) {
      coin0Id
      coin1Id
      feeOrHook
      hook
      hookType
      id
      price0
      price1
      reserve0
      reserve1
      source
      swapFee
      token0
      token1
      updatedAt
      coin0 {
        name
        symbol
        decimals
      }
      coin1 {
        name
        symbol
        decimals
      }
    }
  }
`;

const fetchPool = async (poolId: string): Promise<Pool | null> => {
  const response = await fetch(import.meta.env.VITE_INDEXER_URL + "/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: GET_POOL_QUERY,
      variables: { id: poolId },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data: { data: PoolQueryResponse; errors?: any[] } =
    await response.json();

  if (data.errors) {
    throw new Error(`GraphQL error: ${data.errors[0]?.message}`);
  }

  return data.data.pool;
};

export const usePool = (poolId: string) => {
  return useQuery({
    queryKey: ["pool", poolId],
    queryFn: () => fetchPool(poolId),
    enabled: !!poolId, // Only run query if poolId is provided
    staleTime: 30 * 1000, // Consider data fresh for 30 seconds
    refetchInterval: 60 * 1000, // Auto-refetch every minute
  });
};
