import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TokenMeta } from "@/lib/coins";
import { formatEther } from "viem";
import React from "react";

interface EthZapTabProps {
  t: (k: string) => string;
  amount: string;
  setAmount: (v: string) => void;
  maxAmount: string;
  onMaxClick: () => void;
  onStakeClick: () => void;
  stakeDisabled: boolean;

  // slippage controls
  customSlippage: string;
  setCustomSlippage: (v: string) => void;
  showSlippageSettings: boolean;
  setShowSlippageSettings: (v: boolean) => void;

  // zap data
  zapCalculation: any;
  slippageBps: bigint;
  lpToken: TokenMeta;
  maxEthForZap: bigint;
}

export const EthZapTab: React.FC<EthZapTabProps> = ({
  t,
  amount,
  setAmount,
  maxAmount,
  onMaxClick,
  onStakeClick,
  stakeDisabled,
  customSlippage,
  setCustomSlippage,
  showSlippageSettings,
  setShowSlippageSettings,
  zapCalculation,
  lpToken,
  maxEthForZap,
}) => {
  const isLowLiquidityPool =
    lpToken?.reserve0 && lpToken.reserve0 < BigInt("10000000000000000");
  return (
    <div className="space-y-4">
      {/* Amount */}
      <div className="space-y-3">
        <Label
          htmlFor="amount-eth"
          className="font-mono font-bold text-primary uppercase tracking-wide"
        >
          <span className="text-muted-foreground">&gt;</span>{" "}
          {t("common.eth_amount")}
        </Label>
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            id="amount-eth"
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
                {maxAmount}
              </span>
            </div>
          </div>
        </div>

        {/* Slippage Settings */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label className="font-mono font-bold text-primary uppercase tracking-wide">
              <span className="text-muted-foreground">&gt;</span> Slippage
              Tolerance
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowSlippageSettings(!showSlippageSettings)}
              className="font-mono text-xs"
            >
              {customSlippage}% {showSlippageSettings ? "▲" : "▼"}
            </Button>
          </div>
          {showSlippageSettings && (
            <div className="bg-background/30 border border-primary/20 rounded p-3 space-y-3">
              <div className="grid grid-cols-4 gap-2">
                {["1", "5", "10", "15"].map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant={customSlippage === value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCustomSlippage(value)}
                    className="font-mono text-xs"
                  >
                    {value}%
                  </Button>
                ))}
              </div>
              <div className="flex gap-2 items-center">
                <Input
                  type="number"
                  value={customSlippage}
                  onChange={(e) => setCustomSlippage(e.target.value)}
                  className="font-mono text-sm"
                  placeholder="Custom"
                  min={0.1}
                  max={50}
                  step={0.1}
                />
                <span className="text-xs font-mono text-muted-foreground">
                  %
                </span>
              </div>
              {parseFloat(customSlippage) > 15 && (
                <p className="text-xs text-yellow-500 font-mono">
                  ⚠ High slippage may result in unfavorable rates
                </p>
              )}
            </div>
          )}

          {isLowLiquidityPool ? (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3">
              <p className="text-xs font-mono text-yellow-500">
                ⚠ Low liquidity pool - limited ETH capacity
              </p>
              <p className="text-xs font-mono text-muted-foreground mt-1">
                Max ETH for {customSlippage}% slippage:{" "}
                {formatEther(maxEthForZap)} ETH
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* ETH Zap Explanation */}
      <div className="bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5 border border-primary/30 rounded-lg p-4">
        <p className="font-mono font-bold mb-3 text-primary text-sm">
          [{t("common.eth_zap_info")}]
        </p>
        <ul className="space-y-2 text-sm font-mono text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold">•</span>
            <span>{t("common.half_eth_swapped")}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold">•</span>
            <span>{t("common.remaining_eth_paired")}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold">•</span>
            <span>{t("common.lp_tokens_staked_automatically")}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold">•</span>
            <span className="text-xs opacity-75">
              {t("common.dust_refund_note")}
            </span>
          </li>
        </ul>
      </div>

      {/* Zap error */}
      {zapCalculation && !zapCalculation.isValid && (
        <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
          <div className="text-sm text-red-400 font-mono">
            [ERROR]:{" "}
            {zapCalculation.error || t("common.zap_calculation_failed")}
          </div>
        </div>
      )}

      {/* Action */}
      <div className="space-y-4">
        <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
        <Button
          onClick={onStakeClick}
          disabled={stakeDisabled}
          className="w-full font-mono font-bold tracking-wide text-lg py-4 hover:scale-105 transition-all duration-200 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary shadow-lg disabled:opacity-50 !text-background"
        >
          [{t("common.zap_and_stake")}]
        </Button>
      </div>
    </div>
  );
};
