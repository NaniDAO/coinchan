// hooks/useCoinsData.ts
import { useQuery } from "@tanstack/react-query";
import { GraphQLClient, gql } from "graphql-request";
import {
  RawCoinData,
  CoinData,
  hydrateRawCoin,
  enrichMetadata,
} from "./coin-utils";
import { createPublicClient, http, formatUnits, formatEther } from "viem";
import {
  CoinsMetadataHelperAbi,
  CoinsMetadataHelperAddress,
} from "@/constants/CoinsMetadataHelper";

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http("https://eth-mainnet.g.alchemy.com/v2/demo"),
});

const gqlClient = new GraphQLClient(
  process.env.NEXT_PUBLIC_PONDER_GRAPHQL_ENDPOINT!,
);

const ALL_COINS_QUERY = gql`
  query AllCoins {
    pool {
      id
      reserve0
      reserve1
      liquidity
      coin0 {
        id
        name
        symbol
        tokenURI
        imageUrl
        description
      }
    }
  }
`;

export function useCoinsData() {
  return useQuery<CoinData[], Error>({
    queryKey: ["coins-data"],
    queryFn: async () => {
      // 1) Try GraphQL first
      try {
        const { pool } = await gqlClient.request<{
          pool: Array<{
            id: string;
            reserve0: string;
            reserve1: string;
            liquidity: string;
            coin0: {
              id: string;
              name: string;
              symbol: string;
              tokenURI: string;
              imageUrl: string;
              description: string;
            };
          }>;
        }>(ALL_COINS_QUERY);

        // Map GraphQL results to our CoinData
        const coins: CoinData[] = await Promise.all(
          pool.map(async (p) => {
            const raw: RawCoinData = {
              coinId: BigInt(p.coin0.id),
              tokenURI: p.coin0.tokenURI,
              reserve0: BigInt(p.reserve0),
              reserve1: BigInt(p.reserve1),
              poolId: BigInt(p.id),
              liquidity: BigInt(p.liquidity),
            };
            let cd = hydrateRawCoin(raw);
            // fill in all the metadata straight from GraphQL
            cd = {
              ...cd,
              name: p.coin0.name,
              symbol: p.coin0.symbol,
              description: p.coin0.description,
              imageUrl: p.coin0.imageUrl,
              metadata: null, // if you want actual JSON metadata you can still enrich below
            };
            // optionally enrich JSON metadata
            return enrichMetadata(cd);
          }),
        );
        return Promise.all(coins);
      } catch (gqlErr) {
        console.warn("GraphQL failed, falling back to RPC:", gqlErr);

        // 2) RPC fallback
        const raw = (await publicClient.readContract({
          address: CoinsMetadataHelperAddress,
          abi: CoinsMetadataHelperAbi,
          functionName: "getAllCoinsData",
        })) as any[];

        const raws: RawCoinData[] = raw.map((rc: any) => {
          const [coinId, tokenURI, reserve0, reserve1, poolId, liquidity] =
            Array.isArray(rc)
              ? rc
              : [
                  rc.coinId,
                  rc.tokenURI,
                  rc.reserve0,
                  rc.reserve1,
                  rc.poolId,
                  rc.liquidity,
                ];
          return {
            coinId: BigInt(coinId),
            tokenURI: tokenURI?.toString() ?? "",
            reserve0: BigInt(reserve0 ?? 0),
            reserve1: BigInt(reserve1 ?? 0),
            poolId: BigInt(poolId ?? 0),
            liquidity: BigInt(liquidity ?? 0),
          };
        });

        const coins = raws.map(hydrateRawCoin);
        return Promise.all(coins.map(enrichMetadata));
      }
    },
    staleTime: 5 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
  });
}
