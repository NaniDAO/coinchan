import React from "react";
import { useReadContract } from "wagmi";
import { useNavigate } from "@tanstack/react-router";
import { PredictionMarketAddress, PredictionMarketAbi } from "@/constants/PredictionMarket";
import { PredictionAMMAddress, PredictionAMMAbi } from "@/constants/PredictionMarketAMM";
import { MarketCard } from "./MarketCard";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Heading } from "@/components/ui/typography";

interface MarketDetailPageProps {
  marketType: "parimutuel" | "amm";
  marketId: string;
}

export const MarketDetailPage: React.FC<MarketDetailPageProps> = ({ marketType, marketId }) => {
  const navigate = useNavigate();
  const contractAddress = marketType === "amm" ? PredictionAMMAddress : PredictionMarketAddress;
  const abi = marketType === "amm" ? PredictionAMMAbi : PredictionMarketAbi;

  // Convert marketId string to BigInt
  const marketIdBigInt = BigInt(marketId);

  // Fetch single market data
  const { data: marketData, isLoading } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi,
    functionName: "getMarkets",
    args: [marketIdBigInt, 1n], // Get 1 market starting from marketId
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl p-4">
        <div className="flex justify-center items-center py-12">
          <LoadingLogo />
        </div>
      </div>
    );
  }

  if (!marketData || !marketData[0] || marketData[0].length === 0) {
    return (
      <div className="mx-auto max-w-4xl p-4">
        <Button variant="ghost" onClick={() => navigate({ to: "/predict" })} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Markets
        </Button>
        <div className="text-center py-12">
          <Heading level={3}>Market not found</Heading>
          <p className="text-muted-foreground mt-2">This market may have been removed or doesn't exist.</p>
        </div>
      </div>
    );
  }

  // Extract market data
  const marketIds = marketData[0];
  const yesSupplies = marketData[1];
  const noSupplies = marketData[2];
  const resolvers = marketData[3];
  const resolved = marketData[4];
  const outcome = marketData[5];
  const pot = marketData[6];
  const payoutPerShare = marketData[7];
  const descs = marketData[8];

  // For AMM markets, get additional data
  let rYes: bigint | undefined;
  let rNo: bigint | undefined;
  if (marketType === "amm" && marketData.length > 11) {
    rYes = marketData[11]?.[0];
    rNo = marketData[12]?.[0];
  }

  return (
    <div className="mx-auto max-w-4xl p-4 space-y-6">
      <Button variant="ghost" onClick={() => navigate({ to: "/predict" })} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Markets
      </Button>

      <div className="max-w-2xl mx-auto">
        <MarketCard
          marketId={marketIds[0]}
          yesSupply={yesSupplies[0]}
          noSupply={noSupplies[0]}
          resolver={resolvers[0]}
          resolved={resolved[0]}
          outcome={outcome[0]}
          pot={pot[0]}
          payoutPerShare={payoutPerShare[0]}
          description={descs[0]}
          userYesBalance={0n}
          userNoBalance={0n}
          userClaimable={0n}
          marketType={marketType}
          contractAddress={contractAddress as `0x${string}`}
          rYes={rYes}
          rNo={rNo}
          onClaimSuccess={() => {}}
        />
      </div>
    </div>
  );
};
