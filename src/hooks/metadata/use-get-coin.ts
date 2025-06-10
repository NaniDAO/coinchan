import { useQuery } from "@tanstack/react-query";

interface GetCoinData {
  id: bigint;
  name: string | null;
  symbol: string | null;
  description: string | null;
  imageUrl: string | null;
  decimals: number;
  totalSupply: bigint;
  poolId: bigint | undefined;
}

const fetchCoinData = async (coinId: string) => {
  console.log("FetchCoinData", coinId);
  const response = await fetch(import.meta.env.VITE_INDEXER_URL + "/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `
        query GetCoinData {
          coin(id: "${coinId.toString()}") {
            id
            name
            symbol
            description
            imageUrl
            decimals
            totalSupply
            pools {
              items {
                id
              }
            }
          }
        }
      `,
    }),
  });

  const json = await response.json();
  const coin = json.data.coin;

  console.log("UseGetCoin", coin);
  return {
    id: BigInt(coin.id),
    name: coin.name ? coin.name : "",
    symbol: coin.symbol ? coin.symbol : "",
    description: coin.description ? coin.description : "",
    imageUrl: coin.imageUrl ? coin.imageUrl : "",
    decimals: coin.decimals,
    totalSupply: BigInt(coin.totalSupply),
    poolId: BigInt(coin.pools.items?.[0]?.id) ?? undefined,
  };
};

export const useGetCoin = ({ coinId }: { coinId: string }) => {
  return useQuery<GetCoinData>({
    queryKey: ["getCoin", coinId],
    queryFn: () => fetchCoinData(coinId),
  });
};
