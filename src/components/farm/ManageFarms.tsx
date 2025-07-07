import {
  useActiveIncentiveStreams,
  useUserIncentivePositions,
} from "@/hooks/use-incentive-streams";
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
  const { data: activeStreams } = useActiveIncentiveStreams();
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
      <div className="bg-gradient-to-r from-background/50 to-background/80 border border-primary/30 rounded-lg p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="font-mono font-bold text-base sm:text-lg uppercase tracking-wider bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              {t("common.your_positions")}
            </h3>
            <div className="bg-primary/20 border border-primary/40 px-3 py-1 rounded">
              <span className="text-primary font-mono text-sm font-bold">
                ({userPositions?.length || 0})
              </span>
            </div>
          </div>
          {address && (
            <div className="hidden sm:block text-xs text-muted-foreground font-mono">
              {address.slice(0, 6)}...{address.slice(-4)}
            </div>
          )}
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
        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {userPositions.map((position) => {
            const stream = activeStreams?.find(
              (s) => s.chefId === position.chefId,
            );
            const lpToken = tokens.find((t) => t.poolId === stream?.lpId);

            if (!stream) return null;

            return (
              <div key={position.chefId.toString()} className="group">
                <ErrorBoundary fallback={<div>Error</div>}>
                  <div className="bg-gradient-to-br from-background/80 to-background/60 border border-primary/30 rounded-lg p-1 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-300">
                    <IncentiveStreamCard
                      stream={stream}
                      userPosition={position}
                      showUserActions={false}
                    />
                    <div className="p-4 border-t border-primary/20 bg-background/50">
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
                            disabled={position.pendingRewards === 0n || harvestingId === position.chefId}
                            className="font-mono font-bold tracking-wide hover:scale-105 transition-transform min-h-[44px]"
                          >
                            {harvestingId === position.chefId 
                              ? `[${t("common.harvesting")}...]`
                              : `[${t("common.harvest")}]`
                            }
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
              <p className="text-sm mt-3">{t("common.no_positions_description")}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
