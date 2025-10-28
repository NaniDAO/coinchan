import { useQuery } from "@tanstack/react-query";
import { useAccount, useReadContracts } from "wagmi";
import { ZChefAbi, ZChefAddress } from "@/constants/zChef";
import { useIncentiveStreams } from "./use-incentive-streams";
import type { IncentiveUserPosition } from "./use-incentive-streams";

/**
 * Hook to read user farm positions directly from the blockchain
 * This serves as a fallback when the indexer is out of sync
 */
export function useUserFarmPositionsFromContract() {
  const { address } = useAccount();
  const { data: allStreams } = useIncentiveStreams();

  // Create contract calls for all streams to check user balance
  const contracts = allStreams?.map((stream) => ({
    address: ZChefAddress as `0x${string}`,
    abi: ZChefAbi,
    functionName: "balanceOf" as const,
    args: [address!, stream.chefId] as const,
  }));

  const { data: balances } = useReadContracts({
    contracts: contracts || [],
    query: {
      enabled: !!address && !!allStreams && allStreams.length > 0,
      staleTime: 30000,
    },
  });

  return useQuery({
    queryKey: ["userFarmPositionsFromContract", address, allStreams?.length],
    queryFn: async (): Promise<IncentiveUserPosition[]> => {
      if (!address || !allStreams || !balances) return [];

      const positions: IncentiveUserPosition[] = [];

      for (let i = 0; i < allStreams.length; i++) {
        const balance = balances[i];
        const stream = allStreams[i];

        // Check if balance read was successful and > 0
        if (
          balance?.status === "success" &&
          balance.result !== undefined &&
          typeof balance.result === "bigint" &&
          balance.result > 0n
        ) {
          positions.push({
            chefId: stream.chefId,
            user: address,
            shares: balance.result,
            rewardDebt: 0n, // We can't read this from contract directly
            pendingRewards: 0n, // This will be fetched separately by FarmPositionCard
            totalDeposited: 0n,
            totalWithdrawn: 0n,
            totalHarvested: 0n,
            createdAt: "",
            updatedAt: "",
          });
        }
      }

      return positions;
    },
    enabled: !!address && !!allStreams && !!balances,
    staleTime: 30000,
  });
}
