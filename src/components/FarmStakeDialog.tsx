import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits, parseUnits, parseEther } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IncentiveStream } from "@/hooks/use-incentive-streams";
import { useZChefActions, useSetOperatorApproval, useZChefRewardPerSharePerYear } from "@/hooks/use-zchef-contract";
import { useOperatorStatus } from "@/hooks/use-operator-status";
import { useZapCalculations } from "@/hooks/use-zap-calculations";
import { useZapDeposit } from "@/hooks/use-zap-deposit";
import { useStreamValidation } from "@/hooks/use-stream-validation";
import { TokenMeta, ETH_TOKEN } from "@/lib/coins";
import { SINGLE_ETH_SLIPPAGE_BPS } from "@/lib/swap";
import { useAllCoins } from "@/hooks/metadata/use-all-coins";
import { ZChefAddress } from "@/constants/zChef";
import { cn, formatBalance } from "@/lib/utils";

interface FarmStakeDialogProps {
  stream: IncentiveStream;
  lpToken: TokenMeta;
  trigger: React.ReactNode;
  onSuccess?: () => void;
}

type StakeMode = "lp" | "eth";

export function FarmStakeDialog({ stream, lpToken, trigger, onSuccess }: FarmStakeDialogProps) {
  const { t } = useTranslation();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { tokens } = useAllCoins();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [isApproving, setIsApproving] = useState(false);
  const [stakeMode, setStakeMode] = useState<StakeMode>("lp");
  const [zapCalculation, setZapCalculation] = useState<any>(null);
  const [slippageBps] = useState(SINGLE_ETH_SLIPPAGE_BPS);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "confirming" | "success" | "error">("idle");
  const [txError, setTxError] = useState<string | null>(null);

  const { deposit } = useZChefActions();
  const setOperatorApproval = useSetOperatorApproval();
  const { calculateZapAmounts, formatZapPreview } = useZapCalculations();
  const zapDeposit = useZapDeposit();
  const { validateStreamBeforeAction } = useStreamValidation();
  const { data: rewardPerSharePerYear } = useZChefRewardPerSharePerYear(BigInt(stream.chefId));

  // Get ETH token data
  const ethToken = tokens.find((t) => t.id === null) || ETH_TOKEN;

  const { data: isOperatorApproved } = useOperatorStatus({
    address: address as `0x${string}`,
    operator: ZChefAddress, // Always approve for zChef contract
    tokenId: lpToken.id || undefined,
  });

  const maxAmount =
    stakeMode === "lp"
      ? lpToken.balance
        ? formatUnits(lpToken.balance, lpToken.decimals || 18)
        : "0"
      : ethToken.balance
        ? formatEther(ethToken.balance)
        : "0";

  const needsApproval = stakeMode === "lp" && !isOperatorApproved && parseFloat(amount) > 0;

  // Calculate expected APY from farm rewards
  const expectedFarmAPY = useMemo(() => {
    if (!rewardPerSharePerYear || !amount || parseFloat(amount) <= 0) return null;

    // rewardPerSharePerYear is scaled by 1e12 (ACC_PRECISION)
    const yearlyRewardPerShare = formatUnits(rewardPerSharePerYear, 12); // Remove ACC_PRECISION scaling

    // For display purposes, convert to percentage
    // This represents reward tokens earned per LP token per year
    const apyPercent = parseFloat(yearlyRewardPerShare) * 100;

    return {
      apy: apyPercent,
      yearlyReward: yearlyRewardPerShare,
      rewardSymbol: stream.rewardCoin?.symbol || "???",
    };
  }, [rewardPerSharePerYear, amount, stream.rewardCoin]);

  // Debounced zap calculation with proper cleanup
  const debounceTimerRef = useRef<NodeJS.Timeout>();

  const debouncedZapCalculation = useCallback(
    (ethAmount: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(async () => {
        try {
          const result = await calculateZapAmounts(ethAmount, stream, lpToken, slippageBps);
          setZapCalculation(result);
        } catch (error) {
          console.error("Zap calculation failed:", error);
          setZapCalculation(null);
        }
      }, 500); // 500ms debounce
    },
    [calculateZapAmounts, stream, lpToken, slippageBps],
  );

  // Calculate zap amounts when in ETH mode with debouncing
  useEffect(() => {
    if (stakeMode === "eth" && amount && parseFloat(amount) > 0) {
      debouncedZapCalculation(amount);
    } else {
      setZapCalculation(null);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    }

    // Cleanup on unmount
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [amount, stakeMode, debouncedZapCalculation]);

  const handleApprove = async () => {
    if (!lpToken.id || !address) return;

    try {
      setIsApproving(true);
      setTxStatus("pending");
      setTxError(null);

      const hash = await setOperatorApproval.mutateAsync({
        tokenId: lpToken.id,
        operator: ZChefAddress,
        approved: true,
      });

      setTxHash(hash);
      setTxStatus("confirming");

      // Wait for confirmation
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` });
        setTxStatus("success");
        setTimeout(() => {
          setTxStatus("idle");
          setTxHash(null);
        }, 3000);
      }
    } catch (error: any) {
      console.error("Approval failed:", error);
      setTxStatus("error");
      setTxError(error?.message || "Approval failed");
      setTimeout(() => {
        setTxStatus("idle");
        setTxError(null);
      }, 5000);
    } finally {
      setIsApproving(false);
    }
  };

  const handleStake = async () => {
    if (!amount || parseFloat(amount) <= 0) return;

    // Validate stream before proceeding
    const validation = validateStreamBeforeAction(stream, "stake");
    if (!validation.canProceed) {
      setTxStatus("error");
      setTxError(validation.error || "Cannot stake at this time");
      return;
    }

    try {
      setTxStatus("pending");
      setTxError(null);
      let hash: string;

      if (stakeMode === "lp") {
        const amountBigInt = parseUnits(amount, lpToken.decimals || 18);
        hash = await deposit.mutateAsync({
          chefId: stream.chefId,
          amount: amountBigInt,
        });
      } else {
        // ETH zap mode
        if (!zapCalculation || !zapCalculation.isValid) {
          throw new Error("Invalid zap calculation");
        }

        const ethAmountBigInt = parseEther(amount);
        hash = await zapDeposit.mutateAsync({
          chefId: stream.chefId,
          ethAmount: ethAmountBigInt,
          zapCalculation,
        });
      }

      setTxHash(hash);
      setTxStatus("confirming");

      // Wait for confirmation
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` });
        setTxStatus("success");

        // Show success notification
        console.log(`🎉 Stake successful!
        Mode: ${stakeMode === "lp" ? "LP Tokens" : "ETH Zap"}
        Amount: ${amount} ${stakeMode === "lp" ? lpToken.symbol : "ETH"}
        Pool: ${lpToken.symbol}
        TX: ${hash}`);

        // Reset form and close after success
        setTimeout(() => {
          setAmount("");
          setOpen(false);
          setTxStatus("idle");
          setTxHash(null);
          onSuccess?.();
        }, 3000); // Increased from 2000 to 3000ms
      }
    } catch (error: any) {
      console.error("Stake failed:", error);
      setTxStatus("error");
      setTxError(error?.message || "Staking failed");
      setTimeout(() => {
        setTxStatus("idle");
        setTxError(null);
      }, 5000);
    }
  };

  const handleMaxClick = () => {
    if (stakeMode === "eth") {
      // Leave some ETH for gas
      const ethAmount = ((ethToken.balance as bigint) * 99n) / 100n;
      setAmount(formatEther(ethAmount));
    } else {
      setAmount(maxAmount);
    }
  };

  const zapPreview = zapCalculation && zapCalculation.isValid ? formatZapPreview(zapCalculation, lpToken) : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto bg-gradient-to-br from-background/95 to-background/85 backdrop-blur-xl border-2 border-primary/40">
        <DialogHeader className="text-center">
          <DialogTitle className="font-mono font-bold uppercase text-xl sm:text-2xl tracking-wider bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            [{t("common.stake_lp_tokens")}]
          </DialogTitle>
          <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent mt-2"></div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Pool Information */}
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {lpToken?.imageUrl && (
                  <div className="relative">
                    <img
                      src={lpToken.imageUrl}
                      alt={lpToken.symbol}
                      className="w-8 h-8 rounded-full border-2 border-primary/40"
                    />
                    <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-primary/30 to-transparent opacity-50 blur-sm"></div>
                  </div>
                )}
                <div>
                  <h3 className="font-mono font-bold text-lg bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent break-all">
                    {lpToken?.symbol ||
                      (() => {
                        const lpId = stream.lpId?.toString();
                        // LP IDs are always full uint, truncate for UI
                        return lpId && lpId.length > 12
                          ? `Pool ${lpId.slice(0, 6)}...${lpId.slice(-6)}`
                          : `Pool ${lpId}`;
                      })()}
                  </h3>
                  <p className="text-xs text-muted-foreground font-mono">{t("common.lp_token_pool")}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="bg-background/30 border border-primary/20 rounded p-3">
                <p className="text-muted-foreground font-mono text-xs">{t("common.reward_token")}</p>
                <p className="font-mono font-bold text-primary">{stream.rewardCoin?.symbol}</p>
              </div>
              {lpToken && (
                <div className="bg-background/30 border border-primary/20 rounded p-3">
                  <p className="text-muted-foreground font-mono text-xs">{t("common.pool_liquidity")}</p>
                  <p className="font-mono font-bold text-primary">{formatEther(lpToken.reserve0 || lpToken.liquidity || 0n)} ETH</p>
                </div>
              )}
            </div>
          </div>

          {/* APY Information */}
          {expectedFarmAPY && (
            <div className="bg-gradient-to-r from-green-500/10 to-green-500/5 border border-green-500/30 rounded-lg p-4">
              <h4 className="font-mono font-bold text-sm uppercase tracking-wider mb-3 text-green-600 dark:text-green-400">
                [{t("common.expected_returns")}]
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-background/40 border border-green-500/20 rounded p-3">
                  <p className="text-muted-foreground font-mono text-xs">{t("common.farm_apy")}:</p>
                  <p className="font-mono font-bold text-green-600 dark:text-green-400 text-lg">
                    {expectedFarmAPY.apy.toFixed(2)}%
                  </p>
                </div>
                <div className="bg-background/40 border border-green-500/20 rounded p-3">
                  <p className="text-muted-foreground font-mono text-xs">{t("common.yearly_rewards")}:</p>
                  <p className="font-mono font-bold text-green-600 dark:text-green-400">
                    {parseFloat(expectedFarmAPY.yearlyReward).toFixed(6)} {expectedFarmAPY.rewardSymbol}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">{t("common.per_lp_token")}</p>
                </div>
              </div>
              <div className="mt-3 p-2 bg-background/30 border border-green-500/20 rounded">
                <p className="text-xs font-mono text-muted-foreground">
                  <span className="text-green-600 dark:text-green-400">ℹ</span> {t("common.apy_note")}
                </p>
              </div>
            </div>
          )}

          <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>

          {/* Stake Mode Selection */}
          <div className="space-y-3">
            <Label className="font-mono font-bold text-primary uppercase tracking-wide">
              <span className="text-muted-foreground">&gt;</span> {t("common.stake_mode")}
            </Label>
            <Tabs
              value={stakeMode}
              onValueChange={(value) => {
                setStakeMode(value as StakeMode);
                setAmount(""); // Clear amount when switching modes
              }}
            >
              <TabsList className="grid w-full grid-cols-2 bg-background/50 border-2 border-primary/30 p-1">
                <TabsTrigger
                  value="lp"
                  className="font-mono font-bold tracking-wide text-foreground dark:text-foreground data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary/80 data-[state=active]:text-primary-foreground data-[state=active]:!text-background dark:data-[state=active]:!text-background"
                >
                  [{t("common.lp_tokens")}]
                </TabsTrigger>
                <TabsTrigger
                  value="eth"
                  className="font-mono font-bold tracking-wide text-foreground dark:text-foreground data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary/80 data-[state=active]:text-primary-foreground data-[state=active]:!text-background dark:data-[state=active]:!text-background"
                >
                  [{t("common.eth_zap")}]
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Amount Input */}
          <div className="space-y-3">
            <Label htmlFor="amount" className="font-mono font-bold text-primary uppercase tracking-wide">
              <span className="text-muted-foreground">&gt;</span>{" "}
              {stakeMode === "lp" ? t("common.amount_to_stake") : t("common.eth_amount")}
            </Label>
            <div className="flex gap-3">
              <Input
                id="amount"
                type="number"
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="font-mono text-lg bg-background/50 border-primary/30 focus:border-primary/60 backdrop-blur-sm"
                step="0.000001"
                min="0"
                max={maxAmount}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleMaxClick}
                disabled={parseFloat(maxAmount) === 0}
                className="font-mono font-bold tracking-wide border-primary/40 hover:border-primary hover:bg-primary/20 px-4 !text-foreground dark:!text-foreground hover:!text-foreground dark:hover:!text-foreground"
              >
                {t("common.max")}
              </Button>
            </div>
            <div className="bg-background/30 border border-primary/20 rounded p-3">
              <div className="space-y-2 text-sm font-mono">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("common.available")}:</span>
                  <span className="text-primary font-bold break-all">
                    {formatBalance(maxAmount, stakeMode === "lp" ? lpToken.symbol : "ETH", 12)}
                  </span>
                </div>
              </div>
            </div>

            {/* ETH Zap Explanation */}
            {stakeMode === "eth" && (
              <div className="bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5 border border-primary/30 rounded-lg p-4">
                <p className="font-mono font-bold mb-3 text-primary text-sm">[{t("common.eth_zap_info")}]</p>
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
                </ul>
              </div>
            )}
          </div>

          {/* Stake Preview */}
          {amount && parseFloat(amount) > 0 && (
            <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30 rounded-lg p-4">
              <h4 className="font-mono font-bold text-base text-primary mb-4">[{t("common.transaction_preview")}]</h4>
              <div className="space-y-3">
                {stakeMode === "lp" ? (
                  <div className="bg-background/40 border border-primary/20 rounded p-3">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-muted-foreground">{t("common.staking_amount")}:</span>
                      <span className="font-mono font-bold text-primary text-lg">
                        {amount} {lpToken.symbol}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-background/40 border border-primary/20 rounded p-3">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-muted-foreground">{t("common.eth_input")}:</span>
                        <span className="font-mono font-bold text-primary text-lg">{amount} ETH</span>
                      </div>
                    </div>
                    {stakeMode === "eth" && amount && parseFloat(amount) > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="bg-background/40 border border-primary/20 rounded p-2">
                          <div className="text-xs text-muted-foreground font-mono">{t("common.eth_for_swap")}</div>
                          <div className="font-mono font-bold text-primary text-xs break-all">
                            {zapPreview ? `${parseFloat(zapPreview.ethToSwap).toFixed(4)} ETH` : "Calculating..."}
                          </div>
                        </div>
                        <div className="bg-background/40 border border-primary/20 rounded p-2">
                          <div className="text-xs text-muted-foreground font-mono">{t("common.estimated_tokens")}</div>
                          <div className="font-mono font-bold text-primary text-xs break-all">
                            {zapPreview
                              ? `${parseFloat(zapPreview.estimatedTokens).toFixed(6)} ${lpToken.symbol || ""}`
                              : "Calculating..."}
                          </div>
                        </div>
                        <div className="bg-background/40 border border-primary/20 rounded p-2">
                          <div className="text-xs text-muted-foreground font-mono">
                            {t("common.estimated_lp_tokens")}
                          </div>
                          <div className="font-mono font-bold text-primary text-xs break-all">
                            {zapPreview ? parseFloat(zapPreview.estimatedLpTokens).toFixed(6) : "Calculating..."}
                          </div>
                        </div>
                      </div>
                    )}
                    {zapCalculation && !zapCalculation.isValid && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
                        <div className="text-sm text-red-400 font-mono">
                          [ERROR]: {zapCalculation.error || t("common.zap_calculation_failed")}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="bg-background/40 border border-primary/20 rounded p-3">
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-muted-foreground">{t("common.estimated_daily_rewards")}:</span>
                    <span className="font-mono font-bold text-primary">-- {stream.rewardCoin?.symbol}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-4">
            <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>

            {needsApproval && (
              <Button
                onClick={handleApprove}
                disabled={isApproving || setOperatorApproval.isPending || txStatus !== "idle"}
                className="w-full font-mono font-bold tracking-wide py-3 hover:scale-105 transition-all duration-200 bg-gradient-to-r from-primary/80 to-primary/60 hover:from-primary hover:to-primary/80 disabled:opacity-50 !text-background dark:!text-background hover:!text-background dark:hover:!text-background"
                variant="outline"
              >
                {isApproving || setOperatorApproval.isPending || txStatus === "pending"
                  ? `[${t("common.approving")}...]`
                  : `[${t("common.approve_lp_tokens")}]`}
              </Button>
            )}

            <Button
              onClick={handleStake}
              disabled={
                !amount ||
                parseFloat(amount) <= 0 ||
                parseFloat(amount) > parseFloat(maxAmount) ||
                needsApproval ||
                txStatus !== "idle" ||
                (stakeMode === "lp" && deposit.isPending) ||
                (stakeMode === "eth" && (zapDeposit.isPending || !zapCalculation?.isValid))
              }
              className="w-full font-mono font-bold tracking-wide text-lg py-4 hover:scale-105 transition-all duration-200 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary shadow-lg disabled:opacity-50 !text-background dark:!text-background hover:!text-background dark:hover:!text-background"
            >
              {txStatus === "pending" || txStatus === "confirming"
                ? txStatus === "pending"
                  ? `[${t("common.submitting")}]`
                  : `[${t("common.confirming")}]`
                : (stakeMode === "lp" && deposit.isPending) || (stakeMode === "eth" && zapDeposit.isPending)
                  ? `[${t("common.staking")}...]`
                  : stakeMode === "eth"
                    ? `[${t("common.zap_and_stake")}]`
                    : `[${t("common.stake")}]`}
            </Button>
          </div>

          {/* Transaction Monitoring */}
          {txStatus !== "idle" && (
            <div
              className={cn(
                "border rounded-lg p-4 transition-all duration-300",
                txStatus === "success"
                  ? "bg-green-500/10 border-green-500/30"
                  : txStatus === "error"
                    ? "bg-red-500/10 border-red-500/30"
                    : "bg-primary/10 border-primary/30",
              )}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-2">
                  {txStatus === "pending" && (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
                      <span className="font-mono font-bold text-primary">[{t("common.status_pending")}]</span>
                    </>
                  )}
                  {txStatus === "confirming" && (
                    <>
                      <div className="animate-pulse h-4 w-4 bg-yellow-500 rounded-full"></div>
                      <span className="font-mono font-bold text-yellow-500">[{t("common.status_confirming")}]</span>
                    </>
                  )}
                  {txStatus === "success" && (
                    <>
                      <div className="h-4 w-4 bg-green-500 rounded-full"></div>
                      <span className="font-mono font-bold text-green-500">[{t("common.status_success")}]</span>
                    </>
                  )}
                  {txStatus === "error" && (
                    <>
                      <div className="h-4 w-4 bg-red-500 rounded-full"></div>
                      <span className="font-mono font-bold text-red-500">[{t("common.status_error")}]</span>
                    </>
                  )}
                </div>

                {txHash && (
                  <div className="text-center">
                    <a
                      href={`https://etherscan.io/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-background/50 border border-primary/20 rounded font-mono text-xs hover:bg-primary/10 transition-colors duration-200"
                    >
                      <span className="text-muted-foreground">{t("common.tx_label")}:</span>
                      <span className="text-primary font-bold">
                        {txHash.slice(0, 6)}...{txHash.slice(-4)}
                      </span>
                      <span className="text-muted-foreground">{t("common.external_link")}</span>
                    </a>
                  </div>
                )}

                {txError && (
                  <div className="text-center">
                    <p className="text-sm text-red-400 font-mono break-words">{txError}</p>
                  </div>
                )}

                {txStatus === "success" && (
                  <div className="text-center">
                    <p className="text-sm text-green-400 font-mono">
                      {stakeMode === "eth"
                        ? t("common.eth_zapped_staked_success")
                        : t("common.lp_tokens_staked_success")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Display */}
          {(deposit.error || zapDeposit.error || setOperatorApproval.error) && txStatus === "idle" && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <div className="text-sm text-red-400 text-center font-mono break-words">
                [ERROR]: {deposit.error?.message || zapDeposit.error?.message || setOperatorApproval.error?.message}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
