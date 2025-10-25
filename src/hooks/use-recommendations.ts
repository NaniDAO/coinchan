import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { RecommendationsService } from "@/lib/recommendations";
import type { RecommendationsResponse } from "@/types/recommendations";

interface UseRecommendationsResult {
  recommendations: RecommendationsResponse | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useRecommendations(): UseRecommendationsResult {
  const { address } = useAccount();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["recommendations", address],
    queryFn: async () => {
      if (!address) return null;
      return await RecommendationsService.getRecommendations(address);
    },
    enabled: !!address,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours (matches cache TTL)
    retry: 1,
  });

  return {
    recommendations: data ?? null,
    loading: isLoading,
    error: error as Error | null,
    refetch,
  };
}
