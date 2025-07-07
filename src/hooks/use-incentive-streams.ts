import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";

export interface IncentiveStream {
  chefId: bigint;
  creator: `0x${string}`;
  lpToken: `0x${string}`;
  lpId: bigint;
  rewardToken: `0x${string}`;
  rewardId: bigint;
  rewardAmount: bigint;
  rewardRate: bigint;
  duration: bigint;
  startTime: bigint;
  endTime: bigint;
  lastUpdate: bigint;
  totalShares: bigint;
  accRewardPerShare: bigint;
  status: "ACTIVE" | "ENDED" | "SWEPT";
  createdAt: string;
  updatedAt: string;
  txHash: `0x${string}`;
  blockNumber: bigint;
  lpPool?: {
    id: bigint;
    coin: {
      id: bigint;
      name: string;
      symbol: string;
      imageUrl: string;
    };
    liquidity: bigint;
    price: bigint;
    volume24h: bigint;
  };
  rewardCoin?: {
    id: bigint;
    name: string;
    symbol: string;
    imageUrl: string;
    decimals: number;
  };
}

export interface IncentiveUserPosition {
  chefId: bigint;
  user: `0x${string}`;
  shares: bigint;
  rewardDebt: bigint;
  pendingRewards: bigint;
  totalDeposited: bigint;
  totalWithdrawn: bigint;
  totalHarvested: bigint;
  createdAt: string;
  updatedAt: string;
}

// Validate indexer URL at module load time
const INDEXER_URL = import.meta.env.VITE_INDEXER_URL;

export function useIncentiveStreams() {
  return useQuery({
    queryKey: ["incentiveStreams"],
    queryFn: async (): Promise<IncentiveStream[]> => {
      const response = await fetch(`${INDEXER_URL}/incentive-streams`);
      if (!response.ok) {
        throw new Error("Failed to fetch incentive streams");
      }
      return response.json();
    },
    staleTime: 30000, // 30 seconds
  });
}

export function useActiveIncentiveStreams() {
  return useQuery({
    queryKey: ["activeIncentiveStreams"],
    queryFn: async (): Promise<IncentiveStream[]> => {
      const response = await fetch(`${INDEXER_URL}/graphql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
            query GetIncentiveStreams {
              incentiveStreams(where: {status: ACTIVE}) {
                items {
                  accRewardPerShare
                  blockNumber
                  chefId
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
                }
              }
            }
            `,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch active incentive streams");
      }
      const data = await response.json();

      return data.data.incentiveStreams.items;
    },
  });
}

export function useIncentiveStream(chefId: bigint | undefined) {
  return useQuery({
    queryKey: ["incentiveStream", chefId?.toString()],
    queryFn: async (): Promise<IncentiveStream | null> => {
      if (!chefId) return null;
      const response = await fetch(
        `${INDEXER_URL}/incentive-streams/${chefId}`,
      );
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error("Failed to fetch incentive stream");
      }
      return response.json();
    },
    enabled: !!chefId,
    staleTime: 30000,
  });
}

export function useUserIncentivePositions(userAddress?: `0x${string}`) {
  const { address } = useAccount();
  const targetAddress = userAddress || address;

  return useQuery({
    queryKey: ["userIncentivePositions", targetAddress],
    queryFn: async (): Promise<IncentiveUserPosition[]> => {
      if (!targetAddress) return [];

      const response = await fetch(
        `${INDEXER_URL}/incentive-positions?user=${targetAddress}`,
      );
      if (response.ok) {
        throw new Error("Failed to fetch incentive positions");
      }
      return response.json();
    },
    enabled: !!targetAddress,
  });
}

export function useUserIncentivePosition(
  chefId: bigint | undefined,
  userAddress?: `0x${string}`,
) {
  const { address } = useAccount();
  const targetAddress = userAddress || address;

  return useQuery({
    queryKey: ["userIncentivePosition", chefId?.toString(), targetAddress],
    queryFn: async (): Promise<IncentiveUserPosition | null> => {
      if (!chefId || !targetAddress) return null;

      const response = await fetch(
        `${INDEXER_URL}/incentive-positions/${chefId}/${targetAddress}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch user incentive position");
      }
      if (response.status === 404) {
        throw new Error("User incentive position not found");
      }

      return response.json();
    },
    enabled: !!chefId && !!targetAddress,
  });
}

export function useIncentiveStreamsByLpPool(lpId: bigint | undefined) {
  return useQuery({
    queryKey: ["incentiveStreamsByLpPool", lpId?.toString()],
    queryFn: async (): Promise<IncentiveStream[]> => {
      if (!lpId) return [];
      const response = await fetch(
        `${INDEXER_URL}/incentive-streams?lpId=${lpId}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch incentive streams by LP pool");
      }
      return response.json();
    },
    enabled: !!lpId,
    staleTime: 30000,
  });
}

export function useIncentiveStreamAPY(chefId: bigint | undefined) {
  return useQuery({
    queryKey: ["incentiveStreamAPY", chefId?.toString()],
    queryFn: async (): Promise<{
      apy: number;
      dailyRewards: bigint;
      totalValueLocked: bigint;
    } | null> => {
      if (!chefId) return null;
      const response = await fetch(
        `${INDEXER_URL}/incentive-streams/${chefId}/apy`,
      );
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error("Failed to fetch incentive stream APY");
      }
      return response.json();
    },
    enabled: !!chefId,
    staleTime: 60000, // 1 minute for APY data
  });
}

export function useIncentiveStreamHistory(
  chefId: bigint | undefined,
  userAddress?: `0x${string}`,
) {
  const { address } = useAccount();
  const targetAddress = userAddress || address;

  return useQuery({
    queryKey: ["incentiveStreamHistory", chefId?.toString(), targetAddress],
    queryFn: async (): Promise<{
      deposits: Array<{
        id: string;
        amount: bigint;
        shares: bigint;
        timestamp: bigint;
        txHash: `0x${string}`;
      }>;
      withdraws: Array<{
        id: string;
        shares: bigint;
        amount: bigint;
        pendingRewards: bigint;
        timestamp: bigint;
        txHash: `0x${string}`;
      }>;
      harvests: Array<{
        id: string;
        rewardAmount: bigint;
        timestamp: bigint;
        txHash: `0x${string}`;
      }>;
    }> => {
      if (!chefId || !targetAddress)
        return { deposits: [], withdraws: [], harvests: [] };
      const response = await fetch(
        `${INDEXER_URL}/incentive-streams/${chefId}/history?user=${targetAddress}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch incentive stream history");
      }
      return response.json();
    },
    enabled: !!chefId && !!targetAddress,
    staleTime: 30000,
  });
}
