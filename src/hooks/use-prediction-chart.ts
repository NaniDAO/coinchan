import { useQuery } from "@tanstack/react-query";
import { fetchPredictionChart, type PredictionChartData } from "@/lib/indexer";

/**
 * Hook to fetch prediction market probability chart data
 * @param marketId - The market ID (as bigint)
 * @param enabled - Whether to enable the query (default: true)
 * @returns React Query result with chart data
 */
export const usePredictionChart = (marketId: bigint, enabled: boolean = true) => {
  return useQuery<PredictionChartData>({
    queryKey: ["prediction-chart", marketId.toString()],
    queryFn: () => fetchPredictionChart(marketId.toString()),
    staleTime: 60_000, // 1 minute
    enabled: enabled && marketId > 0n,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });
};
