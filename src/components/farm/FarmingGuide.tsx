import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAccount } from "wagmi";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface FarmingGuideProps {
  className?: string;
}

export function FarmingGuide({ className }: FarmingGuideProps) {
  const { t } = useTranslation();
  const { address } = useAccount();
  const [isExpanded, setIsExpanded] = useState(false);

  // Don't show if user is not connected
  if (!address) {
    return null;
  }

  return (
    <Card className={`${className} border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-mono font-bold text-primary text-sm flex items-center gap-2">
            <span>🌱</span>
            [{t("common.farming_guide")}]
          </CardTitle>
          <Badge variant="outline" className="text-xs font-mono border-primary/30 text-primary">
            {t("common.new_to_farming")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground font-mono">
            {t("common.farming_guide_description")}
          </p>
          
          {!isExpanded ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExpanded(true)}
              className="font-mono font-bold tracking-wide text-xs border-primary/40 hover:border-primary hover:bg-primary/20 !text-foreground dark:!text-foreground hover:!text-foreground dark:hover:!text-foreground"
            >
              [{t("common.show_guide")}]
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3">
                <div className="flex items-start gap-3 p-3 bg-background/50 rounded border border-primary/10">
                  <div className="w-6 h-6 bg-primary/20 rounded-full flex items-center justify-center text-primary font-mono font-bold text-xs">
                    1
                  </div>
                  <div>
                    <h4 className="font-mono font-bold text-sm text-foreground mb-1">
                      {t("common.step_1_title")}
                    </h4>
                    <p className="text-xs text-muted-foreground font-mono">
                      Add liquidity to pools on the{" "}
                      <Link 
                        to="/swap" 
                        className="text-primary hover:text-primary/80 underline font-bold"
                      >
                        Swap page
                      </Link>
                      {" "}to receive LP tokens (or use ETH zap for easy one-click liquidity)
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 p-3 bg-background/50 rounded border border-primary/10">
                  <div className="w-6 h-6 bg-primary/20 rounded-full flex items-center justify-center text-primary font-mono font-bold text-xs">
                    2
                  </div>
                  <div>
                    <h4 className="font-mono font-bold text-sm text-foreground mb-1">
                      {t("common.step_2_title")}
                    </h4>
                    <p className="text-xs text-muted-foreground font-mono">
                      {t("common.step_2_description")}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 p-3 bg-background/50 rounded border border-primary/10">
                  <div className="w-6 h-6 bg-primary/20 rounded-full flex items-center justify-center text-primary font-mono font-bold text-xs">
                    3
                  </div>
                  <div>
                    <h4 className="font-mono font-bold text-sm text-foreground mb-1">
                      {t("common.step_3_title")}
                    </h4>
                    <p className="text-xs text-muted-foreground font-mono">
                      {t("common.step_3_description")}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsExpanded(false)}
                  className="font-mono font-bold tracking-wide text-xs border-primary/40 hover:border-primary hover:bg-primary/20 !text-foreground dark:!text-foreground hover:!text-foreground dark:hover:!text-foreground"
                >
                  [{t("common.hide_guide")}]
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    // Scroll to the farm cards
                    const farmCards = document.querySelector('.farm-cards-container');
                    if (farmCards) {
                      farmCards.scrollIntoView({ behavior: 'smooth' });
                    }
                  }}
                  className="font-mono font-bold tracking-wide text-xs bg-primary hover:bg-primary/90 !text-background dark:!text-background hover:!text-background dark:hover:!text-background"
                >
                  [{t("common.start_farming")}]
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}