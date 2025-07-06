import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { ZChefAddress, ZChefAbi } from "@/constants/zChef";
// import { mainnet } from 'viem/chains';

interface OfflineState {
  isOnline: boolean;
  isIndexerAvailable: boolean;
  lastChecked: Date | null;
  retryCount: number;
  usingContractFallback: boolean;
}

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL;

if (!INDEXER_URL) {
  throw new Error("NEXT_PUBLIC_INDEXER_URL environment variable is required");
}

export function useOfflineHandling() {
  const queryClient = useQueryClient();
  const publicClient = usePublicClient();
  const [offlineState, setOfflineState] = useState<OfflineState>({
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    isIndexerAvailable: true,
    lastChecked: null,
    retryCount: 0,
    usingContractFallback: false,
  });

  // Check indexer availability
  const checkIndexerStatus = useCallback(async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(`${INDEXER_URL}/incentive-streams?limit=1`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.warn("Indexer health check failed:", error);
      return false;
    }
  }, []);

  // Fallback functions using zChef contract view methods
  const getStreamDataFromContract = useCallback(
    async (chefId: bigint) => {
      if (!publicClient) return null;
      if (!chefId || chefId < 0n) return null;

      try {
        // Use zChef contract view functions as fallback
        const poolData = await publicClient.readContract({
          address: ZChefAddress,
          abi: ZChefAbi,
          functionName: "pools",
          args: [chefId],
        });

        // Transform contract data to match indexer format
        // Note: Contract returns [lpToken, lpId, rewardToken, rewardId, rewardRate, endTime, lastUpdate, totalShares, accRewardPerShare]
        const [lpToken, lpId, rewardToken, rewardId, rewardRate, endTime, lastUpdate, totalShares, accRewardPerShare] =
          poolData as readonly [
            `0x${string}`, // lpToken address
            bigint, // lpId
            `0x${string}`, // rewardToken address
            bigint, // rewardId
            bigint, // rewardRate
            bigint, // endTime
            bigint, // lastUpdate
            bigint, // totalShares
            bigint, // accRewardPerShare
          ];

        return {
          chefId,
          creator: "0x0000000000000000000000000000000000000000" as `0x${string}`, // Unknown from contract
          lpToken,
          lpId,
          rewardToken,
          rewardId,
          rewardAmount: 0n, // Cannot calculate from contract data
          rewardRate,
          duration: 0n, // Cannot calculate from contract data
          startTime: endTime - 86400n, // Estimate: assume 1 day ago (fallback)
          endTime,
          lastUpdate,
          totalShares,
          accRewardPerShare,
          status: endTime > BigInt(Math.floor(Date.now() / 1000)) ? "ACTIVE" : "ENDED",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          txHash: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
          blockNumber: 0n,
        };
      } catch (error) {
        console.error("Failed to fetch stream data from contract:", error);
        return null;
      }
    },
    [publicClient],
  );

  const getUserPositionFromContract = useCallback(
    async (chefId: bigint, userAddress: `0x${string}`) => {
      if (!publicClient) return null;
      if (!chefId || chefId < 0n) return null;
      if (!userAddress || userAddress === "0x0000000000000000000000000000000000000000") return null;

      try {
        // Get user balance (shares) from zChef contract
        const userShares = await publicClient.readContract({
          address: ZChefAddress,
          abi: ZChefAbi,
          functionName: "balanceOf",
          args: [userAddress, chefId],
        });

        // Get pending rewards
        const pendingRewards = await publicClient.readContract({
          address: ZChefAddress,
          abi: ZChefAbi,
          functionName: "pendingReward",
          args: [chefId, userAddress],
        });

        return {
          chefId,
          user: userAddress,
          shares: userShares as bigint,
          pendingRewards: pendingRewards as bigint,
          // Note: Historical data like totalDeposited, totalHarvested won't be available from contract
          totalDeposited: 0n,
          totalWithdrawn: 0n,
          totalHarvested: 0n,
          rewardDebt: 0n,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      } catch (error) {
        console.error("Failed to fetch user position from contract:", error);
        return null;
      }
    },
    [publicClient],
  );

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setOfflineState((prev) => ({
        ...prev,
        isOnline: true,
        retryCount: 0,
      }));

      // Retry indexer check when coming back online
      checkIndexerStatus().then((isAvailable) => {
        setOfflineState((prev) => ({
          ...prev,
          isIndexerAvailable: isAvailable,
          lastChecked: new Date(),
          usingContractFallback: !isAvailable,
        }));

        if (isAvailable) {
          // Invalidate all queries to refetch fresh data from indexer
          queryClient.invalidateQueries();
        }
      });
    };

    const handleOffline = () => {
      setOfflineState((prev) => ({
        ...prev,
        isOnline: false,
        isIndexerAvailable: false,
        lastChecked: new Date(),
        usingContractFallback: true,
      }));
    };

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, [checkIndexerStatus, queryClient]);

  // Periodic indexer health check when online
  useEffect(() => {
    if (!offlineState.isOnline) return;

    const interval = setInterval(async () => {
      const isAvailable = await checkIndexerStatus();
      setOfflineState((prev) => ({
        ...prev,
        isIndexerAvailable: isAvailable,
        lastChecked: new Date(),
        retryCount: isAvailable ? 0 : prev.retryCount + 1,
        usingContractFallback: !isAvailable,
      }));
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [offlineState.isOnline, checkIndexerStatus]);

  // Manual retry function
  const retryConnection = useCallback(async () => {
    const isAvailable = await checkIndexerStatus();
    setOfflineState((prev) => ({
      ...prev,
      isIndexerAvailable: isAvailable,
      lastChecked: new Date(),
      retryCount: isAvailable ? 0 : prev.retryCount + 1,
      usingContractFallback: !isAvailable,
    }));

    if (isAvailable) {
      queryClient.invalidateQueries();
    }

    return isAvailable;
  }, [checkIndexerStatus, queryClient]);

  // Get cached data for offline mode
  const getCachedData = useCallback(
    (queryKey: string[]) => {
      return queryClient.getQueryData(queryKey);
    },
    [queryClient],
  );

  // Check if we should show offline warning
  const shouldShowOfflineWarning = offlineState.retryCount >= 3 || !offlineState.isOnline;

  return {
    ...offlineState,
    shouldShowOfflineWarning,
    retryConnection,
    getCachedData,
    getStreamDataFromContract,
    getUserPositionFromContract,
  };
}
