import { useQuery } from "@tanstack/react-query";

const INDEXER_URL = import.meta.env.VITE_INDEXER_URL;

export interface MarketBet {
  // Bet Information
  betId: string;
  trader: string; // Ethereum address
  side: "YES" | "NO";
  amountBet: string; // wstETH amount as string (to handle bigint)
  sharesBought: string; // Shares received as string
  betTimestamp: string; // Unix timestamp as string
  betTxHash: string; // Transaction hash
  betBlockNumber: string; // Block number as string

  // Claim Information
  claims: Array<{
    shares: string;
    payout: string; // wstETH received as string
    timestamp: string;
    txHash: string;
  }>;
  totalClaimedShares: string;
  totalClaimedPayout: string;
  hasClaimed: boolean;
  lastClaimTimestamp: string | null;

  // Profitability (user-level for entire market)
  userTotalDeposited: string; // Total wstETH deposited by user
  userTotalWithdrawn: string; // Total wstETH withdrawn (sells + claims)
  userNetProfit: string; // Net profit/loss in wstETH
  userIsProfitable: boolean; // Whether user is in profit
}

export interface MarketBetsResponse {
  market: {
    marketId: string;
    description: string;
    status: "OPEN" | "CLOSED" | "RESOLVED";
    resolved: boolean;
    outcome: boolean | null;
    yesId: string;
    noId: string;
  };
  bets: MarketBet[];
  totalBets: number;
}

interface UseMarketLeaderboardOptions {
  marketId: bigint;
}

export function useMarketLeaderboard({ marketId }: UseMarketLeaderboardOptions) {
  return useQuery<MarketBetsResponse>({
    queryKey: ["market-bets", marketId.toString()],
    queryFn: async () => {
      if (!INDEXER_URL) {
        throw new Error("VITE_INDEXER_URL is not set");
      }

      const response = await fetch(`${INDEXER_URL}/api/market-bets/${marketId.toString()}`);

      if (!response.ok) {
        throw new Error("Failed to fetch market bets data");
      }

      return response.json();
    },
    enabled: !!marketId,
    staleTime: 60_000, // 60 seconds
  });
}
