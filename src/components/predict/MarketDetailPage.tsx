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
import { PredictErrorBoundary } from "./ErrorBoundary";

interface MarketDetailPageProps {
  marketType: "parimutuel" | "amm";
  marketId: string;
}

const MarketDetailPageContent: React.FC<MarketDetailPageProps> = ({ marketType, marketId }) => {
  const navigate = useNavigate();
  const contractAddress = marketType === "amm" ? PredictionAMMAddress : PredictionMarketAddress;
  const abi = marketType === "amm" ? PredictionAMMAbi : PredictionMarketAbi;

  // Convert marketId string to BigInt
  const marketIdBigInt = BigInt(marketId);

  // Fetch single market data using getMarket (not getMarkets)
  const { data: marketData, isLoading } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi,
    functionName: "getMarket",
    args: [marketIdBigInt],
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

  if (!marketData) {
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

  // Extract market data from getMarket response
  // PM returns: (yesSupply, noSupply, resolver, resolved, outcome, pot, payoutPerShare, desc)
  // AMM returns: (yesSupply, noSupply, resolver, resolved, outcome, pot, payoutPerShare, desc, closeTs, canClose, rYes, rNo, pYes_num, pYes_den)
  const yesSupply = marketData[0];
  const noSupply = marketData[1];
  const resolver = marketData[2];
  const resolved = marketData[3];
  const outcome = marketData[4];
  const pot = marketData[5];
  const payoutPerShare = marketData[6];
  const description = marketData[7];

  // For AMM markets, get additional data
  let rYes: bigint | undefined;
  let rNo: bigint | undefined;
  if (marketType === "amm" && marketData.length > 10) {
    rYes = marketData[10];
    rNo = marketData[11];
  }

  return (
    <div className="mx-auto max-w-4xl p-4 space-y-6">
      <Button variant="ghost" onClick={() => navigate({ to: "/predict" })} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Markets
      </Button>

      <div className="max-w-2xl mx-auto">
        <MarketCard
          marketId={marketIdBigInt}
          yesSupply={yesSupply}
          noSupply={noSupply}
          resolver={resolver}
          resolved={resolved}
          outcome={outcome}
          pot={pot}
          payoutPerShare={payoutPerShare}
          description={description}
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

// Wrap with error boundary for better error handling
export const MarketDetailPage: React.FC<MarketDetailPageProps> = (props) => {
  return (
    <PredictErrorBoundary>
      <MarketDetailPageContent {...props} />
    </PredictErrorBoundary>
  );
};
