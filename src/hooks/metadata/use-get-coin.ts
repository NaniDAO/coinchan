import { SWAP_FEE } from "@/lib/swap";
import { useQuery } from "@tanstack/react-query";
import { formatEther } from "viem";
import { formatImageURL } from "./coin-utils";

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

const fetchMetadata = async (tokenURI: string) => {
  try {
    const response = await fetch(formatImageURL(tokenURI));
    const json = await response.json();
    return json;
  } catch (error) {
    console.error("Error fetching metadata:", error);
    return null;
  }
};

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

    // call tokenUri to get latest metadata
    const metadata = await fetchMetadata(coin.tokenURI);

    console.log("use-get-coin", metadata);

    return {
      id: BigInt(coin.id),
      name: coin.name == null || coin.name === "" ? metadata.name : coin.name,
      symbol:
        coin.symbol == null || coin.symbol === ""
          ? metadata.symbol
          : coin.symbol,
      description:
        coin.description == null || coin.description === ""
          ? metadata.description
          : coin.description,
      imageUrl:
        coin.imageUrl == null || coin.imageUrl === ""
          ? metadata.image
          : coin.imageUrl,
      tokenURI: coin.tokenURI ? coin.tokenURI : "",
      decimals: coin.decimals,
      totalSupply: BigInt(coin?.totalSupply ?? 0n),
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
