import React, { useState, useEffect } from "react";
import { useReadContract, useAccount } from "wagmi";
import { PredictionMarketAddress, PredictionMarketAbi } from "@/constants/PredictionMarket";
import { MarketCard } from "./MarketCard";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface MarketGalleryProps {
  refreshKey?: number;
}

type MarketFilter = "all" | "active" | "resolved" | "positions";

export const MarketGallery: React.FC<MarketGalleryProps> = ({ refreshKey }) => {
  const [start, setStart] = useState(0);
  const [filter, setFilter] = useState<MarketFilter>("all");
  const count = 20;
  const { address } = useAccount();

  const {
    data: marketsData,
    isLoading,
    refetch,
  } = useReadContract({
    address: PredictionMarketAddress as `0x${string}`,
    abi: PredictionMarketAbi,
    functionName: "getMarkets",
    args: [BigInt(start), BigInt(count)],
  });

  // Get user positions if connected
  const { data: userMarketsData, refetch: refetchUserData } = useReadContract({
    address: PredictionMarketAddress as `0x${string}`,
    abi: PredictionMarketAbi,
    functionName: "getUserMarkets",
    args: address ? [address, BigInt(start), BigInt(count)] : undefined,
    query: {
      enabled: !!address,
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

  if (!marketsData || !marketsData[0] || marketsData[0].length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No prediction markets yet. Create the first one!
      </div>
    );
  }

  const [
    marketIds,
    yesSupplies,
    noSupplies,
    resolvers,
    resolved,
    outcome,
    pot,
    payoutPerShare,
    descs,
    next,
  ] = marketsData;

  // Extract user positions data
  const userPositions = userMarketsData
    ? {
        yesBalances: userMarketsData[2],
        noBalances: userMarketsData[3],
        claimables: userMarketsData[4],
      }
    : null;

  // Filter markets based on selected filter
  const filteredMarkets = marketIds
    .map((marketId, idx) => ({
      marketId,
      yesSupply: yesSupplies[idx],
      noSupply: noSupplies[idx],
      resolver: resolvers[idx],
      resolved: resolved[idx],
      outcome: outcome[idx],
      pot: pot[idx],
      payoutPerShare: payoutPerShare[idx],
      description: descs[idx],
      userYesBalance: userPositions?.yesBalances[idx] || 0n,
      userNoBalance: userPositions?.noBalances[idx] || 0n,
      userClaimable: userPositions?.claimables[idx] || 0n,
    }))
    .filter((market) => {
      if (filter === "all") return true;
      if (filter === "active") return !market.resolved;
      if (filter === "resolved") return market.resolved;
      if (filter === "positions") {
        return market.userYesBalance > 0n || market.userNoBalance > 0n;
      }
      return true;
    });

  const activeCount = marketIds.filter((_, idx) => !resolved[idx]).length;
  const resolvedCount = marketIds.filter((_, idx) => resolved[idx]).length;
  const positionsCount = userPositions
    ? marketIds.filter(
        (_, idx) =>
          userPositions.yesBalances[idx] > 0n ||
          userPositions.noBalances[idx] > 0n
      ).length
    : 0;

  return (
    <div className="space-y-6">
      <Tabs value={filter} onValueChange={(v) => setFilter(v as MarketFilter)}>
        <TabsList className={`grid w-full max-w-2xl ${address ? "grid-cols-4" : "grid-cols-3"}`}>
          <TabsTrigger value="all">All ({marketIds.length})</TabsTrigger>
          <TabsTrigger value="active">Active ({activeCount})</TabsTrigger>
          <TabsTrigger value="resolved">Resolved ({resolvedCount})</TabsTrigger>
          {address && (
            <TabsTrigger value="positions">
              My Positions ({positionsCount})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value={filter} className="mt-6">
          {filteredMarkets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No {filter === "all" ? "" : filter} markets found
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMarkets.map((market) => (
                <MarketCard
                  key={market.marketId.toString()}
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

      {next > 0 && (
        <div className="flex justify-center">
          <button
            onClick={() => setStart(Number(next))}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
};
