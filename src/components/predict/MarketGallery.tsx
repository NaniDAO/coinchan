import React, { useState, useEffect } from "react";
import { useReadContract } from "wagmi";
import { PredictionMarketAddress, PredictionMarketAbi } from "@/constants/PredictionMarket";
import { MarketCard } from "./MarketCard";
import { Spinner } from "@/components/ui/spinner";

interface MarketGalleryProps {
  refreshKey?: number;
}

export const MarketGallery: React.FC<MarketGalleryProps> = ({ refreshKey }) => {
  const [start, setStart] = useState(0);
  const count = 20;

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

  useEffect(() => {
    if (refreshKey !== undefined) {
      refetch();
    }
  }, [refreshKey, refetch]);

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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {marketIds.map((marketId, idx) => (
          <MarketCard
            key={marketId.toString()}
            marketId={marketId}
            yesSupply={yesSupplies[idx]}
            noSupply={noSupplies[idx]}
            resolver={resolvers[idx]}
            resolved={resolved[idx]}
            outcome={outcome[idx]}
            pot={pot[idx]}
            payoutPerShare={payoutPerShare[idx]}
            description={descs[idx]}
          />
        ))}
      </div>

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
