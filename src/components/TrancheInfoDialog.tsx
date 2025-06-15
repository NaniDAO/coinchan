import { InfoIcon, XIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function TrancheInfoDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-6 w-6 p-0 text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-all hover:scale-110 active:scale-95"
          title="Learn how tranche sales work"
        >
          <InfoIcon className="h-4 w-4" />
          <span className="sr-only">How tranche sales work</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-background border-2 border-border shadow-[8px_8px_0_var(--border)] [&>button:first-child]:hidden">
        {/* Custom Close Button with Better Hover Effect */}
        <DialogClose className="absolute top-6 right-6 z-20 h-8 w-8 border-2 border-border bg-background text-foreground shadow-[2px_2px_0_var(--border)] transition-all hover:bg-foreground hover:text-background hover:shadow-[3px_3px_0_var(--border)] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none focus:outline-none flex items-center justify-center">
          <XIcon className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogClose>
        
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center bg-background border-2 border-border shadow-[4px_4px_0_var(--border)] p-4">
            <h2 className="text-xl font-bold mb-2 text-foreground font-mono">ZAMM Coin Launchpad</h2>
            <div className="text-xs text-[#00D4FF] font-mono border border-[#00D4FF] px-2 py-1 inline-block">
              Create, Sell & Launch Your Coin
            </div>
          </div>

          {/* Lifecycle Steps */}
          <div className="space-y-4">
            {/* Step 1 */}
            <div className="bg-background border-2 border-border shadow-[4px_4px_0_var(--border)] hover:shadow-[6px_6px_0_var(--border)] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all duration-200 p-4">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-foreground text-background flex items-center justify-center font-bold text-sm flex-shrink-0 font-mono">
                  1
                </div>
                <div className="flex-1">
                  <h3 className="text-lg mb-3 text-foreground font-mono">1. Create Your Coin</h3>
                  <ul className="text-sm text-muted-foreground space-y-1 font-mono">
                    <li className="flex items-start gap-2"><span className="text-[#00D4FF]">{'>>>'}</span> Mint new coin with custom supply</li>
                    <li className="flex items-start gap-2"><span className="text-[#00D4FF]">{'>>>'}</span> Set creator allocation (time-lockable)</li>
                    <li className="flex items-start gap-2"><span className="text-[#00D4FF]">{'>>>'}</span> Reserve tokens for sale + liquidity</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="text-center text-muted-foreground text-xl font-mono">|</div>

            {/* Step 2 */}
            <div className="bg-background border-2 border-border shadow-[4px_4px_0_var(--border)] hover:shadow-[6px_6px_0_var(--border)] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all duration-200 p-4">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-foreground text-background flex items-center justify-center font-bold text-sm flex-shrink-0 font-mono">
                  2
                </div>
                <div className="flex-1">
                  <h3 className="text-lg mb-3 text-foreground font-mono">2. Design Price Curve</h3>
                  <ul className="text-sm text-muted-foreground space-y-1 font-mono">
                    <li className="flex items-start gap-2"><span className="text-[#66D9A6]">{'>>>'}</span> Create price tranches (staircase)</li>
                    <li className="flex items-start gap-2"><span className="text-[#66D9A6]">{'>>>'}</span> Each tranche = different price</li>
                    <li className="flex items-start gap-2"><span className="text-[#66D9A6]">{'>>>'}</span> Early buyers get better rates</li>
                    <li className="flex items-start gap-2"><span className="text-[#66D9A6]">{'>>>'}</span> Max duration: 1 week</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="text-center text-muted-foreground text-xl font-mono">|</div>

            {/* Step 3 */}
            <div className="bg-background border-2 border-border shadow-[4px_4px_0_var(--border)] hover:shadow-[6px_6px_0_var(--border)] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all duration-200 p-4">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-foreground text-background flex items-center justify-center font-bold text-sm flex-shrink-0 font-mono">
                  3
                </div>
                <div className="flex-1">
                  <h3 className="text-lg mb-3 text-foreground font-mono">3. Public Sale Begins</h3>
                  <ul className="text-sm text-muted-foreground space-y-1 font-mono">
                    <li className="flex items-start gap-2"><span className="text-[#FF6B9D]">{'>>>'}</span> Buyers purchase from tranches</li>
                    <li className="flex items-start gap-2"><span className="text-[#FF6B9D]">{'>>>'}</span> Lower prices sell first</li>
                    <li className="flex items-start gap-2"><span className="text-[#FF6B9D]">{'>>>'}</span> ETH goes to liquidity pool</li>
                    <li className="flex items-start gap-2"><span className="text-[#FF6B9D]">{'>>>'}</span> Unsold tokens → pool</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="text-center text-muted-foreground text-xl font-mono">|</div>

            {/* Decision Point */}
            <div className="bg-background border-2 border-dashed border-[#FFE066] text-center p-4">
              <p className="font-bold text-lg mb-2 text-[#FFE066] font-mono">What happens next?</p>
              <p className="text-sm text-muted-foreground font-mono">Depends on sale results...</p>
            </div>

            {/* Outcomes */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-background border-2 border-border text-center p-4 hover:shadow-[4px_4px_0_var(--border)] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all">
                <h4 className="text-sm text-[#66D9A6] mb-2 font-mono">Early Graduation</h4>
                <div className="text-xs space-y-1 text-muted-foreground font-mono">
                  <p className="text-foreground">If ALL coins sell out</p>
                  <p>→ Instant pool creation</p>
                  <p>→ Trading starts immediately</p>
                  <p>→ Maximum liquidity achieved</p>
                </div>
              </div>
              <div className="bg-background border-2 border-border text-center p-4 hover:shadow-[4px_4px_0_var(--border)] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all">
                <h4 className="text-sm text-[#B967DB] mb-2 font-mono">Normal Finalization</h4>
                <div className="text-xs space-y-1 text-muted-foreground font-mono">
                  <p className="text-foreground">After 1 week time limit</p>
                  <p>→ Pool created with sold coins</p>
                  <p>→ Trading starts with available liquidity</p>
                  <p>→ Remaining coins included in pool</p>
                </div>
              </div>
            </div>

            <div className="text-center text-muted-foreground text-xl font-mono">|</div>

            {/* Step 4 */}
            <div className="bg-background border-2 border-border shadow-[4px_4px_0_var(--border)] hover:shadow-[6px_6px_0_var(--border)] hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all duration-200 p-4">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-foreground text-background flex items-center justify-center font-bold text-sm flex-shrink-0 font-mono">
                  4
                </div>
                <div className="flex-1">
                  <h3 className="text-lg mb-3 text-foreground font-mono">4. Liquidity Pool Goes Live</h3>
                  <ul className="text-sm text-muted-foreground space-y-1 font-mono">
                    <li className="flex items-start gap-2"><span className="text-[#B967DB]">{'>>>'}</span> ETH + coins → trading pool</li>
                    <li className="flex items-start gap-2"><span className="text-[#B967DB]">{'>>>'}</span> Hybrid AMM/orderbook enabled</li>
                    <li className="flex items-start gap-2"><span className="text-[#B967DB]">{'>>>'}</span> Continuous liquidity available</li>
                    <li className="flex items-start gap-2"><span className="text-[#B967DB]">{'>>>'}</span> Creator tokens unlockable</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Key Features */}
          <div className="bg-background border-2 border-border shadow-[4px_4px_0_var(--border)] p-4">
            <h3 className="text-lg text-foreground text-center mb-4 font-mono">
              Key Features
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-3 p-2 bg-background border border-border font-mono">
                <span className="text-[#66D9A6] font-bold">[✓]</span>
                <span className="text-muted-foreground">Custom price curves</span>
              </div>
              <div className="flex items-center gap-3 p-2 bg-background border border-border font-mono">
                <span className="text-[#66D9A6] font-bold">[✓]</span>
                <span className="text-muted-foreground">Creator token vesting</span>
              </div>
              <div className="flex items-center gap-3 p-2 bg-background border border-border font-mono">
                <span className="text-[#66D9A6] font-bold">[✓]</span>
                <span className="text-muted-foreground">Auto liquidity provision</span>
              </div>
              <div className="flex items-center gap-3 p-2 bg-background border border-border font-mono">
                <span className="text-[#66D9A6] font-bold">[✓]</span>
                <span className="text-muted-foreground">Early graduation option</span>
              </div>
              <div className="flex items-center gap-3 p-2 bg-background border border-border font-mono">
                <span className="text-[#66D9A6] font-bold">[✓]</span>
                <span className="text-muted-foreground">Hybrid AMM + orderbook</span>
              </div>
              <div className="flex items-center gap-3 p-2 bg-background border border-border font-mono">
                <span className="text-[#66D9A6] font-bold">[✓]</span>
                <span className="text-muted-foreground">Zero upfront costs</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}