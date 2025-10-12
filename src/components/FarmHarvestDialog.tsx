import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatImageURL } from "@/hooks/metadata";
import type { IncentiveStream } from "@/hooks/use-incentive-streams";
import { useZChefActions, useZChefPendingReward } from "@/hooks/use-zchef-contract";
import type { TokenMeta } from "@/lib/coins";
import { isUserRejectionError } from "@/lib/errors";
import { cn, formatBalance } from "@/lib/utils";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatUnits } from "viem";
import { usePublicClient } from "wagmi";

interface FarmHarvestDialogProps {
  stream: IncentiveStream;
  lpToken: TokenMeta;
  trigger: React.ReactNode;
  onSuccess?: () => void;
}

export function FarmHarvestDialog({ stream, lpToken, trigger, onSuccess }: FarmHarvestDialogProps) {
  const { t } = useTranslation();
  const publicClient = usePublicClient();
  const [open, setOpen] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "confirming" | "success" | "error">("idle");
  const [txError, setTxError] = useState<string | null>(null);

  const { harvest } = useZChefActions();

  // Get real-time pending rewards from contract
  const { data: pendingRewards, refetch: refetchRewards } = useZChefPendingReward(stream.chefId);
  const rewardTokenDecimals = stream.rewardCoin?.decimals || 18;
  const formattedRewards = pendingRewards ? formatUnits(pendingRewards, rewardTokenDecimals) : "0";

  const handleHarvest = async () => {
    if (!pendingRewards || pendingRewards === 0n) return;

    try {
      setTxStatus("pending");
      setTxError(null);

      const hash = await harvest.mutateAsync({
        chefId: stream.chefId,
      });

      setTxHash(hash);
      setTxStatus("confirming");

      // Wait for confirmation
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({
          hash: hash as `0x${string}`,
        });
        setTxStatus("success");

        // Refetch rewards
        refetchRewards();

        // Reset form and close after success
        setTimeout(() => {
          setOpen(false);
          setTxStatus("idle");
          setTxHash(null);
          onSuccess?.();
        }, 3000);
      }
    } catch (error: any) {
      if (isUserRejectionError(error)) {
        // User rejected - silently reset state
        setTxStatus("idle");
        setTxHash(null);
      } else {
        console.error("Harvest failed:", error);
        setTxStatus("error");
        setTxError(error?.message || t("common.harvesting_failed"));
        setTimeout(() => {
          setTxStatus("idle");
          setTxError(null);
        }, 5000);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md w-[90vw] sm:w-full min-h-0 max-h-[85vh] overflow-y-auto bg-card text-card-foreground border-2 border-border shadow-[2px_2px_0_var(--border)] sm:shadow-[4px_4px_0_var(--border)]">
        <DialogHeader className="sr-only">
          <DialogTitle>{t("common.harvest_rewards")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Pool Information */}
          <div className="border border-primary/30 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              {lpToken?.imageUrl && (
                <img
                  src={formatImageURL(lpToken.imageUrl)}
                  alt={lpToken.symbol}
                  className="w-8 h-8 rounded-full border-2 border-primary/40"
                />
              )}
              <div>
                <h3 className="font-mono font-bold text-lg text-primary">{lpToken?.symbol || "LP"}</h3>
                <p className="text-xs text-muted-foreground font-mono">{t("common.farm_rewards")}</p>
              </div>
            </div>
          </div>

          {/* Pending Rewards Display */}
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6">
            <div className="text-center space-y-4">
              <p className="text-sm text-muted-foreground font-mono uppercase">{t("common.pending_rewards")}</p>
              <div className="flex items-center justify-center gap-3">
                {stream.rewardCoin?.imageUrl && (
                  <img
                    src={formatImageURL(stream.rewardCoin.imageUrl)}
                    alt={stream.rewardCoin.symbol}
                    className="w-10 h-10 rounded-full border-2 border-green-500/40"
                  />
                )}
                <p className="font-mono font-bold text-2xl text-green-500">
                  {formatBalance(formattedRewards, stream.rewardCoin?.symbol)}
                </p>
              </div>
              {!pendingRewards || pendingRewards === 0n ? (
                <p className="text-xs text-yellow-500 font-mono">{t("common.no_rewards_to_harvest")}</p>
              ) : null}
            </div>
          </div>

          {/* Transaction Status */}
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
                    <p className="text-sm text-green-400 font-mono">{t("common.rewards_harvested_successfully")}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Button */}
          <Button
            onClick={handleHarvest}
            disabled={!pendingRewards || pendingRewards === 0n || txStatus !== "idle" || harvest.isPending}
            className={cn(
              "w-full font-mono font-bold tracking-wide text-lg py-4 hover:scale-105 transition-all duration-200",
              "bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400",
              "shadow-lg disabled:opacity-50 !text-background",
            )}
          >
            [{t("common.harvest_rewards")}]
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
