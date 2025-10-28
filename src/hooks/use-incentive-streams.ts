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
      const response = await fetch(`${INDEXER_URL}/api/incentive-streams`);
      if (!response.ok) {
        throw new Error("Failed to fetch incentive streams");
      }

      const data = await response.json();

      return data.map(
        (stream: any): IncentiveStream => ({
          chefId: BigInt(stream.chef_id),
          creator: stream.creator,
          lpToken: stream.lp_token,
          lpId: BigInt(stream.lp_id),
          rewardToken: stream.reward_token,
          rewardId: BigInt(stream.reward_id),
          rewardAmount: BigInt(stream.reward_amount),
          rewardRate: BigInt(stream.reward_rate),
          duration: BigInt(stream.duration),
          startTime: BigInt(stream.start_time),
          endTime: BigInt(stream.end_time),
          lastUpdate: BigInt(stream.last_update),
          totalShares: BigInt(stream.total_shares || "0"),
          accRewardPerShare: BigInt(stream.acc_reward_per_share),
          status: stream.status,
          createdAt: stream.created_at,
          updatedAt: stream.updated_at,
          txHash: stream.tx_hash,
          blockNumber: BigInt(stream.block_number),
          rewardCoin: {
            id: BigInt(stream.reward_id),
            name: stream.reward_token_name,
            symbol: stream.reward_token_symbol,
            imageUrl: stream.reward_token_image_url,
            decimals: stream.reward_token_decimals,
          },
        }),
      );
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
                  rewardCoin {
                    name
                    symbol
                    decimals
                  }
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

export function useUserIncentivePositions(userAddress?: `0x${string}`) {
  const { address } = useAccount();
  const targetAddress = userAddress || address;

  return useQuery({
    queryKey: ["userIncentivePositions", targetAddress],
    queryFn: async (): Promise<IncentiveUserPosition[]> => {
      if (!targetAddress) return [];

      const response = await fetch(`${INDEXER_URL}/graphql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
            query GetIncentiveStreams($userId: String!) {
              incentiveUserPositions(where: { user: $userId }) {
                items {
                  chefId
                  createdAt
                  pendingRewards
                  rewardDebt
                  shares
                  totalDeposited
                  totalWithdrawn
                  totalHarvested
                  updatedAt
                  user
                  incentiveStream {
                    creator
                    lpToken
                    lpId
                    rewardAmount
                    rewardId
                    rewardRate
                    rewardToken
                    startTime
                    endTime
                    totalShares
                    accRewardPerShare
                    status
                    rewardCoin {
                      name
                      decimals
                      symbol
                    }
                  }
                }
              }
            }
            `,
          variables: {
            userId: targetAddress,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch incentive positions");
      }

      const data = await response.json();

      const positions = data.data.incentiveUserPositions.items;

      const formattedPositions = positions.map((pos: any) => {
        return {
          chefId: BigInt(pos.chefId),
          user: pos.user,
          shares: BigInt(pos.shares),
          rewardDebt: BigInt(pos.rewardDebt),
          pendingRewards: BigInt(pos.pendingRewards),
          totalDeposited: BigInt(pos.totalDeposited),
          totalWithdrawn: BigInt(pos.totalWithdrawn),
          totalHarvested: BigInt(pos.totalHarvested),
          createdAt: pos.createdAt,
          updatedAt: pos.updatedAt,
        };
      });

      return formattedPositions;
    },
    enabled: !!targetAddress,
  });
}

export function useUserIncentivePosition(chefId: bigint | undefined, userAddress?: `0x${string}`) {
  const { address } = useAccount();
  const targetAddress = userAddress || address;

  return useQuery({
    queryKey: ["userIncentivePosition", chefId?.toString(), targetAddress],
    queryFn: async (): Promise<IncentiveUserPosition | null> => {
      if (!chefId || !targetAddress) return null;

      const response = await fetch(`${INDEXER_URL}/api/incentive-positions/${chefId}/${targetAddress}`);
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
      const url = `${INDEXER_URL}/api/incentive-streams?poolId=${lpId}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch incentive streams by LP pool");
      }

      const data = await response.json();

      // Transform the raw data to match IncentiveStream interface
      return data.map((stream: any): IncentiveStream => {
        const transformed = {
          chefId: BigInt(stream.chef_id || stream.chefId || "0"),
          creator: stream.creator,
          lpToken: stream.lp_token || stream.lpToken,
          lpId: BigInt(stream.lp_id || stream.lpId || "0"),
          rewardToken: stream.reward_token || stream.rewardToken,
          rewardId: BigInt(stream.reward_id || stream.rewardId || "0"),
          rewardAmount: BigInt(stream.reward_amount || stream.rewardAmount || "0"),
          rewardRate: BigInt(stream.reward_rate || stream.rewardRate || "0"),
          duration: BigInt(stream.duration || "0"),
          startTime: BigInt(stream.start_time || stream.startTime || "0"),
          endTime: BigInt(stream.end_time || stream.endTime || "0"),
          lastUpdate: BigInt(stream.last_update || stream.lastUpdate || "0"),
          totalShares: BigInt(stream.total_shares || stream.totalShares || "0"),
          accRewardPerShare: BigInt(stream.acc_reward_per_share || stream.accRewardPerShare || "0"),
          status: stream.status || "ACTIVE",
          createdAt: stream.created_at || stream.createdAt,
          updatedAt: stream.updated_at || stream.updatedAt,
          txHash: stream.tx_hash || stream.txHash,
          blockNumber: BigInt(stream.block_number || stream.blockNumber || "0"),
          rewardCoin: stream.rewardCoin || {
            id: BigInt(stream.reward_id || stream.rewardId || "0"),
            name: stream.reward_token_name || stream.rewardTokenName || "",
            symbol: stream.reward_token_symbol || stream.rewardTokenSymbol || "",
            imageUrl: stream.reward_token_image_url || stream.rewardTokenImageUrl || "",
            decimals: stream.reward_token_decimals || stream.rewardTokenDecimals || 18,
          },
        };

        return transformed;
      });
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
      const response = await fetch(`${INDEXER_URL}/api/incentive-streams/${chefId}/apy`);
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

export function useIncentiveStreamHistory(chefId: bigint | undefined, userAddress?: `0x${string}`) {
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
      if (!chefId || !targetAddress) return { deposits: [], withdraws: [], harvests: [] };
      const response = await fetch(`${INDEXER_URL}/api/incentive-streams/${chefId}/history?user=${targetAddress}`);
      if (!response.ok) {
        throw new Error("Failed to fetch incentive stream history");
      }
      return response.json();
    },
    enabled: !!chefId && !!targetAddress,
    staleTime: 30000,
  });
}
