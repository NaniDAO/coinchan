import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { useOfflineHandling } from "./use-offline-handling";

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
  const { isIndexerAvailable } = useOfflineHandling();

  return useQuery({
    queryKey: ["activeIncentiveStreams"],
    queryFn: async (): Promise<IncentiveStream[]> => {
      // Try indexer first
      if (isIndexerAvailable) {
        try {
          const response = await fetch(
            `${INDEXER_URL}/incentive-streams?status=ACTIVE`,
          );
          if (response.ok) {
            return response.json();
          }
        } catch (error) {
          console.warn(
            "Indexer request failed, falling back to contract:",
            error,
          );
        }
      }

      // Fallback to contract view methods
      // Note: We can't easily enumerate all streams from contract, so return empty array
      // In a real implementation, you might maintain a list of known stream IDs
      console.warn("Using contract fallback - limited stream data available");
      return [];
    },
    staleTime: isIndexerAvailable ? 30000 : 10000, // Shorter cache for fallback mode
    retry: (failureCount) => {
      // Don't retry if we're already using fallback
      return isIndexerAvailable && failureCount < 3;
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
  const { isIndexerAvailable } = useOfflineHandling();

  return useQuery({
    queryKey: ["userIncentivePositions", targetAddress],
    queryFn: async (): Promise<IncentiveUserPosition[]> => {
      if (!targetAddress) return [];

      // Try indexer first
      if (isIndexerAvailable) {
        try {
          const response = await fetch(
            `${INDEXER_URL}/incentive-positions?user=${targetAddress}`,
          );
          if (response.ok) {
            return response.json();
          }
        } catch (error) {
          console.warn(
            "Indexer request failed, falling back to contract:",
            error,
          );
        }
      }

      // Fallback to contract view methods
      // Note: We can't enumerate user positions from contract without knowing chefIds
      // In a real implementation, you might track user's chefIds in local storage
      console.warn("Using contract fallback - limited position data available");
      return [];
    },
    enabled: !!targetAddress,
    staleTime: isIndexerAvailable ? 15000 : 5000, // Shorter cache for fallback mode
    retry: (failureCount) => {
      return isIndexerAvailable && failureCount < 3;
    },
  });
}

export function useUserIncentivePosition(
  chefId: bigint | undefined,
  userAddress?: `0x${string}`,
) {
  const { address } = useAccount();
  const targetAddress = userAddress || address;
  const { isIndexerAvailable, getUserPositionFromContract } =
    useOfflineHandling();

  return useQuery({
    queryKey: ["userIncentivePosition", chefId?.toString(), targetAddress],
    queryFn: async (): Promise<IncentiveUserPosition | null> => {
      if (!chefId || !targetAddress) return null;

      // Try indexer first
      if (isIndexerAvailable) {
        try {
          const response = await fetch(
            `${INDEXER_URL}/incentive-positions/${chefId}/${targetAddress}`,
          );
          if (response.ok) {
            return response.json();
          }
          if (response.status === 404) return null;
        } catch (error) {
          console.warn(
            "Indexer request failed, falling back to contract:",
            error,
          );
        }
      }

      // Fallback to contract view methods
      return await getUserPositionFromContract(chefId, targetAddress);
    },
    enabled: !!chefId && !!targetAddress,
    staleTime: isIndexerAvailable ? 15000 : 5000,
    retry: (failureCount) => {
      return isIndexerAvailable && failureCount < 3;
    },
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
