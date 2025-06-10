import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { formatUnits } from 'viem';
import { CheckTheChainAbi, CheckTheChainAddress } from '../constants/CheckTheChain';
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
        // Fetch ETH price from CheckTheChain contract
        publicClient?.readContract({
          address: CheckTheChainAddress,
          abi: CheckTheChainAbi,
          functionName: 'checkPrice',
          args: ['ETH'],
        }),
        // Fetch current gas price
        publicClient?.getGasPrice(),
        // Check indexer health
        fetch(`${INDEXER_URL.replace('/graphql', '/health')}`).then(r => r.ok),
      ]);

      const [ethPriceResult, gasPriceResult, indexerHealthResult] = results;

      // Parse ETH price
      let ethPriceUsd = 0;
      if (ethPriceResult.status === 'fulfilled' && ethPriceResult.value) {
        const [price] = ethPriceResult.value as [bigint, string];
        ethPriceUsd = Number(formatUnits(price, 8)); // CheckTheChain returns price with 8 decimals
      }

      // Parse gas price
      let gasPriceGwei = 0;
      if (gasPriceResult.status === 'fulfilled' && gasPriceResult.value) {
        gasPriceGwei = Number(formatUnits(gasPriceResult.value, 9)); // Convert wei to gwei
      }

      // Calculate launch cost (1 dollar per 1 gwei as specified)
      const launchCostUsd = gasPriceGwei;

      // Determine statuses
      const networkStatus = (ethPriceResult.status === 'fulfilled' && gasPriceResult.status === 'fulfilled') ? 'ready' : 'error';
      const indexerStatus = (indexerHealthResult.status === 'fulfilled' && indexerHealthResult.value) ? 'ready' : 'error';
      const isAppReady = networkStatus === 'ready' && indexerStatus === 'ready';

      return {
        ethPrice: ethPriceUsd > 0 ? `$${ethPriceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Loading...',
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
  const { data, isLoading, error } = useQuery({
    queryKey: ['loading-progress', isAppReady],
    queryFn: async () => {
      // Simulate progressive loading stages
      const stages = [
        { text: 'Connecting to Ethereum...', progress: 20 },
        { text: 'Fetching network data...', progress: 40 },
        { text: 'Checking indexer status...', progress: 60 },
        { text: 'Loading contracts...', progress: 80 },
        { text: 'Initializing app...', progress: 100 },
      ];

      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        await new Promise(resolve => setTimeout(resolve, 800)); // Simulate loading time
        
        if (i === stages.length - 1) {
          // Final stage - wait for app to be actually ready
          if (isAppReady) {
            return { 
              progress: 100, 
              text: 'Initialized',
              stage: 'complete'
            };
          } else {
            return { 
              progress: 95, 
              text: 'Waiting for network...', 
              stage: 'waiting'
            };
          }
        }
        
        // Return intermediate progress
        if (i < stages.length - 1) {
          return {
            progress: stage.progress,
            text: stage.text,
            stage: 'loading'
          };
        }
      }

      return { progress: 100, text: 'Ready', stage: 'complete' };
    },
    enabled: true,
    refetchOnWindowFocus: false,
    retry: false,
  });

  return {
    progress: data?.progress || 0,
    text: data?.text || 'Initializing...',
    stage: data?.stage || 'loading',
    isLoading,
    error,
  };
};