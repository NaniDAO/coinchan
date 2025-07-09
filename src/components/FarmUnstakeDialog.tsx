import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatImageURL } from "@/hooks/metadata";
import type { IncentiveStream } from "@/hooks/use-incentive-streams";
import { useZChefActions, useZChefPendingReward, useZChefUserBalance } from "@/hooks/use-zchef-contract";
import type { TokenMeta } from "@/lib/coins";
import { isUserRejectionError } from "@/lib/errors";
import { cn, formatBalance } from "@/lib/utils";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, parseUnits } from "viem";
import { usePublicClient } from "wagmi";

interface FarmUnstakeDialogProps {
  stream: IncentiveStream;
  lpToken: TokenMeta;
  userPosition: {
    shares: bigint;
    pendingRewards: bigint;
    totalDeposited: bigint;
    totalHarvested: bigint;
  };
  trigger: React.ReactNode;
  onSuccess?: () => void;
}

export function FarmUnstakeDialog({ stream, lpToken, userPosition, trigger, onSuccess }: FarmUnstakeDialogProps) {
  const { t } = useTranslation();
  const publicClient = usePublicClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "confirming" | "success" | "error">("idle");
  const [txError, setTxError] = useState<string | null>(null);

  const { withdraw } = useZChefActions();

  // Get real-time pending rewards from contract
  const { data: onchainPendingRewards } = useZChefPendingReward(stream.chefId);
  const actualPendingRewards = onchainPendingRewards ?? userPosition.pendingRewards;

  // Get real-time user balance from contract
  const { data: onchainUserBalance } = useZChefUserBalance(stream.chefId);
  const actualUserShares = onchainUserBalance ?? userPosition.shares;

  const maxAmount = formatEther(actualUserShares);
  // const rewardTokenDecimals = stream.rewardCoin?.decimals || 18;

  const handleUnstake = async () => {
    if (!amount || Number.parseFloat(amount) <= 0) return;

    try {
      setTxStatus("pending");
      setTxError(null);

      const sharesBigInt = parseUnits(amount, 18); // Shares are always 1:1 with LP tokens (18 decimals)
      const hash = await withdraw.mutateAsync({
        chefId: stream.chefId,
        shares: sharesBigInt,
      });

      setTxHash(hash);
      setTxStatus("confirming");

      // Wait for confirmation
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({
          hash: hash as `0x${string}`,
        });
        setTxStatus("success");

        // Show success notification
        console.log(
          `🎉 Unstake successful! Amount: ${amount} shares, Pool: ${lpToken.symbol}, Rewards: ${formatEther(actualPendingRewards)} ${stream.rewardCoin?.symbol}, TX: ${hash}`,
        );

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
        console.error("Unstake failed:", error);
        setTxStatus("error");
        setTxError(error?.message || "Unstaking failed");
        setTimeout(() => {
          setTxStatus("idle");
          setTxError(null);
        }, 5000);
      }
    }
  };

  const handleMaxClick = () => {
    setAmount(maxAmount);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl w-[95vw] max-h-[90vh] overflow-y-auto bg-card text-card-foreground border-2 border-border shadow-[4px_4px_0_var(--border)]">
        <DialogHeader className="sr-only">
          <DialogTitle>Unstake</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Pool Information */}
          <div className="border border-muted p-4">
            <div className="flex items-center gap-3 mb-4">
              {lpToken?.imageUrl && (
                <img
                  src={formatImageURL(lpToken.imageUrl)}
                  alt={lpToken.symbol}
                  className="w-8 h-8 border border-muted"
                />
              )}
              <div>
                <h3 className="font-mono font-bold text-lg text-foreground break-all uppercase tracking-wider">
                  [{lpToken?.symbol ||
                    (() => {
                      const lpId = stream.lpId?.toString();
                      // LP IDs are always full uint, truncate for UI
                      return lpId && lpId.length > 12 ? `Pool ${lpId.slice(0, 6)}...${lpId.slice(-6)}` : `Pool ${lpId}`;
                    })()}]
                </h3>
                <p className="text-xs text-muted-foreground font-mono">{t("common.lp_token_pool")}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="border border-muted p-3">
                <p className="text-muted-foreground font-mono text-xs uppercase tracking-wider">[{t("common.reward_token")}]</p>
                <div className="flex items-center gap-2 mt-1">
                  {stream.rewardCoin?.imageUrl && (
                    <img
                      src={formatImageURL(stream.rewardCoin.imageUrl)}
                      alt={stream.rewardCoin.symbol}
                      className="w-5 h-5 border border-muted"
                    />
                  )}
                  <p className="font-mono font-bold text-foreground">{stream.rewardCoin?.symbol}</p>
                </div>
              </div>
              <div className="border border-green-700 p-3">
                <p className="text-green-700 font-mono text-xs uppercase tracking-wider">[{t("common.pending_rewards")}]</p>
                <p className="font-mono font-bold text-green-600">
                  {Number.parseFloat(formatEther(actualPendingRewards)).toFixed(6)} {stream.rewardCoin?.symbol}
                </p>
              </div>
            </div>
          </div>


          {/* Amount Input */}
          <div className="space-y-3">
            <Label htmlFor="amount" className="font-mono font-bold text-primary uppercase tracking-wide">
              <span className="text-muted-foreground">&gt;</span> {t("common.amount_to_unstake")}
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
                disabled={Number.parseFloat(maxAmount) === 0}
                className="font-mono font-bold tracking-wide border-primary/40 hover:border-primary hover:bg-primary/20 px-4 !text-foreground dark:!text-foreground hover:!text-foreground dark:hover:!text-foreground"
              >
                {t("common.max")}
              </Button>
            </div>
            <div className="border border-muted p-3">
              <div className="flex justify-between text-sm font-mono">
                <span className="text-muted-foreground">{t("common.staked")}:</span>
                <span className="text-foreground font-bold">{formatBalance(maxAmount, `${lpToken?.symbol} LP`)}</span>
              </div>
            </div>
          </div>

          {/* Unstake Preview */}
          {amount && Number.parseFloat(amount) > 0 && (
            <div className="border border-muted p-4">
              <h4 className="font-mono font-bold text-base text-muted-foreground mb-4 uppercase tracking-wider">[{t("common.transaction_preview")}]</h4>
              <div className="space-y-3">
                <div className="border border-muted p-3">
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-muted-foreground">{t("common.unstaking_amount")}:</span>
                    <span className="font-mono font-bold text-foreground text-lg">
                      {amount} {lpToken?.symbol} LP
                    </span>
                  </div>
                </div>
                <div className="border border-muted p-3">
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-muted-foreground">{t("common.rewards_to_claim")}:</span>
                    <span className="font-mono font-bold text-green-600 text-lg">
                      {Number.parseFloat(formatEther(actualPendingRewards)).toFixed(6)} {stream.rewardCoin?.symbol}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Information */}
          <div className="border border-muted p-4">
            <div className="flex items-start gap-3">
              <div className="text-muted-foreground text-xl">i</div>
              <div>
                <p className="font-mono font-bold text-muted-foreground text-sm uppercase tracking-wider">[{t("common.info")}]</p>
                <p className="text-sm text-muted-foreground font-mono mt-1">
                  {t("common.unstaking_will_claim_rewards")}
                </p>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="space-y-4">
  
            <Button
              onClick={handleUnstake}
              disabled={
                !amount ||
                Number.parseFloat(amount) <= 0 ||
                Number.parseFloat(amount) > Number.parseFloat(maxAmount) ||
                txStatus !== "idle" ||
                withdraw.isPending
              }
              className="w-full font-mono font-bold tracking-wide text-lg py-4 border border-red-600 bg-red-600 hover:bg-red-500 disabled:opacity-50 !text-white dark:!text-white hover:!text-white dark:hover:!text-white"
              variant="destructive"
            >
              {txStatus === "pending" || txStatus === "confirming"
                ? txStatus === "pending"
                  ? `[${t("common.submitting")}]`
                  : `[${t("common.confirming")}]`
                : withdraw.isPending
                  ? `[${t("common.unstaking")}...]`
                  : `[${t("common.unstake")}]`}
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
                    <p className="text-sm text-green-400 font-mono">{t("common.lp_unstaked_rewards_claimed")}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Display */}
          {withdraw.error && txStatus === "idle" && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <div className="text-sm text-red-400 text-center font-mono break-words">
                [ERROR]: {withdraw.error.message}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
