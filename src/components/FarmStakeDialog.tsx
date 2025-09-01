import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatImageURL } from "@/hooks/metadata";
import { useAllCoins } from "@/hooks/metadata/use-all-coins";
import type { IncentiveStream } from "@/hooks/use-incentive-streams";
import { useLpBalance } from "@/hooks/use-lp-balance";
import { useStreamValidation } from "@/hooks/use-stream-validation";
import { useZapCalculations } from "@/hooks/use-zap-calculations";
import { useZapDeposit } from "@/hooks/use-zap-deposit";
import { useZChefActions, useZChefUserBalance, useZChefPool } from "@/hooks/use-zchef-contract";
import { ETH_TOKEN, ENS_POOL_ID, WLFI_POOL_ID, type TokenMeta } from "@/lib/coins";
import { isUserRejectionError } from "@/lib/errors";
import { SINGLE_ETH_SLIPPAGE_BPS } from "@/lib/swap";
import { cn, formatBalance } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { usePublicClient } from "wagmi";
import { APRDisplay } from "./farm/APRDisplay";
import { ENSLogo } from "./icons/ENSLogo";

interface FarmStakeDialogProps {
  stream: IncentiveStream;
  lpToken: TokenMeta;
  trigger: React.ReactNode;
  onSuccess?: () => void;
}

type StakeMode = "lp" | "eth";

