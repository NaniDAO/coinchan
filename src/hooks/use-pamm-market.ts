import { useReadContracts } from "wagmi";
import {
  PAMMSingletonAddress,
  PAMMSingletonAbi,
  identifyYesNoIds,
  calculateYesProbability,
} from "@/constants/PAMMSingleton";
import type { Pool } from "./use-get-pool";
import { usePAMMMarketDiscovery } from "./use-pamm-market-discovery";

export interface PAMMMarketData {
  isPAMMPool: boolean;
  marketId: bigint | null;
  noId: bigint | null;
  yesIsId0: boolean;
  description: string | null;
  resolver: string | null;
  collateral: string | null;
  resolved: boolean;
  outcome: boolean;
  canClose: boolean;
  closeTimestamp: bigint | null;
  collateralLocked: bigint | null;
  yesSupply: bigint | null;
  noSupply: bigint | null;
  tradingOpen: boolean;
  // Calculated from reserves
  yesPercent: number;
  noPercent: number;
  // Raw reserves for display
  rYes: bigint | null;
  rNo: bigint | null;
}

/**
 * Detects if a pool is a PAMM prediction market pool and fetches market data
 * A PAMM pool has both token0 and token1 equal to the PAMM singleton address
 */
export function usePAMMMarket(pool: Pool | null): {
  data: PAMMMarketData | null;
  isLoading: boolean;
  error: Error | null;
} {
  // Get token addresses - try multiple sources
  // Priority: pool.token0 > pool.coin0?.token
  const token0Address = pool?.token0 || pool?.coin0?.token || null;
  const token1Address = pool?.token1 || pool?.coin1?.token || null;

  // Check if this is a PAMM pool based on token addresses
  const isPAMMPoolByTokens =
    token0Address?.toLowerCase() === PAMMSingletonAddress.toLowerCase() &&
    token1Address?.toLowerCase() === PAMMSingletonAddress.toLowerCase();

  // Parse token IDs - try coin0Id first, then fallback to coin0?.id
  // Skip coin0Id if it's "0" (invalid for PAMM markets)
  const id0 =
    pool?.coin0Id && pool.coin0Id !== "0"
      ? BigInt(pool.coin0Id)
      : pool?.coin0?.id
        ? BigInt(pool.coin0.id)
        : null;
  const id1 =
    pool?.coin1Id && pool.coin1Id !== "0"
      ? BigInt(pool.coin1Id)
      : pool?.coin1?.id
        ? BigInt(pool.coin1.id)
        : null;

  // Identify which ID is YES (marketId) and which is NO (noId)
  const yesNoIds = id0 !== null && id1 !== null ? identifyYesNoIds(id0, id1) : null;

  // If indexer data is incomplete (no token addresses or no coin IDs), try discovery
  // Discovery will check if this pool ID matches any PAMM market
  const indexerDataComplete = isPAMMPoolByTokens && yesNoIds !== null;
  const needsDiscovery = pool !== null && !indexerDataComplete;

  const {
    marketId: discoveredMarketId,
    noId: discoveredNoId,
    yesIsId0: discoveredYesIsId0,
    isLoading: discoveryLoading,
  } = usePAMMMarketDiscovery(pool?.id ?? null, needsDiscovery);

  // A pool is a PAMM pool if:
  // 1. Token addresses match PAMM singleton, OR
  // 2. Discovery found a matching PAMM market
  const isPAMMPool = isPAMMPoolByTokens || discoveredMarketId !== null;

  // Use discovered data if indexer data is not available
  const marketId = yesNoIds?.marketId ?? discoveredMarketId;
  const noId = yesNoIds?.noId ?? discoveredNoId;
  const yesIsId0 = yesNoIds?.yesIsId0 ?? discoveredYesIsId0;

  // Fetch market data from PAMM contract
  const {
    data: contractData,
    isLoading,
    error,
  } = useReadContracts({
    contracts: [
      // getMarket returns full market data
      {
        address: PAMMSingletonAddress,
        abi: PAMMSingletonAbi,
        functionName: "getMarket",
        args: marketId ? [marketId] : undefined,
      },
      // tradingOpen check
      {
        address: PAMMSingletonAddress,
        abi: PAMMSingletonAbi,
        functionName: "tradingOpen",
        args: marketId ? [marketId] : undefined,
      },
    ],
    query: {
      enabled: isPAMMPool && marketId !== null,
    },
  });

  // Process results - if still discovering, show loading
  if (discoveryLoading) {
    return {
      data: {
        isPAMMPool: true,
        marketId: null,
        noId: null,
        yesIsId0: false,
        description: null,
        resolver: null,
        collateral: null,
        resolved: false,
        outcome: false,
        canClose: false,
        closeTimestamp: null,
        collateralLocked: null,
        yesSupply: null,
        noSupply: null,
        tradingOpen: false,
        yesPercent: 50,
        noPercent: 50,
        rYes: null,
        rNo: null,
      },
      isLoading: true,
      error: null,
    };
  }

  // If not a PAMM pool, or couldn't find market after discovery
  if (!isPAMMPool || !marketId) {
    return {
      data: isPAMMPool
        ? {
            isPAMMPool: true,
            marketId: null,
            noId: null,
            yesIsId0: false,
            description: null,
            resolver: null,
            collateral: null,
            resolved: false,
            outcome: false,
            canClose: false,
            closeTimestamp: null,
            collateralLocked: null,
            yesSupply: null,
            noSupply: null,
            tradingOpen: false,
            yesPercent: 50,
            noPercent: 50,
            rYes: null,
            rNo: null,
          }
        : null,
      isLoading: false,
      error: null,
    };
  }

  const marketData = contractData?.[0]?.result;
  const tradingOpen = contractData?.[1]?.result ?? false;

  // Calculate probabilities from pool reserves
  const rYes =
    pool?.reserve0 && pool?.reserve1 ? (yesIsId0 ? BigInt(pool.reserve0) : BigInt(pool.reserve1)) : null;
  const rNo =
    pool?.reserve0 && pool?.reserve1 ? (yesIsId0 ? BigInt(pool.reserve1) : BigInt(pool.reserve0)) : null;

  const { yesPercent, noPercent } =
    rYes !== null && rNo !== null ? calculateYesProbability(rYes, rNo) : { yesPercent: 50, noPercent: 50 };

  // Extract market data from getMarket response
  // Returns: [resolver, collateral, resolved, outcome, canClose, close, collateralLocked, yesSupply, noSupply, description]
  const result: PAMMMarketData = {
    isPAMMPool: true,
    marketId,
    noId,
    yesIsId0,
    description: marketData ? (marketData[9] as string) : null,
    resolver: marketData ? (marketData[0] as string) : null,
    collateral: marketData ? (marketData[1] as string) : null,
    resolved: marketData ? (marketData[2] as boolean) : false,
    outcome: marketData ? (marketData[3] as boolean) : false,
    canClose: marketData ? (marketData[4] as boolean) : false,
    closeTimestamp: marketData ? BigInt(marketData[5] as bigint) : null,
    collateralLocked: marketData ? BigInt(marketData[6] as bigint) : null,
    yesSupply: marketData ? BigInt(marketData[7] as bigint) : null,
    noSupply: marketData ? BigInt(marketData[8] as bigint) : null,
    tradingOpen,
    yesPercent,
    noPercent,
    rYes,
    rNo,
  };

  return {
    data: result,
    isLoading,
    error: error as Error | null,
  };
}

/**
 * Quick check if a pool is a PAMM pool without fetching market data
 */
export function isPAMMPool(pool: Pool | null): boolean {
  if (!pool) return false;
  return (
    pool.token0?.toLowerCase() === PAMMSingletonAddress.toLowerCase() &&
    pool.token1?.toLowerCase() === PAMMSingletonAddress.toLowerCase()
  );
}
