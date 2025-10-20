import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface PredictExplainerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PredictExplainer: React.FC<PredictExplainerProps> = ({ isOpen, onClose }) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">Welcome to Prediction Markets on zAMM</DialogTitle>
          <DialogDescription className="text-sm">Trade on the outcomes of future events using wstETH</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 sm:space-y-4 text-sm">
          <div>
            <h4 className="font-bold mb-1.5 sm:mb-2 text-sm sm:text-base">How it works</h4>
            <ul className="space-y-1.5 sm:space-y-2 list-disc list-inside text-muted-foreground text-xs sm:text-sm">
              <li>Buy YES or NO shares with ETH for any market</li>
              <li>
                ETH is automatically converted to wstETH (
                <a
                  href="https://lido.fi/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-primary transition-colors"
                >
                  Lido
                </a>{" "}
                staked ETH)
              </li>
              <li>Your deposits earn staking yield while the market is active</li>
              <li>After the market closes, the resolver determines the outcome</li>
              <li>Winners claim their winnings based on the market type</li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold mb-1.5 sm:mb-2 text-sm sm:text-base">Two Market Types</h4>
            <div className="space-y-2 sm:space-y-3">
              <div className="bg-purple-50 dark:bg-purple-950/20 p-2.5 sm:p-3 rounded-lg border border-purple-200 dark:border-purple-800">
                <p className="font-semibold text-purple-900 dark:text-purple-100 mb-1 text-xs sm:text-sm">
                  Parimutuel (Pot)
                </p>
                <p className="text-[11px] sm:text-xs text-purple-800 dark:text-purple-200 leading-relaxed">
                  All bets pool together. Winners split the total pot proportionally based on their shares. Simple 1:1
                  share purchase (1 wstETH = 1 share).
                </p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/20 p-2.5 sm:p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="font-semibold text-blue-900 dark:text-blue-100 mb-1 text-xs sm:text-sm">
                  Tradeable (AMM)
                </p>
                <p className="text-[11px] sm:text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
                  Automated Market Maker with dynamic pricing. Prices update based on supply and demand. Buy and sell
                  shares anytime with instant liquidity. 0.1% swap fees apply.
                </p>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-bold mb-1.5 sm:mb-2 text-sm sm:text-base">Creating Markets</h4>
            <p className="text-muted-foreground text-xs sm:text-sm mb-1.5">
              Anyone can create a prediction market by specifying:
            </p>
            <ul className="space-y-0.5 sm:space-y-1 list-disc list-inside text-muted-foreground text-xs sm:text-sm">
              <li>Market question and details</li>
              <li>Market type (Parimutuel or Tradeable AMM)</li>
              <li>Resolver address (who decides the outcome)</li>
              <li>Closing time (when trading stops)</li>
              <li>Optional early closing by resolver</li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold mb-1.5 sm:mb-2 text-sm sm:text-base">Key Features</h4>
            <ul className="space-y-0.5 sm:space-y-1 list-disc list-inside text-muted-foreground text-xs sm:text-sm">
              <li>
                All trades earn{" "}
                <a
                  href="https://lido.fi/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-primary transition-colors"
                >
                  Lido
                </a>{" "}
                staking yield (~3-4% APY)
              </li>
              <li>Open - outcomes determined by your designated resolver</li>
              <li>ERC6909 shares - tradeable and transferable on zAMM</li>
              <li>No platform fees on Parimutuel, 0.1% swap fee on zAMM</li>
            </ul>
          </div>

          <div className="bg-muted p-2.5 sm:p-3 rounded-lg">
            <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
              <strong>Note:</strong> Make sure you trust the resolver of any market you participate in. The resolver has
              full authority to determine the outcome after the market closes.
            </p>
          </div>
        </div>

        <Button onClick={onClose} className="w-full mt-2 sm:mt-4">
          Got it!
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export const usePredictExplainer = () => {
  const [showExplainer, setShowExplainer] = useState(false);

  useEffect(() => {
    const hasSeenExplainer = localStorage.getItem("hasSeenPredictExplainer");
    if (!hasSeenExplainer) {
      setShowExplainer(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem("hasSeenPredictExplainer", "true");
    setShowExplainer(false);
  };

  return { showExplainer, handleClose, setShowExplainer };
};
