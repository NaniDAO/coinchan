import { useAllCoins } from "@/hooks/metadata/use-all-coins";
import {
  useIncentiveStreams,
  useUserIncentivePositions,
} from "@/hooks/use-incentive-streams";
import { useZChefActions } from "@/hooks/use-zchef-contract";
import { isUserRejectionError } from "@/lib/errors";
import { cn, formatBalance } from "@/lib/utils";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import { ErrorBoundary } from "../ErrorBoundary";
import { FarmGridSkeleton } from "../FarmLoadingStates";
import { FarmPositionCard } from "./FarmPositionCard";

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
      if (!isUserRejectionError(error)) {
        console.error("Harvest failed:", error);
      }
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
                {/* @TODO */}
                {/* <div className="text-xs font-mono">
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
                </div> */}
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
        <div className="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 ">
          {userPositions.map((position) => {
            const stream = allStreams?.find(
              (s) => BigInt(s.chefId) === BigInt(position.chefId),
            );
            const lpToken = tokens.find((t) => t.poolId === stream?.lpId);

            if (!stream) return null;

            return (
              <div key={position.chefId.toString()} className="group">
                <ErrorBoundary fallback={<div>Error</div>}>
                  <FarmPositionCard
                    position={position}
                    stream={stream}
                    lpToken={lpToken}
                    onHarvest={handleHarvest}
                    isHarvesting={harvestingId === position.chefId}
                  />
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
