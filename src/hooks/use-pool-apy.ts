import { useQuery } from "@tanstack/react-query";

export const usePoolApy = (poolId?: string) => {
  return useQuery({
    queryKey: ["pool-apy", poolId],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_INDEXER_URL}/api/pool-apr?poolId=${poolId}`,
      );
      const data = await response.json();
      return data.apy;
    },
    enabled: !!poolId,
  });
};
