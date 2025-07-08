import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { ZChefAbi, ZChefAddress } from "@/constants/zChef";
import type { IncentiveStream } from "./use-incentive-streams";

/**
 * Hook to get real-time farm summary data including total staked amounts
 */
export function useFarmsSummary(streams: IncentiveStream[] | undefined) {
  const publicClient = usePublicClient();

  // Batch fetch all pool data in a single query
  const { data: poolsData } = useQuery({
    queryKey: ["farms-summary", streams?.map(s => s.chefId.toString())],
    queryFn: async () => {
      if (!streams || !publicClient) return [];
      
      const poolDataPromises = streams.map(stream =>
        publicClient.readContract({
          address: ZChefAddress,
          abi: ZChefAbi,
          functionName: "pools",
          args: [stream.chefId],
        })
      );

      return Promise.all(poolDataPromises);
    },
    enabled: !!streams && !!publicClient && streams.length > 0,
    staleTime: 30000, // 30 seconds
  });

  return useMemo(() => {
    if (!streams || streams.length === 0) {
      return {
        totalStaked: 0n,
        uniquePools: 0,
        streamsWithRealTimeData: [],
      };
    }

    // Calculate total staked using real-time data
    let totalStaked = 0n;
    const streamsWithRealTimeData = streams.map((stream, index) => {
      const poolData = poolsData?.[index];
      // poolData[7] is totalShares from the zChef contract
      const realTimeTotalShares = poolData?.[7] ?? stream.totalShares ?? 0n;
      
      totalStaked += realTimeTotalShares;
      
      return {
        ...stream,
        totalShares: realTimeTotalShares,
      };
    });

    const uniquePools = new Set(streams.map(s => s.lpId.toString())).size;

    return {
      totalStaked,
      uniquePools,
      streamsWithRealTimeData,
    };
  }, [streams, poolsData]);
}