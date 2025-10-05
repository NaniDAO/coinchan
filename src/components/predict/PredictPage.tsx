import React, { useState } from "react";
import { useReadContract } from "wagmi";
import { PredictionMarketAddress, PredictionMarketAbi } from "@/constants/PredictionMarket";
import { CreateMarketForm } from "./CreateMarketForm";
import { MarketGallery } from "./MarketGallery";
import { Heading } from "@/components/ui/typography";
import { PredictExplainer, usePredictExplainer } from "./PredictExplainer";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

const PredictPage: React.FC = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const { showExplainer, handleClose, setShowExplainer } = usePredictExplainer();

  const { data: marketCount } = useReadContract({
    address: PredictionMarketAddress as `0x${string}`,
    abi: PredictionMarketAbi,
    functionName: "marketCount",
  });

  const handleMarketCreated = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="mx-auto max-w-7xl p-4 space-y-8">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Heading level={2}>Prediction Markets</Heading>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowExplainer(true)}
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                <HelpCircle className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Learn how prediction markets work</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-sm text-muted-foreground">
          Create and trade on prediction markets
        </p>
        <p className="text-xs text-muted-foreground">
          All deposits earn yield from{" "}
          <a
            href="https://lido.fi/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-primary transition-colors"
          >
            Lido
          </a>
        </p>
      </div>

      <PredictExplainer isOpen={showExplainer} onClose={handleClose} />

      <CreateMarketForm onMarketCreated={handleMarketCreated} />

      <div className="border-t border-border pt-8">
        <Heading level={3} className="mb-6">
          All Markets ({marketCount?.toString() || "0"})
        </Heading>
        <MarketGallery refreshKey={refreshKey} />
      </div>
    </div>
  );
};

export default PredictPage;
