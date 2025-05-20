import { useQuery } from "@tanstack/react-query";
import { RawCoinData, CoinData, hydrateRawCoin, enrichMetadata } from "./coin-utils";
import { createPublicClient, http, formatUnits } from "viem";
import { CoinsMetadataHelperAbi, CoinsMetadataHelperAddress } from "@/constants/CoinsMetadataHelper";
import { mainnet } from "viem/chains";

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http("https://eth-mainnet.g.alchemy.com/v2/demo"),
});

const ALL_POOLS_QUERY = `
  query GetCoinPools($limit: Int = 1000) {
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

export function useCoinsData() {
  return useQuery<CoinData[], Error>({
    queryKey: ["coins-data"],
    queryFn: async () => {
      try {
        // 1) Hit the indexer directly with fetch
        const resp = await fetch(import.meta.env.VITE_INDEXER_URL! + "/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: ALL_POOLS_QUERY,
            variables: { limit: 1000 },
          }),
        });

        const { data, errors } = await resp.json();
        if (errors && errors.length) {
          console.warn("GraphQL fetch errors:", errors);
          throw new Error(errors.map((e: any) => e.message).join(", "));
        }

        // 2) Map each pool → one CoinData for coin1
        const pools: any[] = data.pools.items;

        const coinDataList = pools.map((pool) => {
          const c = pool.coin1;
          const raw: RawCoinData = {
            coinId: BigInt(c?.id ?? "0"),
            tokenURI: c?.tokenURI?.trim() ?? "",
            reserve0: BigInt(pool?.reserve0 ?? "0"),
            reserve1: BigInt(pool?.reserve1 ?? "0"),
            poolId: BigInt(pool?.id),
            liquidity: BigInt(0),
          };

          let cd = hydrateRawCoin(raw);

          // coin1 is what we want, so use price1
          cd = {
            ...cd,
            name: c?.name ?? "",
            symbol: c?.symbol ?? "",
            description: c?.description ?? "",
            imageUrl: c?.imageUrl?.trim() ?? "",
            metadata: null,
            // @ts-ignore
            price: Number(formatUnits(pool?.price1 ?? "0", c?.decimals ?? 18)),
          };

          return enrichMetadata(cd);
        });

        return Promise.all(coinDataList);
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
            : [rc.coinId, rc.tokenURI, rc.reserve0, rc.reserve1, rc.poolId, rc.liquidity];
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
