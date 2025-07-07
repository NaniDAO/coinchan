import {
  useIncentiveStreams,
  useUserIncentivePositions,
} from "@/hooks/use-incentive-streams";
import { cn, formatBalance } from "@/lib/utils";
import { formatEther } from "viem";
import { useTranslation } from "react-i18next";
import { FarmGridSkeleton } from "../FarmLoadingStates";
import { ErrorBoundary } from "../ErrorBoundary";
import { IncentiveStreamCard } from "../IncentiveStreamCard";
import { FarmStakeDialog } from "../FarmStakeDialog";
import { Button } from "../ui/button";
import { FarmUnstakeDialog } from "../FarmUnstakeDialog";
import { useAccount } from "wagmi";
import { useAllCoins } from "@/hooks/metadata/use-all-coins";
import { useZChefActions } from "@/hooks/use-zchef-contract";
import { useState } from "react";

export const ManageFarms = () => {
  const { t } = useTranslation();

  const { address } = useAccount();

  const { tokens } = useAllCoins();
  const { data: allStreams } = useIncentiveStreams();
  const { data: userPositions, isLoading: isLoadingPositions } =
    useUserIncentivePositions();
  const { harvest } = useZChefActions();

  const [harvestingId, setHarvestingId] = useState<bigint | null>(null);

  const handleHarvest = async (chefId: bigint) => {
    try {
      setHarvestingId(chefId);
      await harvest.mutateAsync({ chefId });
    } catch (error) {
      console.error("Harvest failed:", error);
    } finally {
      setHarvestingId(null);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="rounded-lg p-4 backdrop-blur-sm mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="font-mono font-bold text-sm sm:text-base uppercase tracking-wider bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              {t("common.your_positions")}
            </h3>
            <div
              className={cn(
                "border border-muted px-2 py-1",
                userPositions && userPositions.length > 0 && "animate-pulse",
              )}
            >
              <span className="text-primary font-mono text-sm font-bold">
                ({userPositions?.length || 0})
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {userPositions && userPositions.length > 0 && (
              <div className="hidden sm:flex items-center gap-4">
                <div className="text-xs font-mono">
                  <span className="text-muted-foreground">
                    {t("common.total_rewards")}:
                  </span>
                  <span className="text-primary font-bold ml-1">
                    {formatBalance(
                      formatEther(
                        userPositions.reduce(
                          (acc, p) => acc + (p.pendingRewards || 0n),
                          0n,
                        ),
                      ),
                      "",
                    )}
                  </span>
                </div>
                <div className="text-xs font-mono">
                  <span className="text-muted-foreground">
                    {t("common.active_farms")}:
                  </span>
                  <span className="text-primary font-bold ml-1">
                    {userPositions.filter((p) => p.shares > 0n).length}
                  </span>
                </div>
              </div>
            )}
            {address && (
              <div className="text-xs text-muted-foreground font-mono border-l border-primary/20 pl-4">
                {address.slice(0, 6)}...{address.slice(-4)}
              </div>
            )}
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
      </div>

      {!address ? (
        <div className="text-center py-12 sm:py-16">
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-dashed border-primary/50 rounded-xl p-8 backdrop-blur-sm">
            <div className="text-foreground space-y-4">
              <div className="text-4xl sm:text-5xl text-primary opacity-40">
                ☉
              </div>
              <p className="text-xl font-bold text-primary">
                [ {t("common.auth_required")} ]
              </p>
              <p className="text-sm mt-3">
                {t("common.connect_wallet_to_view_positions")}
              </p>
            </div>
          </div>
        </div>
      ) : isLoadingPositions ? (
        <FarmGridSkeleton count={3} />
      ) : userPositions && userPositions.length > 0 ? (
        <div className="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {userPositions.map((position) => {
            const stream = allStreams?.find(
              (s) => BigInt(s.chefId) === BigInt(position.chefId),
            );
            const lpToken = tokens.find((t) => t.poolId === stream?.lpId);
            console.log("User Position Map:", {
              position,
              allStreams,
              stream,
              lpToken,
            });
            if (!stream) return null;

            return (
              <div key={position.chefId.toString()} className="group">
                <ErrorBoundary fallback={<div>Error</div>}>
                  <div className="bg-gradient-to-br from-background/80 to-background/60 border-2 border-primary/40 rounded-lg p-1 backdrop-blur-sm shadow-lg hover:shadow-2xl hover:border-primary transition-all duration-300 relative overflow-hidden group">
                    {/* Position indicator */}
                    <div className="absolute top-2 right-2 z-20 px-2 py-1 bg-primary/20 border border-primary/40 rounded text-xs font-mono font-bold text-primary">
                      <span className="animate-pulse">🌾</span> STAKED
                    </div>
                    <IncentiveStreamCard stream={stream} />
                    <div className="p-4 border-t border-primary/20 bg-background/50">
                      {/* Pending Rewards Display */}
                      {position.pendingRewards > 0n && (
                        <div className="mb-3 p-3 bg-gradient-to-r from-green-500/10 to-green-500/5 border border-green-500/30 rounded-lg">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-mono text-green-600 dark:text-green-400">
                              {t("common.pending_rewards")}:
                            </span>
                            <span className="font-mono font-bold text-green-600 dark:text-green-400">
                              {formatBalance(
                                formatEther(position.pendingRewards),
                                stream.rewardCoin?.symbol,
                              )}
                            </span>
                          </div>
                        </div>
                      )}
                      <div className="flex flex-col gap-3">
                        {lpToken && (
                          <FarmStakeDialog
                            stream={stream}
                            lpToken={lpToken}
                            trigger={
                              <Button
                                size="default"
                                className="w-full font-mono font-bold tracking-wide hover:scale-105 transition-transform min-h-[44px]"
                              >
                                [{t("common.stake_more")}]
                              </Button>
                            }
                          />
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          <Button
                            size="default"
                            variant="outline"
                            onClick={() => handleHarvest(position.chefId)}
                            disabled={
                              position.pendingRewards === 0n ||
                              harvestingId === position.chefId
                            }
                            className="font-mono font-bold tracking-wide hover:scale-105 transition-transform min-h-[44px]"
                          >
                            {harvestingId === position.chefId
                              ? `[${t("common.harvesting")}...]`
                              : `[${t("common.harvest")}]`}
                          </Button>
                          {userPositions && (
                            <FarmUnstakeDialog
                              stream={stream}
                              userPosition={position}
                              trigger={
                                <Button
                                  size="default"
                                  variant="outline"
                                  className="font-mono font-bold tracking-wide hover:scale-105 transition-transform min-h-[44px]"
                                >
                                  [{t("common.unstake")}]
                                </Button>
                              }
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </ErrorBoundary>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 sm:py-16">
          <div className="bg-gradient-to-br from-muted/20 to-muted/5 border-2 border-dashed border-muted/40 rounded-xl p-8 backdrop-blur-sm">
            <div className="text-muted-foreground space-y-4">
              <div className="text-4xl sm:text-5xl opacity-20">○</div>
              <p className="text-xl font-bold text-muted-foreground">
                [ {t("common.no_positions_found")} ]
              </p>
              <p className="text-sm mt-3">
                {t("common.no_positions_description")}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
