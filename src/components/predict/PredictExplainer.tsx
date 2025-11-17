import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, TrendingUp, AlertTriangle } from "lucide-react";

interface PredictExplainerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PredictExplainer: React.FC<PredictExplainerProps> = ({ isOpen, onClose }) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">Welcome to Prediction Markets on zAMM</DialogTitle>
          <DialogDescription className="text-sm">
            Trade on the outcomes of future events using wstETH
            <a
              href="https://github.com/zammdefi/pm"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              View Full Docs →
            </a>
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="pamm">How PAMM Works</TabsTrigger>
            <TabsTrigger value="tips">Pro Tips</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-3 sm:space-y-4 text-sm mt-4">
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
                    Tradeable (PAMM/AMM)
                  </p>
                  <p className="text-[11px] sm:text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
                    Pari-mutuel AMM with dynamic pricing. Prices update based on supply and demand. Buy and sell shares
                    anytime with instant liquidity. 0.1% swap fee applies.{" "}
                    <strong>Winners split the pot at resolution</strong> (not fixed $1 payout).
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-muted p-2.5 sm:p-3 rounded-lg">
              <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
                <strong>Note:</strong> Make sure you trust the resolver of any market you participate in. The resolver
                has full authority to determine the outcome after the market closes.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="pamm" className="space-y-3 sm:space-y-4 text-sm mt-4">
            <div className="bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-500 dark:border-blue-600 p-3 sm:p-4 rounded-lg">
              <div className="flex items-start gap-2 mb-2">
                <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="font-bold text-blue-900 dark:text-blue-100 text-sm sm:text-base">PAMM: Pari-Mutuel AMM</p>
              </div>
              <p className="text-xs sm:text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
                PAMM is a <strong>pari-mutuel</strong> market. When the event resolves,{" "}
                <strong>winners split a shared wstETH pot</strong>. It's <strong>not</strong> a fixed "$1 if YES"
                system.
              </p>
            </div>

            <div>
              <h4 className="font-bold mb-2 text-sm sm:text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                What You're Buying
              </h4>
              <ul className="space-y-1.5 list-disc list-inside text-muted-foreground text-xs sm:text-sm">
                <li>
                  A YES or NO share is a <strong>claim on a shared pot</strong> of wstETH
                </li>
                <li>The displayed odds come from the on-chain YES/NO pool (like a price)</li>
                <li>Odds move as people trade, similar to an AMM</li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold mb-2 text-sm sm:text-base">How Payouts Work</h4>
              <div className="bg-muted p-3 rounded-lg text-xs sm:text-sm space-y-2">
                <p className="text-muted-foreground">
                  <strong>Payout per winning share</strong> ={" "}
                  <span className="font-mono">pot (after fees) ÷ circulating winning shares</span>
                </p>
                <p className="text-muted-foreground text-[11px]">
                  <em>Note: Shares held by the protocol/AMM don't count in the denominator.</em>
                </p>
                <p className="text-muted-foreground">
                  Your total payout = <span className="font-mono">your winning shares × payout per share</span>
                </p>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                ⚠️ <strong>Not fixed payout:</strong> There's no guaranteed $1 per winning share. Payout depends on total
                pot size and number of winning shares.
              </p>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-300 dark:border-yellow-800 p-3 rounded-lg">
              <div className="flex items-start gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                <h4 className="font-bold text-yellow-900 dark:text-yellow-100 text-xs sm:text-sm">
                  "I won the bet but lost money" — Why?
                </h4>
              </div>
              <p className="text-[11px] sm:text-xs text-yellow-800 dark:text-yellow-200 leading-relaxed">
                If you <strong>bought late</strong> on the already-favored side, your{" "}
                <strong>average cost per share</strong> might be <strong>higher</strong> than the final payout per share
                (because many other buyers minted more winning shares, diluting the split).
              </p>
              <p className="text-[11px] sm:text-xs text-yellow-800 dark:text-yellow-200 leading-relaxed mt-2">
                <strong>Result:</strong> You're right on the outcome, but your <strong>cost &gt; payout</strong>, so you
                lose a bit.
              </p>
            </div>

            <div>
              <h4 className="font-bold mb-2 text-sm sm:text-base">Simple Example</h4>
              <div className="bg-muted p-3 rounded-lg text-xs sm:text-sm space-y-1">
                <p>
                  • Pot ends at <strong>10 wstETH</strong>
                </p>
                <p>
                  • Circulating winning shares = <strong>12.5</strong>
                </p>
                <p>
                  • <strong>Payout per share = 10 / 12.5 = 0.8 wstETH</strong>
                </p>
                <p className="text-green-600 dark:text-green-400 mt-2">
                  ✅ If your avg cost per share was <strong>0.65</strong>, you profit (0.8 &gt; 0.65)
                </p>
                <p className="text-red-600 dark:text-red-400">
                  ❌ If your avg cost was <strong>0.85</strong>, you "won" but lose (0.8 &lt; 0.85)
                </p>
              </div>
            </div>

            <div>
              <h4 className="font-bold mb-2 text-sm sm:text-base">Fees & Timing</h4>
              <ul className="space-y-1 list-disc list-inside text-muted-foreground text-xs sm:text-sm">
                <li>
                  <strong>0.10% market-quality fee</strong> baked into every trade quote (discourages spam trades)
                </li>
                <li>No extra fee at claim time</li>
                <li>
                  <strong>Trading open</strong> until market's <strong>close time</strong>
                </li>
                <li>After close and resolution, trading disabled; winners can claim</li>
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="tips" className="space-y-3 sm:space-y-4 text-sm mt-4">
            <div>
              <h4 className="font-bold mb-2 text-sm sm:text-base">How to Make Money in PAMM</h4>
              <div className="space-y-3">
                <div className="bg-green-50 dark:bg-green-950/20 p-3 rounded-lg border border-green-200 dark:border-green-800">
                  <p className="font-semibold text-green-900 dark:text-green-100 mb-1 text-xs sm:text-sm">
                    1. Be Early & Right (Hold to Resolution)
                  </p>
                  <p className="text-[11px] sm:text-xs text-green-800 dark:text-green-200 leading-relaxed">
                    Buy when you believe the true chance is higher than current odds. If later trading and/or the losing
                    side's spending grows the pot relative to your entry cost, your{" "}
                    <strong>payout per share &gt; your cost</strong>.
                  </p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="font-semibold text-blue-900 dark:text-blue-100 mb-1 text-xs sm:text-sm">
                    2. Trade the Move (Before Resolution)
                  </p>
                  <p className="text-[11px] sm:text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
                    Buy when you think odds will rise; <strong>sell</strong> later if your refund quote exceeds your
                    cost. Quotes include the 0.10% fee; refunds are capped by the pot.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-bold mb-2 text-sm sm:text-base">Pro Tips for New Traders</h4>
              <ul className="space-y-2 text-xs sm:text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">📊</span>
                  <div>
                    <strong>Check two numbers before you buy:</strong>
                    <ul className="list-disc list-inside ml-4 mt-1 text-muted-foreground">
                      <li>Projected payout if resolved now (pot ÷ current circulating winners)</li>
                      <li>Your avg cost per share (shown on your ticket)</li>
                    </ul>
                    <p className="mt-1 text-muted-foreground">
                      Aim for <strong>projected payout ≥ your cost</strong>.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-yellow-500 font-bold">⚠️</span>
                  <p className="text-muted-foreground">
                    <strong>Late buys on a heavy favorite</strong> can still lose money at resolution — consider taking
                    profits <strong>before</strong> resolution if your sell quote is above your cost.
                  </p>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 font-bold">✅</span>
                  <p className="text-muted-foreground">
                    <strong>Short windows & on-chain outcomes</strong> (like ICO milestones) are friendliest to learn
                    on: clear info, clear timelines.
                  </p>
                </li>
              </ul>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg border border-blue-300 dark:border-blue-700">
              <h4 className="font-bold mb-2 text-sm sm:text-base text-blue-900 dark:text-blue-100">Why PAMM?</h4>
              <ul className="space-y-1 list-disc list-inside text-xs sm:text-sm text-blue-800 dark:text-blue-200">
                <li>
                  <strong>On-chain, transparent math</strong> (pot & shares are visible)
                </li>
                <li>
                  <strong>Capital-efficient</strong> (no $1-per-share collateral requirement)
                </li>
                <li>
                  <strong>Flexible:</strong> you can hold to resolution or trade the move
                </li>
              </ul>
            </div>

            <div className="bg-muted p-3 rounded-lg">
              <p className="text-[11px] sm:text-xs font-bold text-center">
                Not a fixed-payout market — winners split a shared pot; profit when your average cost per share is at or
                below the final payout per share.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <Button onClick={onClose} className="w-full mt-4">
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
