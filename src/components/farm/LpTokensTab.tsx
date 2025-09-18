import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatBalance } from "@/lib/utils";
import React from "react";

interface LpTokensTabProps {
  t: (k: string) => string;
  amount: string;
  setAmount: (v: string) => void;
  maxAmount: string;
  isOperatorApproved: boolean;
  isLpBalanceLoading: boolean;
  onMaxClick: () => void;
  onStakeClick: () => void;
  stakeDisabled: boolean;
}

export const LpTokensTab: React.FC<LpTokensTabProps> = ({
  t,
  amount,
  setAmount,
  maxAmount,
  isOperatorApproved,
  isLpBalanceLoading,
  onMaxClick,
  onStakeClick,
  stakeDisabled,
}) => {
  return (
    <div className="space-y-4">
      {/* Amount */}
      <div className="space-y-3">
        <Label
          htmlFor="amount-lp"
          className="font-mono font-bold text-primary uppercase tracking-wide"
        >
          <span className="text-muted-foreground">&gt;</span>{" "}
          {t("common.amount_to_stake")}
        </Label>
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            id="amount-lp"
            type="number"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="font-mono text-lg bg-background/50 border-primary/30 focus:border-primary/60 backdrop-blur-sm flex-1"
            step="0.000001"
            min="0"
            max={maxAmount}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onMaxClick}
            disabled={Number.parseFloat(maxAmount) === 0}
            className="font-mono font-bold tracking-wide border-primary/40 hover:border-primary hover:bg-primary/20 px-4 sm:px-6 py-2 sm:py-1 !text-foreground"
          >
            {t("common.max")}
          </Button>
        </div>
        <div className="bg-background/30 border border-primary/20 rounded p-3">
          <div className="space-y-2 text-sm font-mono">
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
              <span className="text-muted-foreground">
                {t("common.available")}:
              </span>
              <span className="text-primary font-bold break-all text-left sm:text-right flex items-center gap-2">
                {isLpBalanceLoading ? (
                  <span className="animate-pulse">
                    {t("common.loading_balance")}
                  </span>
                ) : (
                  <>{formatBalance(maxAmount, "LP")}</>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Operator approval notice */}
      {!isOperatorApproved && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
          <p className="font-mono font-bold mb-2 text-yellow-500 text-sm">
            [{t("common.approval_required")}]
          </p>
          <p className="text-sm font-mono text-yellow-500/80">
            {t("common.operator_approval_needed_for_lp_staking")}
          </p>
        </div>
      )}

      {/* Action */}
      <div className="space-y-4">
        <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
        <Button
          onClick={onStakeClick}
          disabled={stakeDisabled}
          className={cn(
            "w-full font-mono font-bold tracking-wide text-lg py-4 hover:scale-105 transition-all duration-200 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary shadow-lg disabled:opacity-50 !text-background",
          )}
        >
          [
          {isOperatorApproved
            ? t("common.stake")
            : t("common.approve_and_stake")}
          ]
        </Button>
      </div>
    </div>
  );
};
