import { SWAP_FEE } from "@/lib/swap";
import { useQuery } from "@tanstack/react-query";
import { Address, formatEther } from "viem";
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

const fetchCoinData = async (coinId: string, token: Address) => {
  try {
    const response = await fetch(import.meta.env.VITE_INDEXER_URL + "/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `
            query GetCoinData {
              coin(id: "${coinId.toString()}", token: "${token.toString()}") {
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
    });

    const json = await response.json();

    const coin = json.data.coin;

    const metadata = await fetchMetadata(coin.tokenURI).catch((e) =>
      console.error("Error fetching latest metadata", e),
    );
    const totalSupply = BigInt(coin?.totalSupply ?? 0n);

    const pools = (coin.pools.items || []).map((pool: any) => {
      const price1 = BigInt(pool?.price1 ?? 0n);
      const marketCapEth = Number(formatEther(totalSupply)) * Number(formatEther(price1));

      return {
        poolId: BigInt(pool.id),
        swapFee: BigInt(pool.swapFee ?? SWAP_FEE),
        marketCapEth,
        coin0Id: BigInt(pool.coin0Id),
        price1: price1,
      };
    });

    // Calculate market cap using the pool with the highest liquidity (highest price typically indicates more liquidity)
    // Only consider ETH pools (coin0Id === 0n)
    const ethPools = pools.filter((pool: any) => BigInt(pool.coin0Id) === 0n);

    let combinedMarketCapEth = 0;
    if (ethPools.length > 0) {
      // Use the pool with the highest price as it typically has the most liquidity
      // Alternatively, we could fetch actual reserves to determine liquidity
      const primaryPool = ethPools.reduce((max: any, pool: any) => {
        return pool.price1 > max.price1 ? pool : max;
      }, ethPools[0]);

      combinedMarketCapEth = primaryPool.marketCapEth;
    }

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

export const useGetCoin = ({
  coinId,
  token,
}: {
  coinId: string;
  token: Address;
}) => {
  return useQuery<GetCoinData>({
    queryKey: ["getCoin", coinId],
    queryFn: () => fetchCoinData(coinId, token),
  });
};
