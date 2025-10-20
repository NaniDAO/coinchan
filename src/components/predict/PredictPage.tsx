import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateMarketForm } from "./CreateMarketForm";
import { MarketGallery } from "./MarketGallery";
import { Heading } from "@/components/ui/typography";
import { PredictExplainer, usePredictExplainer } from "./PredictExplainer";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { HelpCircle, ChevronDown, ChevronUp } from "lucide-react";

const PredictPage: React.FC = () => {
  const { t } = useTranslation();
  const [refreshKey, setRefreshKey] = useState(0);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const { showExplainer, handleClose, setShowExplainer } = usePredictExplainer();

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
        <p className="text-sm text-muted-foreground">{t("predict.create_and_trade_tagline")}</p>
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

      <MarketGallery refreshKey={refreshKey} />

      <div className="border-t border-border pt-6 mt-8">
        <Button
          variant="outline"
          onClick={() => setIsCreateFormOpen(!isCreateFormOpen)}
          className="w-full flex items-center justify-between"
        >
          <span className="font-semibold">{t("predict.create_prediction_market")}</span>
          {isCreateFormOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>

        {isCreateFormOpen && (
          <div className="mt-6">
            <CreateMarketForm onMarketCreated={handleMarketCreated} />
          </div>
        )}
      </div>
    </div>
  );
};

export default PredictPage;
