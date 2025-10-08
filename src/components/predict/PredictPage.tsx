import React, { useState } from "react";
import { useReadContract } from "wagmi";
import { useTranslation } from "react-i18next";
import { PredictionMarketAddress, PredictionMarketAbi } from "@/constants/PredictionMarket";
import { PredictionAMMAddress, PredictionAMMAbi } from "@/constants/PredictionMarketAMM";
import { CreateMarketForm } from "./CreateMarketForm";
import { MarketGallery } from "./MarketGallery";
import { Heading } from "@/components/ui/typography";
import { PredictExplainer, usePredictExplainer } from "./PredictExplainer";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

const PredictPage: React.FC = () => {
  const { t } = useTranslation();
  const [refreshKey, setRefreshKey] = useState(0);
  const { showExplainer, handleClose, setShowExplainer } = usePredictExplainer();

  const { data: pmMarketCount } = useReadContract({
    address: PredictionMarketAddress as `0x${string}`,
    abi: PredictionMarketAbi,
    functionName: "marketCount",
  });

  const { data: ammMarketCount } = useReadContract({
    address: PredictionAMMAddress as `0x${string}`,
    abi: PredictionAMMAbi,
    functionName: "marketCount",
  });

  const totalMarketCount = (BigInt(pmMarketCount || 0) + BigInt(ammMarketCount || 0)).toString();

  const handleMarketCreated = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="mx-auto max-w-7xl p-4 space-y-8">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Heading level={2}>{t("predict.prediction_markets")}</Heading>
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
              <p>{t("predict.learn_how_markets_work")}</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("predict.create_and_trade_tagline")}
        </p>
        <p className="text-xs text-muted-foreground italic">
          {t("predict.all_deposits_earn_lido")}{" "}
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

      <div>
        <Heading level={3} className="mb-6">
          {t("predict.all_markets")} ({totalMarketCount})
        </Heading>
        <MarketGallery refreshKey={refreshKey} />
      </div>

      <div className="border-t border-border pt-8 mt-8">
        <CreateMarketForm onMarketCreated={handleMarketCreated} />
      </div>
    </div>
  );
};

export default PredictPage;
