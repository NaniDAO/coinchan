import { useQuery } from "@tanstack/react-query";

const GET_USER_LP_POSITIONS = `
  query GetUserLpPosition($user: String!, $after: String, $before: String, $limit: Int) {
    lpUserPositions(where: { user: $user }, after: $after, before: $before, limit: $limit) {
      totalCount
      items {
        liquidity
        poolId
        updatedAt
        pool {
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
            id
            imageUrl
            name
            source
            symbol
            token
            decimals
            description
          }
          coin1 {
            id
            imageUrl
            name
            source
            symbol
            token
            decimals
            description
          }
        }
      }
      # If your API exposes pageInfo, keep this; otherwise you can delete it.
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

// ---- Types ----
type Coin = {
  id: string;
  imageUrl?: string | null;
  name: string;
  source?: string | null;
  symbol: string;
  token: string;
  decimals: number;
  description?: string | null;
};

type Pool = {
  feeOrHook?: string | null;
  hook?: string | null;
  hookType?: string | null;
  id: string;
  price0?: string | number | null;
  price1?: string | number | null;
  reserve0?: string | number | null;
  reserve1?: string | number | null;
  source?: string | null;
  swapFee?: string | number | null;
  token0?: string | null;
  token1?: string | null;
  updatedAt?: string | number | null;
  coin0: Coin;
  coin1: Coin;
};

export type LpUserPositionItem = {
  liquidity: string | number;
  poolId: string;
  updatedAt?: string | number | null;
  pool: Pool;
};

export type PageInfo = {
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
  startCursor?: string | null;
  endCursor?: string | null;
};

export type LpUserPositions = {
  totalCount: number;
  items: LpUserPositionItem[];
  pageInfo?: PageInfo;
};

type GraphQLError = { message: string };
type GQLResponse<T> = { data?: T; errors?: GraphQLError[] };

export const fetchUserLpPositions = async (
  address: string,
  opts?: { after?: string; before?: string; limit?: number },
): Promise<LpUserPositions> => {
  const { after, before, limit = 100 } = opts || {};
  const response = await fetch(`${import.meta.env.VITE_INDEXER_URL}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: GET_USER_LP_POSITIONS,
      variables: {
        user: address.toLowerCase(),
        after,
        before,
        limit,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch LP positions (${response.status})`);
  }

  const json: GQLResponse<{ lpUserPositions: LpUserPositions }> =
    await response.json();

  if (json.errors?.length) {
    throw new Error(json.errors[0].message || "GraphQL error");
  }

  return (
    json.data?.lpUserPositions ?? {
      totalCount: 0,
      items: [],
    }
  );
};

export const useGetUserLpPositions = (
  address: string | undefined,
  opts?: { after?: string; before?: string; limit?: number },
) => {
  return useQuery({
    queryKey: ["get-user-lp-positions", address?.toLowerCase(), opts],
    queryFn: () =>
      fetchUserLpPositions(address!.toLowerCase(), {
        after: opts?.after,
        before: opts?.before,
        limit: opts?.limit,
      }),
    enabled: Boolean(address && address.length > 0),
    staleTime: 30_000,
  });
};