export function FarmStakeDialog({ stream, lpToken, trigger, onSuccess }: FarmStakeDialogProps) {
  const { t } = useTranslation();
  const publicClient = usePublicClient();
  const { tokens } = useAllCoins();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [stakeMode, setStakeMode] = useState<StakeMode>("lp");
  const [zapCalculation, setZapCalculation] = useState<any>(null);
  const [slippageBps] = useState(SINGLE_ETH_SLIPPAGE_BPS);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "confirming" | "success" | "error">("idle");
  const [txError, setTxError] = useState<string | null>(null);

  const { deposit } = useZChefActions();
  const { calculateZapAmounts } = useZapCalculations();
  const zapDeposit = useZapDeposit();
  const { validateStreamBeforeAction } = useStreamValidation();
  // Note: rewardPerSharePerYear is now handled in useCombinedApy hook

  // Get user's staked balance in this farm
  const { data: userStakedBalance } = useZChefUserBalance(stream.chefId);

  // Get real-time pool data including total staked
  const { data: poolData } = useZChefPool(stream.chefId);
  const totalStaked = poolData?.[7] ?? stream.totalShares ?? 0n;

  // Get actual LP token balance for this pool using the stream's LP ID
  const { balance: lpTokenBalance, isLoading: isLpBalanceLoading } = useLpBalance({
    lpToken,
    poolId: stream.lpId,
    enabled: stakeMode === "lp",
  });

  // Get ETH token data
  const ethToken = tokens.find((t) => t.id === null) || ETH_TOKEN;

  // Operator approval not needed for staking LP tokens

  const maxAmount =
    stakeMode === "lp"
      ? lpTokenBalance > 0n
        ? formatUnits(lpTokenBalance, 18) // LP tokens are always 18 decimals
        : "0"
      : ethToken.balance
        ? formatEther(ethToken.balance)
        : "0";

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
    if (stakeMode === "eth" && amount && Number.parseFloat(amount) > 0) {
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

  // Force LP mode for CULT pools
  useEffect(() => {
    if (lpToken?.symbol === "CULT" && stakeMode === "eth") {
      setStakeMode("lp");
    }
  }, [lpToken?.symbol, stakeMode]);

  // Reset state when modal opens or closes to prevent sizing issues
  useEffect(() => {
    if (!open) {
      // Reset all state when modal closes
      setAmount("");
      setZapCalculation(null);
      setTxHash(null);
      setTxError(null);
      setTxStatus("idle");
    }
  }, [open]);

  const handleStake = async () => {
    if (!amount || Number.parseFloat(amount) <= 0) return;

    // Validate stream before proceeding
    const validation = validateStreamBeforeAction(stream, "stake");
    if (!validation.canProceed) {
      setTxStatus("error");
      setTxError(validation.error || t("common.cannot_stake_at_this_time"));
      return;
    }

    try {
      setTxStatus("pending");
      setTxError(null);

      // No operator approval needed for staking LP tokens
      // Proceed directly with staking
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
          throw new Error(t("common.invalid_zap_calculation"));
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
        await publicClient.waitForTransactionReceipt({
          hash: hash as `0x${string}`,
        });
        setTxStatus("success");

        // Show success notification
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
      if (isUserRejectionError(error)) {
        // User rejected - silently reset state
        setTxStatus("idle");
      } else {
        console.error("Stake failed:", error);
        setTxStatus("error");
        setTxError(error?.message || t("common.staking_failed"));
        setTimeout(() => {
          setTxStatus("idle");
          setTxError(null);
        }, 5000);
      }
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl w-[95vw] min-h-0 max-h-[90vh] overflow-y-auto bg-card text-card-foreground border-2 border-border shadow-[4px_4px_0_var(--border)]">
        <DialogHeader className="sr-only">
          <DialogTitle>Stake</DialogTitle>
        </DialogHeader>

        <div key={stakeMode} className="space-y-6">
          {/* Pool Information */}
          <div className="border border-primary/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {BigInt(stream.lpId) === ENS_POOL_ID ? (
                  <div className="relative">
                    <ENSLogo className="w-8 h-8" />
                    <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-primary/30 to-transparent opacity-50 blur-sm"></div>
                  </div>
                ) : BigInt(stream.lpId) === WLFI_POOL_ID ? (
                  <div className="relative">
                    <img
                      src="/wlfi.png"
                      alt="WLFI"
                      className="w-8 h-8 rounded-full border-2 border-primary/40"
                    />
                    <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-primary/30 to-transparent opacity-50 blur-sm"></div>
                  </div>
                ) : lpToken?.imageUrl ? (
                  <div className="relative">
                    <img
                      src={formatImageURL(lpToken.imageUrl)}
                      alt={lpToken.symbol}
                      className="w-8 h-8 rounded-full border-2 border-primary/40"
                    />
                    <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-primary/30 to-transparent opacity-50 blur-sm"></div>
                  </div>
                ) : null}
                <div>
                  <h3 className="font-mono font-bold text-lg text-primary break-all">
                    {BigInt(stream.lpId) === ENS_POOL_ID
                      ? "ENS"
                      : BigInt(stream.lpId) === WLFI_POOL_ID
                      ? "WLFI"
                      : lpToken?.symbol ||
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
              <div
                className={cn(
                  "px-3 py-1 rounded text-xs font-mono font-bold",
                  stream.status === "ACTIVE"
                    ? "bg-green-500/10 text-green-500 border border-green-500/30"
                    : "bg-muted/10 text-muted-foreground border border-muted/30",
                )}
              >
                {stream.status || t("common.active").toUpperCase()}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="bg-background/30 border border-primary/20 rounded p-3">
                <p className="text-muted-foreground font-mono text-xs">{t("common.reward_token")}</p>
                <p className="font-mono font-bold text-primary">{stream.rewardCoin?.symbol}</p>
              </div>
              {lpToken && (
                <div className="bg-background/30 border border-primary/20 rounded p-3">
                  <p className="text-muted-foreground font-mono text-xs">{t("pool.liquidity")}</p>
                  <p className="font-mono font-bold text-primary">
                    {formatBalance(formatEther(lpToken.reserve0 || lpToken.liquidity || 0n), "ETH")}
                  </p>
                </div>
              )}
              {lpToken && lpToken.reserve1 ? (
                <div className="bg-background/30 border border-primary/20 rounded p-3">
                  <p className="text-muted-foreground font-mono text-xs">
                    {BigInt(stream.lpId) === ENS_POOL_ID ? "ENS" : BigInt(stream.lpId) === WLFI_POOL_ID ? "WLFI" : lpToken.symbol} {t("common.reserves")}
                  </p>
                  <p className="font-mono font-bold text-primary">
                    {formatBalance(
                      formatUnits(lpToken.reserve1, lpToken.decimals || 18),
                      BigInt(stream.lpId) === ENS_POOL_ID ? "ENS" : BigInt(stream.lpId) === WLFI_POOL_ID ? "WLFI" : lpToken.symbol,
                    )}
                  </p>
                </div>
              ) : null}
              <div className="bg-background/30 border border-primary/20 rounded p-3">
                <p className="text-muted-foreground font-mono text-xs">{t("common.total_staked")}</p>
                <p className="font-mono font-bold text-primary">{formatBalance(formatEther(totalStaked), "LP")}</p>
              </div>
            </div>
          </div>

          <APRDisplay stream={stream} lpToken={lpToken} shortView={false} />

          {/* User Position */}
          {userStakedBalance && userStakedBalance > 0n && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-mono uppercase">{t("common.your_stake")}</p>
                  <p className="font-mono font-bold text-green-500 text-lg mt-1">
                    {formatBalance(formatEther(userStakedBalance), "LP")}
                  </p>
                </div>
                <div className="text-xs text-green-500/80 font-mono">[{t("common.staked")}]</div>
              </div>
            </div>
          )}

          {/* Stake Mode Selection */}
          {/* Disable ETH zap for CULT pools */}
          {lpToken?.symbol === "CULT" ? (
            <div className="space-y-3">
              <Label className="font-mono font-bold text-primary uppercase tracking-wide">
                <span className="text-muted-foreground">&gt;</span> {t("common.stake_mode")}
              </Label>
              <div className="font-mono text-sm text-muted-foreground">
                [{t("common.lp_tokens")}] - ETH zap not available for CULT pools
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Label className="font-mono font-bold text-primary uppercase tracking-wide">
                <span className="text-muted-foreground">&gt;</span> {t("common.stake_mode")}
              </Label>
              <Tabs
                value={stakeMode}
                onValueChange={(value) => {
                  setStakeMode(value as StakeMode);
                  setAmount(""); // Clear amount when switching modes
                  setZapCalculation(null); // Clear zap calculation when switching modes
                }}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="lp" className="font-mono font-bold tracking-wide">
                    [{t("common.lp_tokens")}]
                  </TabsTrigger>
                  <TabsTrigger value="eth" className="font-mono font-bold tracking-wide">
                    [{t("common.eth_zap")}]
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}

          {/* Amount Input */}
          <div className="space-y-3">
            <Label htmlFor="amount" className="font-mono font-bold text-primary uppercase tracking-wide">
              <span className="text-muted-foreground">&gt;</span>{" "}
              {stakeMode === "lp" ? t("common.amount_to_stake") : t("common.eth_amount")}
            </Label>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                id="amount"
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
                onClick={handleMaxClick}
                disabled={Number.parseFloat(maxAmount) === 0}
                className="font-mono font-bold tracking-wide border-primary/40 hover:border-primary hover:bg-primary/20 px-4 sm:px-6 py-2 sm:py-1 !text-foreground dark:!text-foreground hover:!text-foreground dark:hover:!text-foreground"
              >
                {t("common.max")}
              </Button>
            </div>
            <div className="bg-background/30 border border-primary/20 rounded p-3">
              <div className="space-y-2 text-sm font-mono">
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                  <span className="text-muted-foreground">{t("common.available")}:</span>
                  <span className="text-primary font-bold break-all text-left sm:text-right">
                    {stakeMode === "lp" && isLpBalanceLoading ? (
                      <span className="animate-pulse">{t("common.loading_balance")}</span>
                    ) : (
                      formatBalance(maxAmount, stakeMode === "lp" ? "LP" : "ETH")
                    )}
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
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold">•</span>
                    <span className="text-xs opacity-75">{t("common.dust_refund_note")}</span>
                  </li>
                </ul>
              </div>
            )}
          </div>

          {/* ETH Zap Error Display */}
          {stakeMode === "eth" && zapCalculation && !zapCalculation.isValid && (
            <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
              <div className="text-sm text-red-400 font-mono">
                [ERROR]: {zapCalculation.error || t("common.zap_calculation_failed")}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-4">
            <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>

            <Button
              onClick={handleStake}
              disabled={
                !amount ||
                Number.parseFloat(amount) <= 0 ||
                Number.parseFloat(amount) > Number.parseFloat(maxAmount) ||
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
          {(deposit.error || zapDeposit.error) &&
            txStatus === "idle" &&
            !isUserRejectionError(deposit.error) &&
            !isUserRejectionError(zapDeposit.error) && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <div className="text-sm text-red-400 text-center font-mono break-words">
                  [ERROR]: {deposit.error?.message || zapDeposit.error?.message}
                </div>
              </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
