import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface PredictExplainerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PredictExplainer: React.FC<PredictExplainerProps> = ({ isOpen, onClose }) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Welcome to Prediction Markets on zAMM</DialogTitle>
          <DialogDescription>
            Trade on the outcomes of future events using wstETH
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div>
            <h4 className="font-bold mb-2">How it works</h4>
            <ul className="space-y-2 list-disc list-inside text-muted-foreground">
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
              <li>Winners receive their share of the pool proportionally</li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold mb-2">Creating Markets</h4>
            <p className="text-muted-foreground">
              Anyone can create a prediction market by specifying:
            </p>
            <ul className="space-y-1 list-disc list-inside text-muted-foreground mt-2">
              <li>Market question and details</li>
              <li>Resolver address (who decides the outcome)</li>
              <li>Closing time (when trading stops)</li>
              <li>Optional early closing by resolver</li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold mb-2">Key Features</h4>
            <ul className="space-y-1 list-disc list-inside text-muted-foreground">
              <li>
                All deposits earn{" "}
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
              <li>Trustless - outcomes determined by designated resolver</li>
              <li>ERC6909 shares - tradeable and transferable</li>
              <li>No platform fees, only gas costs</li>
            </ul>
          </div>

          <div className="bg-muted p-3 rounded-lg">
            <p className="text-xs text-muted-foreground">
              <strong>Note:</strong> Make sure you trust the resolver of any market you participate in.
              The resolver has full authority to determine the outcome after the market closes.
            </p>
          </div>
        </div>

        <Button onClick={onClose} className="w-full">
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
