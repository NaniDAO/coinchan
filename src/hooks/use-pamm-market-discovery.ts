import { useReadContracts, useReadContract } from "wagmi";
import { useMemo } from "react";
import {
  PAMMSingletonAddress,
  PAMMSingletonAbi,
  computePAMMPoolIdFromIds,
  DEFAULT_FEE_OR_HOOK,
} from "@/constants/PAMMSingleton";

/**
 * Discovers the market ID for a PAMM pool by iterating through all markets
 * and computing pool IDs until a match is found.
 *
 * This is used as a fallback when the indexer doesn't provide coin IDs.
 *
 * @param poolId The pool ID to search for
 * @param enabled Whether to enable the discovery (should only be true for PAMM pools without coin IDs)
 */
export function usePAMMMarketDiscovery(
  poolId: string | null,
  enabled: boolean,
): {
  marketId: bigint | null;
  noId: bigint | null;
  yesIsId0: boolean;
  isLoading: boolean;
  error: Error | null;
} {
  // First, get the market count
  const { data: marketCount, isLoading: countLoading } = useReadContract({
    address: PAMMSingletonAddress,
    abi: PAMMSingletonAbi,
    functionName: "marketCount",
    query: {
      enabled: enabled && !!poolId,
    },
  });

  // Fetch all markets (up to 100 for now)
  const { data: marketsData, isLoading: marketsLoading } = useReadContract({
    address: PAMMSingletonAddress,
    abi: PAMMSingletonAbi,
    functionName: "getMarkets",
    args: [0n, marketCount && marketCount > 100n ? 100n : (marketCount ?? 50n)],
    query: {
      enabled: enabled && !!poolId && marketCount !== undefined && marketCount > 0n,
    },
  });

  // getMarkets returns a tuple: [ids[], resolvers[], collaterals[], states[], closes[], ...]
  // We only need the first element (ids array)
  const marketIds = Array.isArray(marketsData) && marketsData.length > 0
    ? (marketsData[0] as readonly bigint[])
    : undefined;

  // Build noId fetch calls for all markets
  const noIdCalls = useMemo(() => {
    if (!marketIds || !Array.isArray(marketIds)) return [];
    return marketIds.map((mId) => ({
      address: PAMMSingletonAddress as `0x${string}`,
      abi: PAMMSingletonAbi,
      functionName: "getNoId" as const,
      args: [mId] as const,
    }));
  }, [marketIds]);

  const { data: noIdsData, isLoading: noIdsLoading } = useReadContracts({
    contracts: noIdCalls,
    query: {
      enabled: noIdCalls.length > 0,
    },
  });

  // Find the matching market
  const result = useMemo((): { marketId: bigint | null; noId: bigint | null; yesIsId0: boolean } => {
    if (!poolId || !marketIds || !noIdsData) {
      return { marketId: null, noId: null, yesIsId0: false };
    }

    const targetPoolId = BigInt(poolId);

    for (let i = 0; i < marketIds.length; i++) {
      const mId = marketIds[i];
      const noIdResult = noIdsData[i];

      if (noIdResult?.status !== "success" || !noIdResult.result) continue;

      const nId = noIdResult.result as bigint;

      // Compute pool ID for this market
      const computedPoolId = computePAMMPoolIdFromIds(mId, nId, DEFAULT_FEE_OR_HOOK);

      if (computedPoolId === targetPoolId) {
        // Found the matching market!
        // Determine which is id0 (the smaller one)
        const yesIsId0 = mId < nId;
        return { marketId: mId, noId: nId, yesIsId0 };
      }
    }

    return { marketId: null, noId: null, yesIsId0: false };
  }, [poolId, marketIds, noIdsData]);

  const isLoading = countLoading || marketsLoading || noIdsLoading;

  return {
    ...result,
    isLoading,
    error: null,
  };
}
