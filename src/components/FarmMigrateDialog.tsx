import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatImageURL } from "@/hooks/metadata";
import type { IncentiveStream } from "@/hooks/use-incentive-streams";
import { useActiveIncentiveStreams } from "@/hooks/use-incentive-streams";
import {
  useZChefActions,
  useZChefPendingReward,
  useZChefUserBalance,
} from "@/hooks/use-zchef-contract";
import { useCombinedApy } from "@/hooks/use-combined-apy";
import type { TokenMeta } from "@/lib/coins";
import { useTranslation } from "react-i18next";
import { isUserRejectionError } from "@/lib/errors";
import { cn, formatBalance } from "@/lib/utils";
import { useState, useMemo, useEffect } from "react";
import { formatEther, parseUnits } from "viem";
import { usePublicClient } from "wagmi";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";

interface FarmMigrateDialogProps {
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


interface SortedPoolListProps {
  streams: IncentiveStream[];
  lpToken: TokenMeta;
  onSelect: (chefId: string) => void;
}

function SortedPoolList({ streams, lpToken, onSelect }: SortedPoolListProps) {
  const [streamApys, setStreamApys] = useState<Record<string, number>>({});
  const [sortedStreams, setSortedStreams] = useState<IncentiveStream[]>(streams);

  // Update sorted streams when APY data changes
  useEffect(() => {
    const streamsWithApys = streams.map(stream => ({
      stream,
      apy: streamApys[stream.chefId.toString()] || 0
    }));

    // Sort by APY descending, then by total shares descending as tiebreaker
    const sorted = streamsWithApys.sort((a, b) => {
      if (a.apy !== b.apy) {
        return b.apy - a.apy; // Higher APY first
      }
      // If APY is the same, sort by total shares (more established pools first)
      return Number(b.stream.totalShares) - Number(a.stream.totalShares);
    });

    setSortedStreams(sorted.map(item => item.stream));
  }, [streams, streamApys]);

  return (
    <>
      {sortedStreams.map((targetStream: IncentiveStream) => (
        <PoolOptionWithApyTracking
          key={targetStream.chefId.toString()}
          targetStream={targetStream}
          lpToken={lpToken}
          onSelect={() => onSelect(targetStream.chefId.toString())}
          onApyCalculated={(apy) => {
            setStreamApys(prev => ({
              ...prev,
              [targetStream.chefId.toString()]: apy
            }));
          }}
        />
      ))}
    </>
  );
}

interface PoolOptionWithApyTrackingProps {
  targetStream: IncentiveStream;
  lpToken: TokenMeta;
  onSelect: () => void;
  onApyCalculated: (apy: number) => void;
}

function PoolOptionWithApyTracking({ targetStream, lpToken, onSelect, onApyCalculated }: PoolOptionWithApyTrackingProps) {
  const { t } = useTranslation();
  const combinedApyData = useCombinedApy({
    stream: targetStream,
    lpToken,
    enabled: true,
  });

  // Report APY when it's calculated
  useEffect(() => {
    if (!combinedApyData.isLoading && combinedApyData.totalApy !== undefined) {
      onApyCalculated(combinedApyData.totalApy);
    }
  }, [combinedApyData.isLoading, combinedApyData.totalApy, onApyCalculated]);

  const formatApy = (apy: number) => {
    if (apy === 0) return "0%";
    if (apy < 0.01) return "<0.01%";
    return `${apy.toFixed(2)}%`;
  };

  return (
    <DropdownMenuItem onClick={onSelect} className="cursor-pointer">
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          {targetStream.rewardCoin?.imageUrl && (
            <img
              src={formatImageURL(targetStream.rewardCoin.imageUrl)}
              alt={targetStream.rewardCoin.symbol}
              className="w-4 h-4 rounded-full"
            />
          )}
          <div className="flex flex-col">
            <span className="font-mono text-sm font-bold">
              {targetStream.rewardCoin?.symbol || t("common.unknown")}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {targetStream.totalShares > 0n ? 
                <span className="text-green-600">
                  🟢 {formatBalance(formatEther(targetStream.totalShares), "LP")} total staked
                </span> : 
                <span className="text-orange-500">
                  🟡 {t("common.no_stakes")} - new farm
                </span>
              }
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-sm font-bold text-green-600">
            {combinedApyData.isLoading ? "..." : formatApy(combinedApyData.totalApy)}
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            APY
          </div>
        </div>
      </div>
    </DropdownMenuItem>
  );
}

interface SelectedPoolApyProps {
  targetStream: IncentiveStream;
  lpToken: TokenMeta;
}

function SelectedPoolApy({ targetStream, lpToken }: SelectedPoolApyProps) {
  const combinedApyData = useCombinedApy({
    stream: targetStream,
    lpToken,
    enabled: true,
  });

  const formatApy = (apy: number) => {
    if (apy === 0) return "0%";
    if (apy < 0.01) return "<0.01%";
    return `${apy.toFixed(2)}%`;
  };

  return (
    <span className="text-green-600 font-bold">
      {combinedApyData.isLoading ? "..." : formatApy(combinedApyData.totalApy)}
    </span>
  );
}

interface SelectedPoolDetailsProps {
  targetStream: IncentiveStream;
  lpToken: TokenMeta;
}

function SelectedPoolDetails({ targetStream, lpToken }: SelectedPoolDetailsProps) {
  const { t } = useTranslation();
  const combinedApyData = useCombinedApy({
    stream: targetStream,
    lpToken,
    enabled: true,
  });

  const formatApy = (apy: number) => {
    if (apy === 0) return "0%";
    if (apy < 0.01) return "<0.01%";
    return `${apy.toFixed(2)}%`;
  };

  return (
    <div className="bg-background/30 border border-primary/20 rounded p-3">
      <div className="space-y-2 text-sm font-mono">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("common.reward_token")}:</span>
          <span className="text-primary font-bold">{targetStream.rewardCoin?.symbol}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">{t("common.total_staked")}:</span>
          <div className="text-right">
            <span className="text-primary font-bold">
              {targetStream.totalShares ? formatBalance(formatEther(targetStream.totalShares), "LP") : "0 LP"}
            </span>
            {targetStream.totalShares > 0n && (
              <div className="text-xs text-green-600 font-mono">
                ✓ Active Farm
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("common.total_apy")}:</span>
          <span className="text-primary font-bold text-green-600">
            {combinedApyData.isLoading ? "..." : formatApy(combinedApyData.totalApy)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("common.ends_in")}:</span>
          <span className="text-primary font-bold">
            {(() => {
              const now = Math.floor(Date.now() / 1000);
              const timeLeft = Number(targetStream.endTime) - now;
              if (timeLeft <= 0) return t("common.ended");
              const days = Math.floor(timeLeft / 86400);
              return days > 0 ? `${days} ${t("common.days")}` : t("common.less_than_day");
            })()}
          </span>
        </div>
      </div>
    </div>
  );
}

export function FarmMigrateDialog({
  stream,
  lpToken,
  userPosition,
  trigger,
  onSuccess,
}: FarmMigrateDialogProps) {
  const { t } = useTranslation();
  const publicClient = usePublicClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [selectedTargetChefId, setSelectedTargetChefId] = useState<string>("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<
    "idle" | "pending" | "confirming" | "success" | "error"
  >("idle");
  const [txError, setTxError] = useState<string | null>(null);

  const { migrate } = useZChefActions();

  // Get all active incentive streams for the same LP token
  const { data: allStreams = [] } = useActiveIncentiveStreams();
  
  // Filter to get compatible target streams (same lpId, excluding current stream)
  const compatibleStreams = useMemo(() => {
    const filtered = allStreams.filter(
      (s: IncentiveStream) => {
        const sameLpId = s.lpId.toString() === stream.lpId.toString(); // Compare as strings to handle BigInt
        const differentChef = s.chefId.toString() !== stream.chefId.toString();
        const isActive = s.status === "ACTIVE";
        const notEnded = Number(s.endTime) > Math.floor(Date.now() / 1000);
        
        return sameLpId && differentChef && isActive && notEnded;
      }
    );
    
    // Note: We'll sort by APY in a separate component since we need to calculate APY for each stream
    return filtered;
  }, [allStreams, stream.lpId, stream.chefId]);

  // Get the selected target stream
  const targetStream = useMemo(() => {
    return compatibleStreams.find((s: IncentiveStream) => s.chefId.toString() === selectedTargetChefId);
  }, [compatibleStreams, selectedTargetChefId]);

  // Get real-time pending rewards from contract
  const { data: onchainPendingRewards } = useZChefPendingReward(stream.chefId);
  const actualPendingRewards = onchainPendingRewards ?? userPosition.pendingRewards;

  // Get real-time user balance from contract
  const { data: onchainUserBalance } = useZChefUserBalance(stream.chefId);
  const actualUserShares = onchainUserBalance ?? userPosition.shares;

  const maxAmount = formatEther(actualUserShares);

  const handleMigrate = async () => {
    if (!amount || Number.parseFloat(amount) <= 0 || !selectedTargetChefId) return;

    try {
      setTxStatus("pending");
      setTxError(null);

      const sharesBigInt = parseUnits(amount, 18); // Shares are always 1:1 with LP tokens (18 decimals)
      const hash = await migrate.mutateAsync({
        fromChefId: stream.chefId,
        toChefId: BigInt(selectedTargetChefId),
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

        // Reset form and close after success
        setTimeout(() => {
          setAmount("");
          setSelectedTargetChefId("");
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
      } else {
        console.error("Migrate failed:", error);
        setTxStatus("error");
        setTxError(error?.message || t("common.migration_failed"));
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
      <DialogContent className="sm:max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto bg-card text-card-foreground border-2 border-border shadow-[4px_4px_0_var(--border)]">
        <DialogHeader className="sr-only">
          <DialogTitle>Migrate Position</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Info Banner */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <div className="text-blue-500 text-sm">📊</div>
              <div className="text-blue-600 font-mono text-sm leading-relaxed">
                {t("common.farm_activity_info")}
              </div>
            </div>
          </div>
          
          {/* Current Pool Information */}
          <div className="border border-primary/30 rounded-lg p-4">
            <h3 className="font-mono font-bold text-base text-primary mb-3 uppercase tracking-wider">
              [{t("common.your_current_position")}]
            </h3>
            <div className="flex items-center gap-3 mb-4">
              {lpToken?.imageUrl && (
                <img
                  src={formatImageURL(lpToken.imageUrl)}
                  alt={lpToken.symbol}
                  className="w-8 h-8 rounded-full border-2 border-primary/40"
                />
              )}
              <div>
                <h4 className="font-mono font-bold text-lg text-foreground break-all">
                  {lpToken?.symbol || `Pool ${stream.lpId}`}
                </h4>
                <p className="text-xs text-muted-foreground font-mono">
                  {t("common.lp_token_pool")}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-background/30 border border-primary/20 rounded p-3">
                <p className="text-muted-foreground font-mono text-xs">
                  👤 {t("common.your_staked_amount")}
                </p>
                <p className="font-mono font-bold text-primary">
                  {formatBalance(maxAmount, "LP")}
                </p>
              </div>
              <div className="bg-green-500/10 border border-green-500/30 rounded p-3">
                <p className="text-green-600 font-mono text-xs">
                  {t("common.pending_rewards")}
                </p>
                <p className="font-mono font-bold text-green-500">
                  {Number.parseFloat(formatEther(actualPendingRewards)).toFixed(6)}{" "}
                  {stream.rewardCoin?.symbol}
                </p>
              </div>
            </div>
          </div>

          {/* Target Pool Selection */}
          <div className="space-y-3">
            <Label className="font-mono font-bold text-primary uppercase tracking-wide">
              <span className="text-muted-foreground">&gt;</span>{" "}
              {t("common.select_target_pool")}
            </Label>
            
            {compatibleStreams.length === 0 ? (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-4">
                <p className="text-yellow-600 font-mono text-sm">
                  {t("common.no_compatible_pools")}
                </p>
              </div>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between font-mono bg-background/50 border-primary/30 focus:border-primary/60"
                  >
                    {selectedTargetChefId ? (
                      <div className="flex items-center justify-between w-full">
                        <span>
                          {compatibleStreams.find((s: IncentiveStream) => s.chefId.toString() === selectedTargetChefId)?.rewardCoin?.symbol || "Unknown"}
                        </span>
                        {targetStream && (
                          <SelectedPoolApy targetStream={targetStream} lpToken={lpToken} />
                        )}
                      </div>
                    ) : (
                      t("common.select_pool")
                    )}
                    <span className="text-muted-foreground ml-2">▼</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-full min-w-[400px]">
                  <SortedPoolList
                    streams={compatibleStreams}
                    lpToken={lpToken}
                    onSelect={setSelectedTargetChefId}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Show selected target pool details */}
            {targetStream && (
              <SelectedPoolDetails 
                targetStream={targetStream} 
                lpToken={lpToken}
              />
            )}
          </div>

          {/* Amount Input */}
          <div className="space-y-3">
            <Label
              htmlFor="amount"
              className="font-mono font-bold text-primary uppercase tracking-wide"
            >
              <span className="text-muted-foreground">&gt;</span>{" "}
              {t("common.amount_to_migrate")}
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
                disabled={!selectedTargetChefId}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleMaxClick}
                disabled={Number.parseFloat(maxAmount) === 0 || !selectedTargetChefId}
                className="font-mono font-bold tracking-wide border-primary/40 hover:border-primary hover:bg-primary/20 px-4 !text-foreground dark:!text-foreground hover:!text-foreground dark:hover:!text-foreground"
              >
                {t("common.max")}
              </Button>
            </div>
            <div className="bg-background/30 border border-primary/20 rounded p-3">
              <div className="flex justify-between text-sm font-mono">
                <span className="text-muted-foreground">
                  {t("common.available")}:
                </span>
                <span className="text-primary font-bold">
                  {formatBalance(maxAmount, `${lpToken?.symbol} LP`)}
                </span>
              </div>
            </div>
          </div>

          {/* Migration Info */}
          <div className="bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5 border border-primary/30 rounded-lg p-4">
            <p className="font-mono font-bold mb-3 text-primary text-sm">
              [{t("common.migration_info")}]
            </p>
            <ul className="space-y-2 text-sm font-mono text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span>{t("common.pending_rewards_claimed_automatically")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span>{t("common.lp_tokens_moved_directly")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span>{t("common.no_unstaking_required")}</span>
              </li>
            </ul>
          </div>

          {/* Action Button */}
          <div className="space-y-4">
            <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>

            <Button
              onClick={handleMigrate}
              disabled={
                !amount ||
                Number.parseFloat(amount) <= 0 ||
                Number.parseFloat(amount) > Number.parseFloat(maxAmount) ||
                !selectedTargetChefId ||
                txStatus !== "idle" ||
                migrate.isPending
              }
              className="w-full font-mono font-bold tracking-wide text-lg py-4 hover:scale-105 transition-all duration-200 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary shadow-lg disabled:opacity-50 !text-background dark:!text-background hover:!text-background dark:hover:!text-background"
            >
              {txStatus === "pending" || txStatus === "confirming"
                ? txStatus === "pending"
                  ? `[${t("common.submitting")}]`
                  : `[${t("common.confirming")}]`
                : migrate.isPending
                  ? `[${t("common.migrating")}...]`
                  : `[${t("common.migrate")}]`}
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
                      <span className="font-mono font-bold text-primary">
                        [{t("common.status_pending")}]
                      </span>
                    </>
                  )}
                  {txStatus === "confirming" && (
                    <>
                      <div className="animate-pulse h-4 w-4 bg-yellow-500 rounded-full"></div>
                      <span className="font-mono font-bold text-yellow-500">
                        [{t("common.status_confirming")}]
                      </span>
                    </>
                  )}
                  {txStatus === "success" && (
                    <>
                      <div className="h-4 w-4 bg-green-500 rounded-full"></div>
                      <span className="font-mono font-bold text-green-500">
                        [{t("common.status_success")}]
                      </span>
                    </>
                  )}
                  {txStatus === "error" && (
                    <>
                      <div className="h-4 w-4 bg-red-500 rounded-full"></div>
                      <span className="font-mono font-bold text-red-500">
                        [{t("common.status_error")}]
                      </span>
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
                      <span className="text-muted-foreground">
                        {t("common.tx_label")}:
                      </span>
                      <span className="text-primary font-bold">
                        {txHash.slice(0, 6)}...{txHash.slice(-4)}
                      </span>
                      <span className="text-muted-foreground">
                        {t("common.external_link")}
                      </span>
                    </a>
                  </div>
                )}

                {txError && (
                  <div className="text-center">
                    <p className="text-sm text-red-400 font-mono break-words">
                      {txError}
                    </p>
                  </div>
                )}

                {txStatus === "success" && (
                  <div className="text-center">
                    <p className="text-sm text-green-400 font-mono">
                      {t("common.position_migrated_successfully")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Display */}
          {migrate.error &&
            txStatus === "idle" &&
            !isUserRejectionError(migrate.error) && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <div className="text-sm text-red-400 text-center font-mono break-words">
                  [ERROR]: {migrate.error.message}
                </div>
              </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}