import { useQuery } from "@tanstack/react-query";
import {
  RawCoinData,
  CoinData,
  hydrateRawCoin,
  enrichMetadata,
} from "./coin-utils";
import { createPublicClient, http, formatUnits } from "viem";
import {
  CoinsMetadataHelperAbi,
  CoinsMetadataHelperAddress,
} from "@/constants/CoinsMetadataHelper";
import { mainnet } from "viem/chains";

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http("https://eth-mainnet.g.alchemy.com/v2/demo"),
});

const ALL_POOLS_QUERY = `
  query GetCoinPools($limit: Int = 1000) {
  sales(where: {status_not: FINALIZED}) {
      items {
        id
        status
        coin {
          id
          name
          symbol
          description
          imageUrl
          tokenURI
          decimals
        }
      }
    }

    pools(
      where: { reserve0_not: null }
      limit: $limit
      orderBy: "reserve0"
      orderDirection: "desc"
    ) {
      items {
        id
        reserve0
        reserve1
        price0
        price1
        coin1 {
          id
          name
          symbol
          description
          imageUrl
          tokenURI
          decimals
        }
      }
    }
  }
`;

export const getVotesForAllCoins = async () => {
  const data = await fetch(
    import.meta.env.VITE_ZAMMHUB_URL + "/api/votes",
  ).then((res) => res.json());

  return data as Record<string, string>;
};

export function useCoinsData() {
  return useQuery<CoinData[], Error>({
    queryKey: ["coins-data"],
    queryFn: async () => {
      try {
        const resp = await fetch(
          `${import.meta.env.VITE_INDEXER_URL}/api/coins`,
        );
        if (!resp.ok) {
          throw new Error(`Indexer error: ${resp.statusText}`);
        }

        const raw = (await resp.json()) as Array<{
          coinId: string;
          tokenURI: string;
          name: string;
          symbol: string;
          description: string;
          imageUrl: string;
          decimals: number;
          poolId: string | null;
          reserve0: string;
          reserve1: string;
          priceInEth: number | null;
          saleStatus: "ACTIVE" | "EXPIRED" | "FINALIZED" | null;
          votes: string;
        }>;

        return raw.map((c) => ({
          coinId: BigInt(c.coinId),
          tokenURI: c.tokenURI,
          reserve0: BigInt(c.reserve0),
          reserve1: BigInt(c.reserve1),
          poolId: c.poolId ? BigInt(c.poolId) : 0n,
          liquidity: 0n, // or compute server-side if you like
          name: c.name,
          symbol: c.symbol,
          description: c.description,
          imageUrl: c.imageUrl,
          metadata: null, // you said “don’t bother with metadata”
          priceInEth: c.priceInEth,
          votes: BigInt(c.votes),
          saleStatus: c.saleStatus,
        }));
      } catch (err) {
        console.warn("Fetch failed, falling back to RPC:", err);

        // --- your existing RPC fallback below unchanged ---
        const rawRpc = (await publicClient.readContract({
          address: CoinsMetadataHelperAddress,
          abi: CoinsMetadataHelperAbi,
          functionName: "getAllCoinsData",
        })) as any[];

        const raws: RawCoinData[] = rawRpc.map((rc: any) => {
          const arr = Array.isArray(rc)
            ? rc
            : [
                rc.coinId,
                rc.tokenURI,
                rc.reserve0,
                rc.reserve1,
                rc.poolId,
                rc.liquidity,
              ];
          const [coinId, tokenURI, reserve0, reserve1, poolId, liquidity] = arr;
          return {
            coinId: BigInt(coinId ?? 0),
            tokenURI: tokenURI?.toString() ?? "",
            reserve0: BigInt(reserve0 ?? 0),
            reserve1: BigInt(reserve1 ?? 0),
            poolId: BigInt(poolId ?? 0),
            liquidity: BigInt(liquidity ?? 0),
          };
        });

        const coinsData = raws.map(hydrateRawCoin).map(enrichMetadata);
        return Promise.all(coinsData);
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}
