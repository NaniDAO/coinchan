import { SWAP_FEE } from "@/lib/swap";
import { useQuery } from "@tanstack/react-query";
import { formatEther } from "viem";
import { formatImageURL } from "./coin-utils";

interface PoolData {
  poolId: bigint;
  swapFee: bigint;
  marketCapEth: number;
}

interface GetCoinData {
  id: bigint;
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  tokenURI: string;
  decimals: number;
  totalSupply: bigint;
  pools: PoolData[];
  marketCapEth: number | undefined;
}

const fetchMetadata = async (tokenURI: string) => {
  try {
    const url = formatImageURL(tokenURI);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

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
                    coin0Id
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

    const metadata = await fetchMetadata(coin.tokenURI).catch((e) =>
      console.error("Error fetching latest metadata", e),
    );
    const totalSupply = BigInt(coin?.totalSupply ?? 0n);

    const pools = (coin.pools.items || []).map((pool: any) => {
      const price1 = BigInt(pool?.price1 ?? 0n);
      const marketCapEth =
        Number(formatEther(totalSupply)) * Number(formatEther(price1));

      return {
        poolId: BigInt(pool.id),
        swapFee: BigInt(pool.swapFee ?? SWAP_FEE),
        marketCapEth,
        coin0Id: BigInt(pool.coin0Id),
      };
    });

    const combinedMarketCapEth = pools.reduce((sum: number, pool: any) => {
      // @TODO convert coin-to-coin pools to eth
      if (BigInt(pool.coin0Id) === 0n) {
        return sum + pool.marketCapEth;
      }
      return sum;
    }, 0);

    return {
      id: BigInt(coin.id),
      name: coin?.name || metadata?.name,
      symbol: coin?.symbol || metadata?.symbol,
      description: coin?.description || metadata?.description,
      imageUrl: coin?.imageUrl || metadata?.image,
      tokenURI: coin.tokenURI ?? "",
      decimals: coin.decimals,
      totalSupply,
      pools,
      marketCapEth: combinedMarketCapEth,
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
