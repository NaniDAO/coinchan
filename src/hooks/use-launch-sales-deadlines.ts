import { useQuery } from "@tanstack/react-query";

interface SaleDeadlineData {
  coinId: string;
  deadlineLast: number;
  status: string;
}

export const useLaunchSalesDeadlines = () => {
  return useQuery({
    queryKey: ["launch-sales-deadlines"],
    queryFn: async (): Promise<Map<string, number>> => {
      const response = await fetch(import.meta.env.VITE_INDEXER_URL + "/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
            query LaunchSalesDeadlines {
              sales {
                items {
                  coinId
                  deadlineLast
                  status
                }
              }
            }
          `,
        }),
      });

      const json = await response.json();
      const sales = json.data?.sales?.items || [];
      
      // Create a map of coinId -> deadlineLast for quick lookup
      const deadlineMap = new Map<string, number>();
      
      sales.forEach((sale: SaleDeadlineData) => {
        if (sale.deadlineLast) {
          deadlineMap.set(sale.coinId, Number(sale.deadlineLast));
        }
      });
      
      return deadlineMap;
    },
    staleTime: 30000, // Consider data fresh for 30 seconds
    gcTime: 60000, // Keep in cache for 1 minute
  });
};