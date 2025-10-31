import { useQuery } from "@tanstack/react-query";

const INDEXER_URL = "https://coinchan-indexer-production.up.railway.app";

export interface MarketParticipant {
  user: string;
  totalWstDeposited: string;
  totalWstWithdrawn: string;
  netPnL: string;
  netPnLEth: string;
  totalVolume: string;
  totalVolumeEth: string;
  totalYesBought: string;
  totalYesSold: string;
  totalNoBought: string;
  totalNoSold: string;
  currentYesShares: string;
  currentNoShares: string;
  hasOpenPosition: boolean;
  side: "YES" | "NO" | "BOTH" | "CLOSED";
  buyCount: number;
  sellCount: number;
  claimCount: number;
  lastActivityAt: number;
  createdAt: number;
}

export interface MarketLeaderboardResponse {
  market: {
    marketId: string;
    description: string;
    status: "OPEN" | "CLOSED" | "RESOLVED";
    resolved: boolean;
    outcome: boolean | null;
    yesChance: number | null;
    noChance: number | null;
    pot: string;
    potEth: string;
    closeTs: string | null;
    createdAt: number;
  };
  participants: MarketParticipant[];
  summary: {
    totalParticipants: number;
    activePositions: number;
    totalWstDeposited: string;
    totalWstDepositedEth: string;
    totalWstWithdrawn: string;
    totalWstWithdrawnEth: string;
    totalNetPnL: string;
    totalNetPnLEth: string;
  };
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
}

interface UseMarketLeaderboardOptions {
  marketId: bigint;
  sortBy?: "netPnL" | "totalVolume" | "lastActivityAt" | "buyCount";
  order?: "desc" | "asc";
  limit?: number;
  offset?: number;
}

export function useMarketLeaderboard({
  marketId,
  sortBy = "netPnL",
  order = "desc",
  limit = 100,
  offset = 0,
}: UseMarketLeaderboardOptions) {
  return useQuery<MarketLeaderboardResponse>({
    queryKey: ["market-leaderboard", marketId.toString(), sortBy, order, limit, offset],
    queryFn: async () => {
      const params = new URLSearchParams({
        marketId: marketId.toString(),
        sortBy,
        order,
        limit: limit.toString(),
        offset: offset.toString(),
      });

      const response = await fetch(`${INDEXER_URL}/api/market-participants?${params}`);

      if (!response.ok) {
        throw new Error("Failed to fetch leaderboard data");
      }

      return response.json();
    },
    enabled: !!marketId,
    staleTime: 60_000, // 60 seconds
  });
}
