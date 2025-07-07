import { useActiveIncentiveStreams } from "@/hooks/use-incentive-streams";
import { FarmGridSkeleton } from "../FarmLoadingStates";
import { ErrorBoundary } from "../ErrorBoundary";
import { FarmStakeDialog } from "../FarmStakeDialog";
import { IncentiveStreamCard } from "../IncentiveStreamCard";
import { useTranslation } from "react-i18next";
import { useAllCoins } from "@/hooks/metadata/use-all-coins";

export const BrowseFarms = () => {
  const { t } = useTranslation();
  const { tokens } = useAllCoins();
  const { data: activeStreams, isLoading: isLoadingStreams } =
    useActiveIncentiveStreams();

  console.log("useActiveIncentiveStreams", activeStreams, isLoadingStreams);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="bg-gradient-to-r from-background/50 to-background/80 border border-primary/30 rounded-lg p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="font-mono font-bold text-base sm:text-lg uppercase tracking-wider bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              {t("common.active_farms")}
            </h3>
            <div className="bg-primary/20 border border-primary/40 px-3 py-1 rounded">
              <span className="text-primary font-mono text-sm font-bold">
                ({activeStreams?.length || 0})
              </span>
            </div>
          </div>
          <div className="hidden sm:block text-xs text-muted-foreground font-mono">
            {t("common.loading")}
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
      </div>

      {isLoadingStreams ? (
        <FarmGridSkeleton count={6} />
      ) : activeStreams && activeStreams.length > 0 ? (
        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {activeStreams.map((stream) => {
            const lpToken = tokens.find(
              (t) => t.poolId === BigInt(stream.lpId),
            );

            if (!lpToken) {
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
                <ErrorBoundary
                  fallback={<div>{t("common.error_loading_farm")}</div>}
                >
                  {lpToken ? (
                    <FarmStakeDialog
                      stream={stream}
                      lpToken={lpToken}
                      trigger={
                        <div className="w-full cursor-pointer transform transition-all duration-200 hover:scale-[1.02] hover:shadow-xl">
                          <IncentiveStreamCard stream={stream} />
                        </div>
                      }
                    />
                  ) : (
                    <div className="transform transition-all duration-200 hover:scale-[1.02] hover:shadow-xl">
                      <IncentiveStreamCard stream={stream} />
                    </div>
                  )}
                </ErrorBoundary>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 sm:py-16">
          <div className="bg-gradient-to-br from-muted/20 to-muted/5 border-2 border-dashed border-primary/30 rounded-xl p-8 backdrop-blur-sm">
            <div className="font-mono text-muted-foreground space-y-4">
              <div className="text-4xl sm:text-5xl opacity-20">◇</div>
              <p className="text-xl font-bold text-primary">
                [ {t("common.no_active_farms")} ]
              </p>
              <p className="text-sm mt-3">{t("common.no_farms_description")}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
