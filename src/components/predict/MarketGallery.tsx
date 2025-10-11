import React, { useState, useEffect } from "react";
import { useReadContract, useReadContracts, useAccount } from "wagmi";
import { PredictionMarketAddress, PredictionMarketAbi } from "@/constants/PredictionMarket";
import { PredictionAMMAddress, PredictionAMMAbi } from "@/constants/PredictionMarketAMM";
import { MarketCard } from "./MarketCard";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface MarketGalleryProps {
  refreshKey?: number;
}

type MarketFilter = "all" | "active" | "closed" | "resolved" | "positions" | "parimutuel" | "amm";

export const MarketGallery: React.FC<MarketGalleryProps> = ({ refreshKey }) => {
  const [start] = useState(0);
  const [filter, setFilter] = useState<MarketFilter>("active");
  const count = 20;
  const { address } = useAccount();

  // Fetch Pari-Mutuel markets
  const {
    data: marketsData,
    isLoading: isLoadingPM,
    refetch: refetchPM,
  } = useReadContract({
    address: PredictionMarketAddress as `0x${string}`,
    abi: PredictionMarketAbi,
    functionName: "getMarkets",
    args: [BigInt(start), BigInt(count)],
  });

  // Fetch AMM markets
  const {
    data: ammMarketsData,
    isLoading: isLoadingAMM,
    refetch: refetchAMM,
  } = useReadContract({
    address: PredictionAMMAddress as `0x${string}`,
    abi: PredictionAMMAbi,
    functionName: "getMarkets",
    args: [BigInt(start), BigInt(count)],
  });

  // Get user positions for Pari-Mutuel if connected
  const { data: userMarketsData, refetch: refetchUserDataPM } = useReadContract({
    address: PredictionMarketAddress as `0x${string}`,
    abi: PredictionMarketAbi,
    functionName: "getUserMarkets",
    args: address ? [address, BigInt(start), BigInt(count)] : undefined,
    query: {
      enabled: !!address,
    },
  });

  // Get user positions for AMM if connected
  const { data: userAmmMarketsData, refetch: refetchUserDataAMM } = useReadContract({
    address: PredictionAMMAddress as `0x${string}`,
    abi: PredictionAMMAbi,
    functionName: "getUserMarkets",
    args: address ? [address, BigInt(start), BigInt(count)] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const isLoading = isLoadingPM || isLoadingAMM;
  const refetch = () => {
    refetchPM();
    refetchAMM();
  };
  const refetchUserData = () => {
    refetchUserDataPM();
    refetchUserDataAMM();
  };

  // Batch read trading status for Pari-Mutuel markets
  const marketIds = marketsData?.[0] || [];
  const { data: tradingOpenData } = useReadContracts({
    contracts: marketIds.map((marketId) => ({
      address: PredictionMarketAddress as `0x${string}`,
      abi: PredictionMarketAbi,
      functionName: "tradingOpen",
      args: [marketId],
    })),
    query: {
      enabled: marketIds.length > 0,
    },
  });

  // Batch read trading status for AMM markets
  const ammMarketIds = ammMarketsData?.[0] || [];
  const { data: ammTradingOpenData } = useReadContracts({
    contracts: ammMarketIds.map((marketId) => ({
      address: PredictionAMMAddress as `0x${string}`,
      abi: PredictionAMMAbi,
      functionName: "tradingOpen",
      args: [marketId],
    })),
    query: {
      enabled: ammMarketIds.length > 0,
    },
  });

  useEffect(() => {
    if (refreshKey !== undefined) {
      refetch();
      if (address) {
        refetchUserData();
      }
    }
  }, [refreshKey, refetch, refetchUserData, address]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Spinner />
      </div>
    );
  }

  const hasPMMarkets = marketsData && marketsData[0] && marketsData[0].length > 0;
  const hasAMMMarkets = ammMarketsData && ammMarketsData[0] && ammMarketsData[0].length > 0;

  if (!hasPMMarkets && !hasAMMMarkets) {
    return (
      <div className="text-center py-12 text-muted-foreground">No prediction markets yet. Create the first one!</div>
    );
  }

  // Parse Pari-Mutuel markets
  const pmMarkets = hasPMMarkets
    ? {
        marketIdsArray: marketsData![0],
        yesSupplies: marketsData![1],
        noSupplies: marketsData![2],
        resolvers: marketsData![3],
        resolved: marketsData![4],
        outcome: marketsData![5],
        pot: marketsData![6],
        payoutPerShare: marketsData![7],
        descs: marketsData![8],
        next: marketsData![9],
      }
    : null;

  // Parse AMM markets - note the AMM contract returns more fields
  const ammMarkets = hasAMMMarkets
    ? {
        marketIdsArray: ammMarketsData![0],
        yesSupplies: ammMarketsData![1],
        noSupplies: ammMarketsData![2],
        resolvers: ammMarketsData![3],
        resolved: ammMarketsData![4],
        outcome: ammMarketsData![5],
        pot: ammMarketsData![6],
        payoutPerShare: ammMarketsData![7],
        descs: ammMarketsData![8],
        closes: ammMarketsData![9],
        canCloses: ammMarketsData![10],
        rYesArr: ammMarketsData![11],
        rNoArr: ammMarketsData![12],
        pYesNumArr: ammMarketsData![13],
        pYesDenArr: ammMarketsData![14],
        next: ammMarketsData![15],
      }
    : null;

  // Extract user positions data for both types
  const userPositions = userMarketsData
    ? {
        yesBalances: userMarketsData[2],
        noBalances: userMarketsData[3],
        claimables: userMarketsData[4],
      }
    : null;

  const userAmmPositions = userAmmMarketsData
    ? {
        yesBalances: userAmmMarketsData[2],
        noBalances: userAmmMarketsData[3],
        claimables: userAmmMarketsData[4],
      }
    : null;

  // Combine markets from both contracts
  const allMarkets: Array<{
    marketId: bigint;
    yesSupply: bigint;
    noSupply: bigint;
    resolver: string;
    resolved: boolean;
    outcome: boolean;
    pot: bigint;
    payoutPerShare: bigint;
    description: string;
    userYesBalance: bigint;
    userNoBalance: bigint;
    userClaimable: bigint;
    tradingOpen: boolean;
    marketType: "parimutuel" | "amm";
    contractAddress: `0x${string}`;
    rYes?: bigint;
    rNo?: bigint;
  }> = [];

  // Add Pari-Mutuel markets
  if (pmMarkets) {
    pmMarkets.marketIdsArray.forEach((marketId, idx) => {
      allMarkets.push({
        marketId,
        yesSupply: pmMarkets.yesSupplies[idx],
        noSupply: pmMarkets.noSupplies[idx],
        resolver: pmMarkets.resolvers[idx],
        resolved: pmMarkets.resolved[idx],
        outcome: pmMarkets.outcome[idx],
        pot: pmMarkets.pot[idx],
        payoutPerShare: pmMarkets.payoutPerShare[idx],
        description: pmMarkets.descs[idx],
        userYesBalance: userPositions?.yesBalances[idx] || 0n,
        userNoBalance: userPositions?.noBalances[idx] || 0n,
        userClaimable: userPositions?.claimables[idx] || 0n,
        tradingOpen: Boolean(tradingOpenData?.[idx]?.result ?? true),
        marketType: "parimutuel",
        contractAddress: PredictionMarketAddress as `0x${string}`,
      });
    });
  }

  // Add AMM markets
  if (ammMarkets) {
    ammMarkets.marketIdsArray.forEach((marketId, idx) => {
      allMarkets.push({
        marketId,
        yesSupply: ammMarkets.yesSupplies[idx],
        noSupply: ammMarkets.noSupplies[idx],
        resolver: ammMarkets.resolvers[idx],
        resolved: ammMarkets.resolved[idx],
        outcome: ammMarkets.outcome[idx],
        pot: ammMarkets.pot[idx],
        payoutPerShare: ammMarkets.payoutPerShare[idx],
        description: ammMarkets.descs[idx],
        userYesBalance: userAmmPositions?.yesBalances[idx] || 0n,
        userNoBalance: userAmmPositions?.noBalances[idx] || 0n,
        userClaimable: userAmmPositions?.claimables[idx] || 0n,
        tradingOpen: Boolean(ammTradingOpenData?.[idx]?.result ?? true),
        marketType: "amm",
        contractAddress: PredictionAMMAddress as `0x${string}`,
        rYes: ammMarkets.rYesArr[idx],
        rNo: ammMarkets.rNoArr[idx],
      });
    });
  }

  // Filter markets based on selected filter
  const filteredMarkets = allMarkets.filter((market) => {
    if (filter === "all") return true;
    if (filter === "parimutuel") return market.marketType === "parimutuel";
    if (filter === "amm") return market.marketType === "amm";
    if (filter === "active") return market.tradingOpen && !market.resolved;
    if (filter === "closed") return !market.tradingOpen && !market.resolved;
    if (filter === "resolved") return market.resolved;
    if (filter === "positions") {
      return market.userYesBalance > 0n || market.userNoBalance > 0n;
    }
    return true;
  });

  const activeCount = allMarkets.filter((m) => m.tradingOpen && !m.resolved).length;
  const closedCount = allMarkets.filter((m) => !m.tradingOpen && !m.resolved).length;
  const resolvedCount = allMarkets.filter((m) => m.resolved).length;
  const positionsCount = allMarkets.filter((m) => m.userYesBalance > 0n || m.userNoBalance > 0n).length;
  const pmCount = allMarkets.filter((m) => m.marketType === "parimutuel").length;
  const ammCount = allMarkets.filter((m) => m.marketType === "amm").length;

  return (
    <div className="space-y-6">
      <Tabs value={filter} onValueChange={(v) => setFilter(v as MarketFilter)}>
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="inline-flex w-auto min-w-full">
            <TabsTrigger value="active" className="whitespace-nowrap">
              <span className="hidden sm:inline">Active ({activeCount})</span>
              <span className="sm:hidden">Active</span>
            </TabsTrigger>
            <TabsTrigger value="all" className="whitespace-nowrap">
              <span className="hidden sm:inline">All ({allMarkets.length})</span>
              <span className="sm:hidden">All</span>
            </TabsTrigger>
            <TabsTrigger value="parimutuel" className="whitespace-nowrap">
              <span className="hidden sm:inline">Pari-Mutuel ({pmCount})</span>
              <span className="sm:hidden">PM</span>
            </TabsTrigger>
            <TabsTrigger value="amm" className="whitespace-nowrap">
              <span className="hidden sm:inline">Live Bets ({ammCount})</span>
              <span className="sm:hidden">AMM</span>
            </TabsTrigger>
            <TabsTrigger value="closed" className="whitespace-nowrap">
              <span className="hidden sm:inline">Closed ({closedCount})</span>
              <span className="sm:hidden">Closed</span>
            </TabsTrigger>
            <TabsTrigger value="resolved" className="whitespace-nowrap">
              <span className="hidden sm:inline">Resolved ({resolvedCount})</span>
              <span className="sm:hidden">Resolved</span>
            </TabsTrigger>
            {address && (
              <TabsTrigger value="positions" className="whitespace-nowrap">
                <span className="hidden sm:inline">My Positions ({positionsCount})</span>
                <span className="sm:hidden">Mine</span>
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value={filter} className="mt-6">
          {filteredMarkets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No {filter === "all" ? "" : filter} markets found
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMarkets.map((market) => (
                <MarketCard
                  key={`${market.contractAddress}-${market.marketId.toString()}`}
                  marketId={market.marketId}
                  yesSupply={market.yesSupply}
                  noSupply={market.noSupply}
                  resolver={market.resolver}
                  resolved={market.resolved}
                  outcome={market.outcome}
                  pot={market.pot}
                  payoutPerShare={market.payoutPerShare}
                  description={market.description}
                  userYesBalance={market.userYesBalance}
                  userNoBalance={market.userNoBalance}
                  userClaimable={market.userClaimable}
                  marketType={market.marketType}
                  contractAddress={market.contractAddress}
                  rYes={market.rYes}
                  rNo={market.rNo}
                  onClaimSuccess={() => {
                    refetch();
                    if (address) refetchUserData();
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
