import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatBalance } from "@/lib/utils";
import React, { useMemo } from "react";
import { parseUnits, formatUnits } from "viem";
import type { IncentiveStream } from "@/hooks/use-incentive-streams";

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
  stream?: IncentiveStream;
  totalStaked?: bigint;
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
  stream,
  totalStaked,
}) => {
  // Calculate staking pool percentage and daily rewards estimate
  const estimations = useMemo(() => {
    if (!amount || parseFloat(amount) <= 0) {
      return null;
    }

    try {
      const lpTokensToStake = parseUnits(amount, 18);
      const currentTotalStaked = totalStaked || 0n;
      const newTotalStaked = currentTotalStaked + lpTokensToStake;

      // Calculate share of staking pool (not AMM pool)
      // This shows what percentage of the pool the user will own AFTER staking
      let stakingPoolPercentage = 0;
      if (currentTotalStaked === 0n) {
        // First staker gets 100%
        stakingPoolPercentage = 100;
      } else {
        // User's share after staking = userTokens / (existingTotal + userTokens)
        // Use BigInt math to avoid precision loss, then convert to percentage
        const shareRatio = (lpTokensToStake * 10000n) / newTotalStaked; // Multiply by 10000 for 2 decimal places
        stakingPoolPercentage = Number(shareRatio) / 100; // Divide by 100 to get percentage with 2 decimals
      }

      // Calculate daily rewards using zChef formula
      // rewardRate is scaled by 1e12 in the contract (tokens * 1e12 per second)
      // Formula: (userShares * rewardRate * seconds) / totalShares / 1e12
      let dailyRewards = null;
      if (stream && stream.rewardRate && newTotalStaked > 0n) {
        const secondsPerDay = 86400n;
        const ACC_PRECISION = 1000000000000n; // 1e12
        const userDailyRewards = (lpTokensToStake * stream.rewardRate * secondsPerDay) / newTotalStaked / ACC_PRECISION;
        dailyRewards = formatUnits(userDailyRewards, stream.rewardCoin?.decimals || 18);
      }

      return {
        stakingPoolPercentage: stakingPoolPercentage.toFixed(2),
        dailyRewards,
      };
    } catch {
      return null;
    }
  }, [amount, totalStaked, stream]);
  return (
    <div className="space-y-4">
      {/* Amount */}
      <div className="space-y-3">
        <Label htmlFor="amount-lp" className="font-mono font-bold text-primary uppercase tracking-wide">
          <span className="text-muted-foreground">&gt;</span> {t("common.amount_to_stake")}
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
              <span className="text-muted-foreground">{t("common.available")}:</span>
              <span className="text-primary font-bold break-all text-left sm:text-right flex items-center gap-2">
                {isLpBalanceLoading ? (
                  <span className="animate-pulse">{t("common.loading_balance")}</span>
                ) : (
                  <>{formatBalance(maxAmount, "LP")}</>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Section */}
      {estimations && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
          <p className="font-mono font-bold mb-3 text-green-500 text-sm">[{t("common.preview")}]</p>
          <div className="space-y-2 text-sm font-mono">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("common.staking_pool_share")}:</span>
              <span className="text-green-500 font-bold">{estimations.stakingPoolPercentage}%</span>
            </div>
            {estimations.dailyRewards && stream?.rewardCoin && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("common.estimated_daily_rewards")}:</span>
                <span className="text-green-500 font-bold">
                  {formatBalance(estimations.dailyRewards, stream.rewardCoin.symbol)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Operator approval notice */}
      {!isOperatorApproved && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
          <p className="font-mono font-bold mb-2 text-yellow-500 text-sm">[{t("common.approval_required")}]</p>
          <p className="text-sm font-mono text-yellow-500/80">{t("common.operator_approval_needed_for_lp_staking")}</p>
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
          [{isOperatorApproved ? t("common.stake") : t("common.approve_and_stake")}]
        </Button>
      </div>
    </div>
  );
};
