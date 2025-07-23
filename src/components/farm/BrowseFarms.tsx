import { useAllCoins } from "@/hooks/metadata/use-all-coins";
import { useActiveIncentiveStreams } from "@/hooks/use-incentive-streams";
import { useFarmsSummary } from "@/hooks/use-farms-summary";
import { useReserves } from "@/hooks/use-reserves";
import { ETH_TOKEN, ENS_POOL_ID, type TokenMeta } from "@/lib/coins";
import { cn, formatBalance } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { formatEther } from "viem";
import { ErrorBoundary } from "../ErrorBoundary";
import { FarmGridSkeleton } from "../FarmLoadingStates";
import { IncentiveStreamCard } from "../IncentiveStreamCard";
import { StakingNotifications } from "./StakingNotifications";
import { FarmingGuide } from "./FarmingGuide";
import { useMemo, useState } from "react";
import { useAccount } from "wagmi";

const blacklistedFarms = ["30576670561321421054962543206778733172760596119058029640058396257464510774095"]; // cause they made a mistake

export const BrowseFarms = () => {
  const { t } = useTranslation();
  const { address } = useAccount();
  const { tokens, loading: isLoadingTokens } = useAllCoins();
  const { data: activeStreams, isLoading: isLoadingStreams } = useActiveIncentiveStreams();
  const [showHiddenFarms, setShowHiddenFarms] = useState(false);

  // Get fresh reserves for ENS pool
  const { data: ensReserves } = useReserves({
    poolId: ENS_POOL_ID,
    source: "COOKBOOK",
  });

  // Filter out ended streams
  const activeOnlyStreams = useMemo(() => {
    if (!activeStreams) return undefined;
    const currentTime = BigInt(Math.floor(Date.now() / 1000));
    return activeStreams.filter(
      (stream) => stream.endTime > currentTime && !blacklistedFarms.includes(stream.chefId.toString()),
    );
  }, [activeStreams]);

  // Get real-time farm summary data
  const { totalStaked, uniquePools, streamsWithRealTimeData } = useFarmsSummary(activeOnlyStreams);

  console.log("activeOnlyStreams", activeOnlyStreams);

  // Separate active farms and hidden farms (zero staked)
  const { activeFarms, hiddenFarms } = useMemo(() => {
    if (!streamsWithRealTimeData) return { activeFarms: undefined, hiddenFarms: undefined };

    const active: typeof streamsWithRealTimeData = [];
    const hidden: typeof streamsWithRealTimeData = [];

    streamsWithRealTimeData.forEach((stream) => {
      if (stream.totalShares === 0n) {
        hidden.push(stream);
      } else {
        active.push(stream);
      }
    });

    // Sort both arrays
    const sortFn = (a: any, b: any) => {
      // First priority: Sort by total staked (descending)
      const stakeDiff = Number(b.totalShares - a.totalShares);
      if (stakeDiff !== 0) return stakeDiff;

      // Second priority: Sort by reward amount (descending)
      return Number(b.rewardAmount - a.rewardAmount);
    };

    return {
      activeFarms: active.sort(sortFn),
      hiddenFarms: hidden.sort(sortFn),
    };
  }, [streamsWithRealTimeData]);

  // Display either active or hidden farms based on toggle
  const sortedStreams = showHiddenFarms ? hiddenFarms : activeFarms;

  // Could add featured farms section in the future
  // const featuredFarms = sortedStreams?.filter(stream => {
  //   const hasHighLiquidity = stream.lpPool && stream.lpPool.liquidity > parseEther('10');
  //   const hasHighStake = stream.totalShares > parseEther('5');
  //   return hasHighLiquidity || hasHighStake;
  // }).slice(0, 3); // Top 3 featured farms
  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Farming guide for new users */}
      <FarmingGuide />

      {/* Staking notifications - only show if user is connected */}
      {address && <StakingNotifications />}

      <div className="rounded-lg p-4 backdrop-blur-sm mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex justify-center items-center gap-3">
            <h3 className="font-mono font-bold text-sm sm:text-base uppercase tracking-wider text-primary">
              {showHiddenFarms ? t("common.hidden_farms") : t("common.active_farms")}
            </h3>
            <div
              className={cn(
                "border border-muted px-2 py-1",
                sortedStreams && sortedStreams.length > 0 && "animate-pulse",
              )}
            >
              <span className="text-primary font-mono text-sm font-bold">{sortedStreams?.length || 0}</span>
            </div>
            {/* Hidden farms toggle */}
            {hiddenFarms && hiddenFarms.length > 0 && (
              <button
                onClick={() => setShowHiddenFarms(!showHiddenFarms)}
                className={cn(
                  "text-xs font-mono px-2 py-1 rounded transition-all",
                  showHiddenFarms
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-primary border border-transparent hover:border-primary/20",
                )}
                title={showHiddenFarms ? t("common.show_active_farms") : t("common.show_hidden_farms")}
              >
                [{showHiddenFarms ? "-" : "+"}]
              </button>
            )}
          </div>
          <div className="hidden sm:flex items-center gap-4">
            {sortedStreams && sortedStreams.length > 0 && (
              <>
                <div className="text-xs font-mono">
                  <span className="text-muted-foreground">{t("common.total_staked")}:</span>
                  <span className="text-primary font-bold ml-1">{formatBalance(formatEther(totalStaked), "LP")}</span>
                </div>
                <div className="text-xs font-mono">
                  <span className="text-muted-foreground">{t("common.unique_pools")}:</span>
                  <span className="text-primary font-bold ml-1">{uniquePools}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Hidden farms info message */}
      {showHiddenFarms && hiddenFarms && hiddenFarms.length > 0 && (
        <div className="bg-muted/10 border border-muted/30 rounded-lg p-3 mb-4">
          <p className="text-xs font-mono text-muted-foreground">{t("common.hidden_farms_info")}</p>
        </div>
      )}

      {isLoadingStreams || isLoadingTokens ? (
        <FarmGridSkeleton count={6} />
      ) : sortedStreams && sortedStreams.length > 0 ? (
        <div className="farm-cards-container grid gap-4 sm:gap-5 grid-cols-1 lg:grid-cols-2">
          {sortedStreams?.map((stream) => {
            // Special handling for ENS farms - always use ENS token with correct poolId and fresh reserves
            const lpToken =
              BigInt(stream.lpId) === ENS_POOL_ID
                ? ({
                    ...(tokens.find((t) => t.symbol === "ENS") || {}),
                    poolId: ENS_POOL_ID,
                    source: "COOKBOOK" as const,
                    reserve0: ensReserves?.reserve0 || 0n,
                    reserve1: ensReserves?.reserve1 || 0n,
                    liquidity: ensReserves?.reserve0 || 0n,
                  } as TokenMeta)
                : tokens.find((t) => {
                    // Direct pool ID match
                    if (t.poolId === BigInt(stream.lpId)) return true;
                    // Special handling for CULT tokens - check if lpId matches CULT_POOL_ID
                    if (t.symbol === "CULT" && BigInt(stream.lpId) === t.poolId) return true;
                    return false;
                  });

            // If lpToken is not found and tokens are not loading, show error
            // Otherwise, use ETH_TOKEN as fallback during loading
            if (!lpToken && !isLoadingTokens) {
              return (
                <div key={stream.chefId.toString()} className="group">
                  <div className="bg-red-500/10 border border-red-500/30 rounded p-3">
                    <p className="text-sm text-red-400 font-mono">
                      {t("common.lp_token_not_found", {
                        poolId: stream.lpId.toString(),
                      })}
                    </p>
                  </div>
                </div>
              );
            }

            return (
              <div key={stream.chefId.toString()} className="group">
                <ErrorBoundary fallback={<div>{t("common.error_loading_farm")}</div>}>
                  <IncentiveStreamCard stream={stream} lpToken={lpToken || ETH_TOKEN} />
                </ErrorBoundary>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center h-full">
          <div className="bg-gradient-to-br from-muted/20 to-muted/5 border-2 border-dashed border-primary/30 rounded-xl p-8 backdrop-blur-sm">
            <div className="font-mono text-muted-foreground space-y-4">
              <div className="text-4xl sm:text-5xl opacity-20">◇</div>
              <p className="text-xl font-bold text-primary">[ {t("common.no_active_farms")} ]</p>
              <p className="text-sm mt-3">{t("common.no_farms_description")}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
