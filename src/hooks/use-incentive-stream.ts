import { CoinSource, TokenMeta } from "@/lib/coins";
import { useQuery } from "@tanstack/react-query";
import { IncentiveStream } from "./use-incentive-streams";
import { Hex } from "viem";

const INDEXER_URL = import.meta.env.VITE_INDEXER_URL;

if (!INDEXER_URL) {
  throw new Error("INDEXER_URL is not defined");
}

// GraphQL query
const GET_INCENTIVE_STREAM = `
  query GetIncentiveStream($chefId: BigInt!) {
    incentiveStream(chefId: $chefId) {
      accRewardPerShare
      chefId
      blockNumber
      createdAt
      creator
      duration
      endTime
      lastUpdate
      lpId
      lpToken
      rewardAmount
      rewardId
      rewardRate
      rewardToken
      startTime
      status
      totalShares
      txHash
      updatedAt
      rewardCoin {
        name
        symbol
        decimals
        imageUrl
      }
      lpPool {
        coin0Id
        coin1Id
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
          name
          symbol
          decimals
        }
        coin1 {
          name
          symbol
          decimals
          imageUrl
        }
      }
    }
  }
`;

interface GraphQLIncentiveStream {
  accRewardPerShare: string;
  chefId: string;
  blockNumber: string;
  createdAt: string;
  creator: string;
  duration: string;
  endTime: string;
  lastUpdate: string;
  lpId: string;
  lpToken: string;
  rewardAmount: string;
  rewardId: string;
  rewardRate: string;
  rewardToken: string;
  startTime: string;
  status: string;
  totalShares: string;
  txHash: string;
  updatedAt: string;
  rewardCoin: {
    name: string;
    symbol: string;
    decimals: number;
    imageUrl: string;
  };
  lpPool: {
    coin0Id: string;
    coin1Id: string;
    feeOrHook: string;
    hook: string;
    hookType: string;
    id: string;
    price0: string;
    price1: string;
    reserve0: string;
    reserve1: string;
    source: string;
    swapFee: string;
    token0: string;
    token1: string;
    updatedAt: string;
    coin0: {
      name: string;
      symbol: string;
      decimals: number;
    };
    coin1: {
      name: string;
      symbol: string;
      decimals: number;
      imageUrl: string;
    };
  };
}

// Helper function to convert string to bigint safely
function toBigInt(value: string): bigint {
  return BigInt(value || "0");
}

// Transform GraphQL response to typed interfaces
function transformIncentiveStreamData(data: GraphQLIncentiveStream): {
  stream: IncentiveStream;
  lpToken: TokenMeta;
} {
  const stream: IncentiveStream = {
    chefId: toBigInt(data.chefId),
    lpId: toBigInt(data.lpId),
    rewardId: toBigInt(data.rewardId),
    creator: data.creator as `0x${string}`,
    rewardToken: data.rewardToken as `0x${string}`,
    lpToken: data.lpToken as `0x${string}`,
    rewardAmount: toBigInt(data.rewardAmount),
    rewardRate: toBigInt(data.rewardRate),
    startTime: toBigInt(data.startTime),
    endTime: toBigInt(data.endTime),
    duration: toBigInt(data.duration),
    totalShares: toBigInt(data.totalShares),
    accRewardPerShare: toBigInt(data.accRewardPerShare),
    lastUpdate: toBigInt(data.lastUpdate),
    // @ts-ignore
    status: data.status,
    blockNumber: toBigInt(data.blockNumber),
    txHash: data.txHash as Hex,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    rewardCoin: {
      id: BigInt(data.rewardId),
      name: data.rewardCoin.name,
      symbol: data.rewardCoin.symbol,
      decimals: data.rewardCoin.decimals,
      imageUrl: data.rewardCoin.imageUrl,
    },
  };

  // Create LP token metadata from pool information
  const lpToken: TokenMeta = {
    id: toBigInt(data.lpPool.id),
    name: `${data.lpPool.coin0.symbol}-${data.lpPool.coin1.symbol} LP`,
    symbol: `${data.lpPool.coin0.symbol}/${data.lpPool.coin1.symbol}`,
    source: data.lpPool.source as CoinSource,
    reserve0: toBigInt(data.lpPool.reserve0),
    reserve1: toBigInt(data.lpPool.reserve1),
    swapFee: toBigInt(data.lpPool.swapFee),
    token0: data.lpPool.token0 as `0x${string}`,
    token1: data.lpPool.token1 as `0x${string}`,
    poolId: toBigInt(data.lpPool.id),
    poolKey: {
      id0: toBigInt(data.lpPool.coin0Id),
      id1: toBigInt(data.lpPool.coin1Id),
      token0: data.lpPool.token0 as `0x${string}`,
      token1: data.lpPool.token1 as `0x${string}`,
      swapFee: toBigInt(data.lpPool.swapFee),
    },
    imageUrl: data.lpPool.coin1.imageUrl,
    decimals: 18, // LP tokens typically have 18 decimals
  };

  return { stream, lpToken };
}

export function useIncentiveStream(chefId: string) {
  return useQuery({
    queryKey: ["incentiveStream", chefId],
    queryFn: async (): Promise<{
      stream: IncentiveStream;
      lpToken: TokenMeta;
    } | null> => {
      if (!chefId) {
        throw new Error("Chef ID is required");
      }

      try {
        const response = await fetch(`${INDEXER_URL}/graphql`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: GET_INCENTIVE_STREAM,
            variables: {
              chefId: chefId.toString(),
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.errors) {
          throw new Error(
            `GraphQL errors: ${result.errors.map((e: any) => e.message).join(", ")}`,
          );
        }

        if (!result.data?.incentiveStream) {
          return null; // Stream not found
        }

        return transformIncentiveStreamData(result.data.incentiveStream);
      } catch (error) {
        console.error("Error fetching incentive stream:", error);
        throw error;
      }
    },
    enabled: !!chefId,
    staleTime: 30000, // 30 seconds
  });
}
