import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { formatUnits } from 'viem';
// Removed unused CheckTheChain import
import { INDEXER_URL } from '../lib/indexer';

export interface LandingData {
  ethPrice: string;
  ethPriceUsd: number;
  gasPrice: string;
  gasPriceGwei: number;
  launchCost: string;
  launchCostUsd: number;
  networkStatus: 'ready' | 'loading' | 'error';
  indexerStatus: 'ready' | 'loading' | 'error';
  isAppReady: boolean;
}

export const useLandingData = () => {
  const publicClient = usePublicClient();

  return useQuery<LandingData>({
    queryKey: ['landing-data'],
    queryFn: async () => {
      const results = await Promise.allSettled([
        // Fetch current gas price (this works reliably)
        publicClient?.getGasPrice(),
        // Check indexer health with a more comprehensive query to ensure data is loaded
        fetch(INDEXER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            query: `query Health { 
              pools(first: 10) { 
                items { 
                  id 
                  reserve0 
                  reserve1 
                  coin1 { 
                    symbol 
                  } 
                } 
              } 
            }` 
          }),
        }).then(async r => {
          if (!r.ok) return false;
          const data = await r.json();
          // Check that we have actual pool data, not just empty results
          return !data.errors && data?.pools?.items?.length > 0 && data.pools.items[0]?.coin1?.symbol;
        }),
      ]);

      const [gasPriceResult, indexerHealthResult] = results;

      // Use a reasonable ETH price estimate (around current market value)
      const ethPriceUsd = 3200; // Static estimate - could be made dynamic later

      // Parse gas price
      let gasPriceGwei = 0;
      if (gasPriceResult.status === 'fulfilled' && gasPriceResult.value) {
        gasPriceGwei = Number(formatUnits(gasPriceResult.value, 9)); // Convert wei to gwei
      }

      // Calculate launch cost (1 dollar per 1 gwei as specified)
      const launchCostUsd = gasPriceGwei;

      // Determine statuses
      const networkStatus = gasPriceResult.status === 'fulfilled' ? 'ready' : 'error';
      const indexerStatus = (indexerHealthResult.status === 'fulfilled' && indexerHealthResult.value) ? 'ready' : 'error';
      const isAppReady = networkStatus === 'ready' && indexerStatus === 'ready';

      return {
        ethPrice: `$${ethPriceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        ethPriceUsd,
        gasPrice: gasPriceGwei > 0 ? `${gasPriceGwei.toFixed(1)} GWEI` : 'Loading...',
        gasPriceGwei,
        launchCost: launchCostUsd > 0 ? `$${launchCostUsd.toFixed(2)}` : 'Loading...',
        launchCostUsd,
        networkStatus,
        indexerStatus,
        isAppReady,
      };
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    retry: 3,
  });
};

// Simple loading progress that always completes
export const useSimpleLoadingProgress = () => {
  return useQuery({
    queryKey: ['simple-loading'],
    queryFn: async () => {
      // Simulate realistic loading stages
      const stages = [
        { progress: 20, text: 'Connecting to Ethereum...', delay: 400 },
        { progress: 50, text: 'Loading network data...', delay: 600 },
        { progress: 80, text: 'Checking contracts...', delay: 500 },
        { progress: 100, text: 'Initialized', delay: 400 },
      ];

      for (const stage of stages) {
        await new Promise(resolve => setTimeout(resolve, stage.delay));
        // Don't return early, let it complete all stages
      }

      return { 
        progress: 100, 
        text: 'Initialized',
        stage: 'complete'
      };
    },
    enabled: true,
    refetchOnWindowFocus: false,
    retry: false,
  });
};