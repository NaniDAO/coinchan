import { SWAP_FEE } from "@/lib/swap";
import { useQuery } from "@tanstack/react-query";
import { formatEther } from "viem";

interface GetCoinData {
  id: bigint;
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  tokenURI: string;
  decimals: number;
  totalSupply: bigint;
  poolId: bigint | undefined;
  swapFee: bigint | undefined;
  marketCapEth: number | undefined;
}

const fetchCoinData = async (coinId: string) => {
  try {
    const response = await fetch(
      import.meta.env.VITE_INDEXER_URL + "/graphql",
      {
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
            tokenURI
            decimals
            totalSupply
            pools {
              items {
                id
                swapFee
                price1
              }
            }
          }
        }
      `,
        }),
      },
    );

    const json = await response.json();
    const coin = json.data.coin;

    return {
      id: BigInt(coin.id),
      name: coin.name ? coin.name : "",
      symbol: coin.symbol ? coin.symbol : "",
      description: coin.description ? coin.description : "",
      imageUrl: coin.imageUrl ? coin.imageUrl : "",
      tokenURI: coin.tokenURI ? coin.tokenURI : "",
      decimals: coin.decimals,
      totalSupply: BigInt(coin.totalSupply),
      poolId: coin.pools.items?.[0]?.id
        ? BigInt(coin.pools.items?.[0]?.id)
        : undefined,
      swapFee: coin.pools.items?.[0]?.swapFee
        ? BigInt(coin.pools.items?.[0]?.swapFee)
        : SWAP_FEE,
      marketCapEth:
        Number(formatEther(BigInt(coin?.totalSupply ?? 0n))) *
        Number(formatEther(BigInt(coin?.pools.items?.[0]?.price1 ?? 0n))),
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const useGetCoin = ({ coinId }: { coinId: string }) => {
  return useQuery<GetCoinData>({
    queryKey: ["getCoin", coinId],
    queryFn: () => fetchCoinData(coinId),
  });
};
