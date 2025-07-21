import { ZChefAbi, ZChefAddress } from "@/constants/zChef";
import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";
import { mainnet } from "viem/chains";
import { usePublicClient } from "wagmi";

interface Balance {
  coin_id: string;
  balance: string;
  coin_symbol: string;
  coin_name: string;
  coin_decimals: number;
}

interface Position {
  chef_id: string;
  shares: string;
  lp_id: string;
  reward_id: string;
  reward_symbol: string;
  pending_rewards: string;
}

interface UserPortfolio {
  user: string;
  balances: Balance[];
  positions: Position[];
}

export const useUserPortfolio = ({ address }: { address: Address }) => {
  const publicClient = usePublicClient({
    chainId: mainnet.id,
  });
  return useQuery({
    queryKey: ["user-portfolio", address],
    queryFn: async (): Promise<UserPortfolio> => {
      const response = await fetch(import.meta.env.VITE_INDEXER_URL + "/api/portfolio?address=" + address);

      if (!response.ok) {
        throw new Error("Failed to fetch user portfolio");
      }

      const data = await response.json();

      // fetch pending rewards for each position using multicall for better performance
      if (data.positions && data.positions.length > 0 && publicClient) {
        // Build contracts array for multicall
        const contracts = data.positions.map((position: Position) => ({
          abi: ZChefAbi,
          address: ZChefAddress as Address,
          functionName: "pendingReward",
          args: [
            BigInt(position.chef_id), // chefId
            address, // userId
          ],
        }));

        // Execute all calls in a single batch
        const pendingRewards = await publicClient.multicall({
          contracts,
          allowFailure: true, // Don't fail if one call fails
        });

        // Update positions with pending rewards
        data.positions = data.positions.map((position: Position, index: number) => {
          const result = pendingRewards[index];
          const pendingReward = result.status === "success" ? result.result : 0n;
          return {
            ...position,
            pending_rewards: pendingReward?.toString() || position.pending_rewards,
          };
        });
      }

      return data;
    },
  });
};
