import { CoinSource } from "@/lib/coins";
import { useQuery } from "@tanstack/react-query";

const GET_POOL = `
  query GetPool($id: BigInt!, $source: String!) {
    pool(id: $id, source: $source) {
      feeOrHook
      hook
      hookType
      id
      swapFee
      source
      reserve1
      reserve0
      price1
      price0
      coin1Id
      coin0Id
      token0
      token1
      coin0 {
        id
        decimals
        name
        symbol
        source
        token
      }
      coin1 {
        decimals
        id
        name
        source
        symbol
        token
      }
    }
  }
`;

// ----- Types (optional but helpful) -----
type Coin = {
  id: string;
  decimals: number;
  name: string;
  symbol: string;
  source: string;
  token: string;
};

export type Pool = {
  feeOrHook: string | null;
  hook: string | null;
  hookType: string | null;
  id: string;
  swapFee: string | number | null;
  source: string | null;
  reserve1: string | number | null;
  reserve0: string | number | null;
  price1: string | number | null;
  price0: string | number | null;
  coin1Id: string | null;
  coin0Id: string | null;
  token0: string | null;
  token1: string | null;
  coin0: Coin | null;
  coin1: Coin | null;
};

type GetPoolResponse = {
  data?: { pool: Pool | null };
  errors?: Array<{ message: string }>;
};

// ----- Fetcher -----
export const fetchPool = async (
  poolId: string,
  source: CoinSource,
): Promise<Pool | null> => {
  const response = await fetch(`${import.meta.env.VITE_INDEXER_URL}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: GET_POOL,
      variables: { id: poolId, source },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch pool (${response.status})`);
  }

  const json: GetPoolResponse = await response.json();

  console.log("useGetPool", json);

  if (json.errors?.length) {
    // Surface the first GraphQL error
    throw new Error(json.errors[0].message || "GraphQL error");
  }

  return json.data?.pool ?? null;
};

// ----- React Query hook -----
export const useGetPool = (poolId: string, source: CoinSource) => {
  return useQuery({
    queryKey: ["get-pool", poolId],
    queryFn: () => fetchPool(poolId, source),
    enabled: Boolean(poolId),
  });
};
