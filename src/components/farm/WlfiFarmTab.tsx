import { useActiveIncentiveStreams } from "@/hooks/use-incentive-streams";
import { useReserves } from "@/hooks/use-reserves";
import { WLFI_TOKEN, WLFI_POOL_ID, type TokenMeta } from "@/lib/coins";
import { formatBalance } from "@/lib/utils";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatEther } from "viem";
import { ErrorBoundary } from "../ErrorBoundary";
import { IncentiveStreamCard } from "../IncentiveStreamCard";
import { Alert, AlertDescription } from "../ui/alert";
import { Info } from "lucide-react";

export const WlfiFarmTab = () => {
  const { t } = useTranslation();
  const { data: allStreams, isLoading: isLoadingStreams } = useActiveIncentiveStreams();

  // Get fresh reserves for WLFI pool
  const { data: wlfiReserves } = useReserves({
    poolId: WLFI_POOL_ID,
    source: "COOKBOOK",
  });

  // Create WLFI token with fresh reserves
  const wlfiToken: TokenMeta = useMemo(() => {
    return {
      ...WLFI_TOKEN,
      poolId: WLFI_POOL_ID,
      source: "COOKBOOK" as const,
      reserve0: wlfiReserves?.reserve0 || WLFI_TOKEN.reserve0,
      reserve1: wlfiReserves?.reserve1 || WLFI_TOKEN.reserve1,
      liquidity: wlfiReserves?.reserve0 || 0n,
    };
  }, [wlfiReserves]);

  // Filter for WLFI farms (matching WLFI_POOL_ID)
  const wlfiFarms = useMemo(() => {
    if (!allStreams) return [];
    
    return allStreams.filter((stream) => {
      try {
        // Match by pool ID
        return BigInt(stream.lpId) === WLFI_POOL_ID;
      } catch (error) {
        console.error("Error filtering WLFI farms:", error);
        return false;
      }
    });
  }, [allStreams]);

  // Calculate total staked across all WLFI farms
  const totalStaked = useMemo(() => {
    return wlfiFarms.reduce((acc, farm) => acc + (farm.totalShares || 0n), 0n);
  }, [wlfiFarms]);

  if (isLoadingStreams) {
    return (
      <div className="space-y-4">
        <div className="bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 border-2 border-yellow-500/30 rounded-lg p-6 animate-pulse">
          <div className="h-6 bg-yellow-500/20 rounded w-1/3 mb-3"></div>
          <div className="h-4 bg-yellow-500/20 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* WLFI Pool Stats */}
      {wlfiReserves && (
        <div className="bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 border-2 border-yellow-500/30 rounded-lg p-4">
          <h3 className="font-mono font-bold text-yellow-400 mb-3">{t("common.pool_overview")}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-black/30 border border-yellow-500/20 rounded p-3">
              <p className="text-xs text-yellow-400/60 font-mono">{t("common.eth_liquidity")}</p>
              <p className="font-mono font-bold text-yellow-400">
                {formatBalance(formatEther(wlfiReserves.reserve0), "ETH")}
              </p>
            </div>
            <div className="bg-black/30 border border-yellow-500/20 rounded p-3">
              <p className="text-xs text-yellow-400/60 font-mono">{t("common.wlfi_reserves")}</p>
              <p className="font-mono font-bold text-yellow-400">
                {formatBalance(formatEther(wlfiReserves.reserve1), "WLFI")}
              </p>
            </div>
            {totalStaked > 0n && (
              <div className="bg-black/30 border border-yellow-500/20 rounded p-3">
                <p className="text-xs text-yellow-400/60 font-mono">{t("common.total_staked")}</p>
                <p className="font-mono font-bold text-yellow-400">
                  {formatBalance(formatEther(totalStaked), "LP")}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active WLFI Farms */}
      {wlfiFarms.length > 0 ? (
        <div className="space-y-4">
          <h3 className="font-mono font-bold text-yellow-400 text-sm uppercase tracking-wider">
            {t("common.active_farms")} ({wlfiFarms.length})
          </h3>
          <div className="space-y-4">
            {wlfiFarms.map((stream) => (
              <ErrorBoundary key={stream.chefId.toString()} fallback={<div>{t("common.error_loading_farm")}</div>}>
                <IncentiveStreamCard stream={stream} lpToken={wlfiToken} />
              </ErrorBoundary>
            ))}
          </div>
        </div>
      ) : (
        <Alert className="bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 border-yellow-500/30">
          <Info className="h-4 w-4 text-yellow-400" />
          <AlertDescription className="text-yellow-400/80">
            {t("common.no_active_farms_for_token", { token: "WLFI" })}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};