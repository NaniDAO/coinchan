import { useAllCoins } from "@/hooks/metadata/use-all-coins";
import { useIncentiveStreams, useUserIncentivePositions } from "@/hooks/use-incentive-streams";
import { useUserFarmPositionsFromContract } from "@/hooks/use-user-farm-positions";
import { useFarmsSummary } from "@/hooks/use-farms-summary";
import { useZChefActions } from "@/hooks/use-zchef-contract";
import { isUserRejectionError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useState, useMemo, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { useAccount } from "wagmi";
import { ErrorBoundary } from "../ErrorBoundary";
import { FarmGridSkeleton, FarmPositionSkeleton } from "../FarmLoadingStates";
import { FarmPositionCard } from "./FarmPositionCard";
import { JPYC_TOKEN, JPYC_POOL_ID, JPYC_FARM_CHEF_ID } from "@/lib/coins";

import { Button } from "../ui/button"; // already imported in FarmPositionCard

export const ManageFarms = () => {
  const { t } = useTranslation();
  const { address } = useAccount();

  const { tokens } = useAllCoins();
  const { data: allStreams } = useIncentiveStreams();
  const { data: indexerPositions, isLoading: isLoadingIndexer } = useUserIncentivePositions();
  const { data: contractPositions, isLoading: isLoadingContract } = useUserFarmPositionsFromContract();
  const { harvest } = useZChefActions();

  // Use contract positions as fallback if indexer returns empty
  const userPositions = useMemo(() => {
    if (indexerPositions && indexerPositions.length > 0) {
      return indexerPositions;
    }
    return contractPositions || [];
  }, [indexerPositions, contractPositions]);

  const isLoadingPositions = isLoadingIndexer && isLoadingContract;

  const relevantStreams = useMemo(() => {
    if (!allStreams || !userPositions) return undefined;
    return allStreams.filter((stream) => {
      const hasPosition = userPositions.some(
        (position) => BigInt(position.chefId) === BigInt(stream.chefId) && BigInt(position.shares) > 0n,
      );
      return hasPosition;
    });
  }, [allStreams, userPositions]);

  const { streamsWithRealTimeData } = useFarmsSummary(relevantStreams);

  const [harvestingId, setHarvestingId] = useState<bigint | null>(null);
  const [showExpired, setShowExpired] = useState(false);

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

  const currentTime = BigInt(Math.floor(Date.now() / 1000));

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="rounded-lg p-4 backdrop-blur-sm mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="font-mono font-bold text-sm sm:text-base uppercase tracking-wider text-primary">
              {t("common.your_positions")}
            </h3>
            <div
              className={cn(
                "border border-muted px-2 py-1",
                userPositions && userPositions.length > 0 && "animate-pulse",
              )}
            >
              <span className="text-primary font-mono text-sm font-bold">({userPositions?.length || 0})</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {userPositions && userPositions.length > 0 && (
              <div className="hidden sm:flex items-center gap-4">
                <div className="text-xs font-mono">
                  <span className="text-muted-foreground">{t("common.active_farms")}:</span>
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

      {/* Show Expired Toggle */}
      {userPositions && userPositions.length > 0 && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowExpired((prev) => !prev)}
            className="font-mono font-bold"
          >
            {showExpired ? "[ Hide Expired Farms ]" : "[ Show Expired Farms ]"}
          </Button>
        </div>
      )}

      {/* Content */}
      {!address ? (
        <div className="text-center py-12 sm:py-16">{/* connect wallet box */}</div>
      ) : isLoadingPositions ? (
        <FarmGridSkeleton count={3} />
      ) : userPositions && userPositions.length > 0 ? (
        <div className="grid gap-4 sm:gap-5 grid-cols-1 lg:grid-cols-2 will-change-transform">
          {userPositions
            .filter((position) => BigInt(position.shares) > 0n)
            .map((position) => {
              const stream =
                streamsWithRealTimeData?.find((s) => BigInt(s.chefId) === BigInt(position.chefId)) ||
                allStreams?.find((s) => BigInt(s.chefId) === BigInt(position.chefId));

              if (!stream) return null;

              const isExpired = stream.endTime <= currentTime;
              if (!showExpired && isExpired) return null;

              const lpToken = tokens.find((t) => {
                if (!stream) return false;
                if (t.poolId === BigInt(stream.lpId)) return true;
                if (t.symbol === "CULT" && BigInt(stream.lpId) === t.poolId) return true;
                if (t.symbol === "JPYC" && BigInt(stream.lpId) === t.poolId) return true;
                return false;
              }) || (BigInt(stream.lpId) === JPYC_POOL_ID || BigInt(stream.chefId) === JPYC_FARM_CHEF_ID ? JPYC_TOKEN : undefined);

              return (
                <div key={position.chefId.toString()} className="group min-h-[400px] lg:min-h-[450px]">
                  <ErrorBoundary fallback={<FarmPositionSkeleton />}>
                    <Suspense fallback={<FarmPositionSkeleton />}>
                      <FarmPositionCard
                        position={position}
                        stream={stream}
                        lpToken={lpToken}
                        onHarvest={handleHarvest}
                        isHarvesting={harvestingId === position.chefId}
                      />
                    </Suspense>
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
              <p className="text-xl font-bold text-muted-foreground">[ {t("common.no_positions_found")} ]</p>
              <p className="text-sm mt-3">{t("common.no_positions_description")}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
