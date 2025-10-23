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
      {/* Enhanced Header */}
      <div className="text-center space-y-4 pt-4">
        <div className="flex items-center justify-center gap-3">
          <div className="relative">
            <Heading level={2} className="text-pink-500">
              {t("predict.prediction_markets")}
            </Heading>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowExplainer(true)}
                className="text-muted-foreground hover:text-primary transition-all hover:scale-110 duration-200"
              >
                <HelpCircle className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("predict.learn_how_markets_work")}</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-base text-muted-foreground max-w-2xl mx-auto">{t("predict.create_and_trade_tagline")}</p>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted/30 rounded-full border border-border/50">
          <span className="text-xs text-muted-foreground">{t("predict.all_deposits_earn_lido")}</span>
          <a
            href="https://lido.fi/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-primary hover:underline transition-colors inline-flex items-center gap-1"
          >
            Lido
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        </div>
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
