import { IncentiveStream, useActiveIncentiveStreams } from "@/hooks/use-incentive-streams";
import { useFarmsSummary } from "@/hooks/use-farms-summary";
import { getReserves } from "@/hooks/use-reserves";
import { ETH_TOKEN, type TokenMeta } from "@/lib/coins";
import { cn, formatBalance } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { Address, formatEther } from "viem";
import { ErrorBoundary } from "../ErrorBoundary";
import { FarmGridSkeleton } from "../FarmLoadingStates";
import { IncentiveStreamCard } from "../IncentiveStreamCard";
import { StakingNotifications } from "./StakingNotifications";
import { FarmingGuide } from "./FarmingGuide";
import { useMemo, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { Alert, AlertDescription } from "../ui/alert";
import { useQuery } from "@tanstack/react-query";
import { fetchPool } from "@/hooks/use-get-pool";

const blacklistedFarms = [
  "30576670561321421054962543206778733172760596119058029640058396257464510774095", // cause they made a mistake
  "52418476069769202240323386680239522038700002277705128813595009835867277675522",
  "1810323110578585302501962521306601791657074974013280782606413579483869984930",
];

export const BrowseFarms = () => {
  const { t } = useTranslation();
  const { address } = useAccount();
  const { data: activeStreams, isLoading: isLoadingStreams } = useActiveIncentiveStreams();
  const [showHiddenFarms, setShowHiddenFarms] = useState(false);

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

      {isLoadingStreams ? (
        <FarmGridSkeleton count={6} />
      ) : sortedStreams && sortedStreams.length > 0 ? (
        <div className="farm-cards-container grid gap-4 sm:gap-5 grid-cols-1 lg:grid-cols-2">
          {sortedStreams?.map((stream) => (
            <IncentiveStreamCardListItem key={stream.chefId} stream={stream} />
          ))}
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

const useGetTokenMetaFromPool = (poolId?: bigint) => {
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: ["token-meta-from-pool", poolId],
    queryFn: async (): Promise<TokenMeta | null> => {
      // Try fetching from both sources since we don't know the source yet
      // First try ZAMM (for regular pools), then COOKBOOK (for cookbook coins)
      let pool = await fetchPool(poolId!.toString(), "ZAMM");
      let source: "ZAMM" | "COOKBOOK" = "ZAMM";

      if (!pool) {
        // If not found in ZAMM, try COOKBOOK
        pool = await fetchPool(poolId!.toString(), "COOKBOOK");
        source = "COOKBOOK";
      }

      if (!pool) {
        throw new Error(`Pool not found for ID ${poolId}`);
      }

      const reserves = await getReserves(publicClient!, {
        poolId: poolId!,
        source: source,
      });

      if (!pool?.coin1Id) {
        throw new Error(`Coin1 ID not found for pool ${poolId}`);
      }

      return {
        id: BigInt(pool?.coin1Id),
        name: pool?.coin1?.name ?? "Unknown Token",
        symbol: pool?.coin1?.symbol ?? "UNT",
        source: source,
        tokenUri: pool?.coin1?.tokenURI,
        imageUrl: pool?.coin1?.imageUrl,
        reserve0: reserves.reserve0, // ETH reserves in the pool
        reserve1: reserves.reserve1, // Token reserves in the pool
        liquidity: reserves.reserve0 + reserves.reserve1, // Total liquidity in the pool
        swapFee: pool?.feeOrHook ? BigInt(pool?.feeOrHook) : pool?.swapFee ? BigInt(pool?.swapFee) : undefined,
        poolId: BigInt(pool?.id),
        token0: (pool?.token0 as Address) ?? undefined,
        token1: (pool?.token1 as Address) ?? undefined,
        decimals: pool?.coin1?.decimals ?? 18,
      };
    },
    enabled: !!poolId && !!publicClient,
  });
};

const IncentiveStreamCardListItem = ({
  stream,
}: {
  stream: IncentiveStream;
}) => {
  const { data: lpToken, isLoading: isLoadingLpToken } = useGetTokenMetaFromPool(stream.lpId);
  const { t } = useTranslation();

  // If lpToken is not found and tokens are not loading, show error
  // Otherwise, use ETH_TOKEN as fallback during loading
  console.log(lpToken, isLoadingLpToken);
  if (!lpToken && !isLoadingLpToken) {
    return (
      <Alert tone="info" key={stream.chefId.toString()} className="group">
        <AlertDescription className="break-all">
          {t("common.lp_token_not_found", {
            poolId: stream.lpId.toString(),
          })}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div key={stream.chefId.toString()} className="group">
      <ErrorBoundary fallback={<div>{t("common.error_loading_farm")}</div>}>
        <IncentiveStreamCard stream={stream} lpToken={lpToken || ETH_TOKEN} />
      </ErrorBoundary>
    </div>
  );
};
