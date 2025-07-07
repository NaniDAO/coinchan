import { useQuery } from "@tanstack/react-query";
import { formatEther } from "viem";
import { TokenMeta } from "@/lib/coins";

const INDEXER_URL = import.meta.env.VITE_INDEXER_URL;

interface PoolEvent {
  id: string;
  type: "BUY" | "SELL" | "LIQADD" | "LIQREM";
  timestamp: string;
  poolId: string;
  amount0: string;
  amount1: string;
  user: string;
}

interface UseBaseApyParams {
  lpToken: TokenMeta;
  timeframe?: "24h" | "7d" | "30d";
  enabled?: boolean;
}

/**
 * Hook to calculate base APY from trading fees
 * Uses pool trading volume from indexer events API
 */
export function useBaseApy({ lpToken, timeframe = "24h", enabled = true }: UseBaseApyParams) {
  const {
    data: baseApyData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["baseApy", lpToken.poolId?.toString(), timeframe],
    queryFn: async () => {
      if (!lpToken.poolId || !lpToken.reserve0) return null;

      try {
        // Calculate timestamp for the timeframe
        const now = Date.now();
        const timeframeMs = {
          "24h": 24 * 60 * 60 * 1000,
          "7d": 7 * 24 * 60 * 60 * 1000,
          "30d": 30 * 24 * 60 * 60 * 1000,
        }[timeframe];
        
        const afterTimestamp = Math.floor((now - timeframeMs) / 1000);

        // Fetch trading events from indexer
        const response = await fetch(
          `${INDEXER_URL}/api/events?poolId=${lpToken.poolId}&after=${afterTimestamp}&limit=1000`
        );
        
        if (!response.ok) {
          throw new Error(`Failed to fetch pool events: ${response.statusText}`);
        }

        const events: PoolEvent[] = await response.json();

        // Filter BUY and SELL events for volume calculation
        const tradingEvents = events.filter(event => event.type === "BUY" || event.type === "SELL");

        // Calculate total volume in ETH (amount0)
        let totalVolumeEth = 0n;
        for (const event of tradingEvents) {
          try {
            // amount0 is ETH volume for this trade
            const ethVolume = BigInt(event.amount0);
            totalVolumeEth += ethVolume;
          } catch (error) {
            console.warn("Failed to parse event amount:", event, error);
          }
        }

        // Convert to daily volume
        const daysInTimeframe = {
          "24h": 1,
          "7d": 7,
          "30d": 30,
        }[timeframe];
        
        const dailyVolumeEth = totalVolumeEth / BigInt(daysInTimeframe);

        // Calculate pool TVL (Total Value Locked)
        // TVL = reserve0 (ETH) * 2 (assuming balanced pool)
        const poolTvlEth = (lpToken.reserve0 || 0n) * 2n;

        if (poolTvlEth === 0n) {
          return {
            baseApy: 0,
            dailyVolume: 0,
            poolTvl: 0,
            tradingFees: 0,
            swapFee: Number(lpToken.swapFee || 100n),
          };
        }

        // Calculate swap fee (default 1% = 100 basis points)
        const swapFeeBps = Number(lpToken.swapFee || 100n);

        // Calculate annual trading fees
        const annualVolumeEth = dailyVolumeEth * 365n;
        const annualFeesEth = (annualVolumeEth * BigInt(swapFeeBps)) / 10000n;

        // Calculate base APY as percentage
        const baseApy = (Number(annualFeesEth) / Number(poolTvlEth)) * 100;

        return {
          baseApy: Math.max(0, baseApy), // Ensure non-negative
          dailyVolume: Number(formatEther(dailyVolumeEth)),
          poolTvl: Number(formatEther(poolTvlEth)),
          tradingFees: Number(formatEther(annualFeesEth)),
          swapFee: swapFeeBps,
          eventsCount: tradingEvents.length,
        };
      } catch (error) {
        console.error("Failed to calculate base APY:", error);
        return null;
      }
    },
    enabled: enabled && !!lpToken.poolId && !!lpToken.reserve0,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
  });

  return {
    baseApyData,
    isLoading,
    error,
  };
}