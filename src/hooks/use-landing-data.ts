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
        // Check indexer health with a simple GraphQL query
        fetch(INDEXER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            query: `query Health { pools(first: 1) { items { id } } }` 
          }),
        }).then(r => r.ok && r.json().then(data => !data.errors)),
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

// Hook for loading progress that tracks actual app readiness
export const useLoadingProgress = (isAppReady: boolean) => {
  return useQuery({
    queryKey: ['loading-progress', isAppReady],
    queryFn: async (): Promise<{ progress: number; text: string; stage: string }> => {
      // Simulate loading stages with delays
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (!isAppReady) {
        return { progress: 20, text: 'Connecting to Ethereum...', stage: 'loading' };
      }
      
      await new Promise(resolve => setTimeout(resolve, 800));
      return { progress: 60, text: 'Loading network data...', stage: 'loading' };
    },
    enabled: true,
    refetchInterval: isAppReady ? false : 1000, // Keep checking until ready
    refetchOnWindowFocus: false,
    retry: false,
  });
};

// Simplified version that always reaches 100%
export const useSimpleLoadingProgress = (isAppReady: boolean) => {
  return useQuery({
    queryKey: ['simple-loading', isAppReady],
    queryFn: async () => {
      const stages = [
        { progress: 20, text: 'Connecting to Ethereum...', delay: 600 },
        { progress: 40, text: 'Fetching network data...', delay: 800 },
        { progress: 60, text: 'Checking indexer status...', delay: 700 },
        { progress: 80, text: 'Loading contracts...', delay: 600 },
        { progress: 100, text: 'Initialized', delay: 500 },
      ];

      for (const stage of stages) {
        await new Promise(resolve => setTimeout(resolve, stage.delay));
        if (stage.progress === 100 || isAppReady) {
          return { 
            progress: 100, 
            text: isAppReady ? 'Initialized' : 'Ready',
            stage: 'complete'
          };
        }
      }

      return { progress: 100, text: 'Ready', stage: 'complete' };
    },
    enabled: true,
    refetchOnWindowFocus: false,
    retry: false,
  });
};