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
      const response = await fetch(
        import.meta.env.VITE_INDEXER_URL + "/api/portfolio?address=" + address,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch user portfolio");
      }

      const data = await response.json();

      // fetch pending rewards for each position
      if (data.positions && data.positions.length > 0) {
        const pendingRewards = await Promise.all(
          data.positions.map(async (position: Position) => {
            return await publicClient?.readContract({
              abi: ZChefAbi,
              address: ZChefAddress,
              functionName: "pendingReward",
              args: [
                BigInt(position.chef_id), // chefId,
                address, // userId
              ],
            });
          }),
        );

        // Update positions with pending rewards
        data.positions = data.positions.map(
          (position: Position, index: number) => ({
            ...position,
            pending_rewards:
              pendingRewards[index]?.toString() || position.pending_rewards,
          }),
        );
      }

      return data;
    },
  });
};
