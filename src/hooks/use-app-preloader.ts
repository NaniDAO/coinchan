import { useQuery } from '@tanstack/react-query';
import { useAllCoins } from './metadata/use-all-coins';
import { INDEXER_URL } from '../lib/indexer';

// Hook to preload app data during landing sequence
export const useAppPreloader = () => {
  // Preload coin metadata
  const { tokens: allCoins } = useAllCoins();

  // Preload recent activity data
  const { data: recentActivity } = useQuery({
    queryKey: ['preload-activity'],
    queryFn: async () => {
      try {
        const query = `
          query PreloadActivity {
            pools(first: 10, orderBy: "createdAtTimestamp", orderDirection: "desc") {
              items {
                id
                reserve0
                reserve1
                createdAtTimestamp
              }
            }
          }
        `;

        const response = await fetch(INDEXER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });

        if (response.ok) {
          const { data } = await response.json();
          return data?.pools?.items || [];
        }
        return [];
      } catch {
        return [];
      }
    },
    staleTime: 30000, // Cache for 30 seconds
  });

  return {
    coinsLoaded: !!allCoins && allCoins.length > 0,
    activityLoaded: !!recentActivity,
    isPreloaded: !!allCoins && !!recentActivity,
    coinCount: allCoins?.length || 0,
    recentPools: recentActivity?.length || 0,
  };
};