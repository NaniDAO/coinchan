import { useAccount } from "wagmi";
import { useTranslation } from "react-i18next";
import { useState, useMemo } from "react";
import { formatEther, formatUnits } from "viem";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatImageURL } from "@/hooks/metadata";
import { useActiveIncentiveStreams } from "@/hooks/use-incentive-streams";
import { useZChefUserBalance, useZChefPendingReward, useZChefActions, useZChefPool } from "@/hooks/use-zchef-contract";
import { useLpBalance } from "@/hooks/use-lp-balance";
import { APRDisplay } from "@/components/farm/APRDisplay";
import { FarmStakeDialog } from "@/components/FarmStakeDialog";
import { FarmUnstakeDialog } from "@/components/FarmUnstakeDialog";
import { isUserRejectionError } from "@/lib/errors";
import { CULT_TOKEN, CULT_POOL_ID, type TokenMeta } from "@/lib/coins";
import { cn, formatBalance } from "@/lib/utils";
import type { IncentiveStream } from "@/hooks/use-incentive-streams";
import { useAllCoins } from "@/hooks/metadata/use-all-coins";

export function CultFarmTab() {
  const { t } = useTranslation();
  const { address } = useAccount();
  const [harvestingId, setHarvestingId] = useState<bigint | null>(null);
  
  // Get all coins including CULT with updated reserves
  const { tokens } = useAllCoins();
  
  // Get the CULT token with real reserves from the tokens list
  const cultTokenWithReserves = useMemo(() => {
    return tokens.find(t => t.symbol === "CULT") || CULT_TOKEN;
  }, [tokens]);
  
  // Get all active streams
  const { data: allStreams, isLoading: isLoadingStreams, error: streamsError } = useActiveIncentiveStreams();
  
  // Filter for CULT-only farms (where lpId matches CULT_POOL_ID)
  const cultFarms = useMemo(() => {
    try {
      if (!allStreams) return [];
      
      return allStreams.filter(stream => {
        try {
          const matchesPool = BigInt(stream.lpId) === CULT_POOL_ID;
          return matchesPool;
        } catch (err) {
          console.error(`Error processing stream ${stream?.chefId}:`, err);
          return false;
        }
      });
    } catch (error) {
      console.error("Error filtering CULT farms:", error);
      return [];
    }
  }, [allStreams]);

  // Get LP balance for CULT pool
  const { balance: lpBalance } = useLpBalance({
    lpToken: cultTokenWithReserves,
    poolId: CULT_POOL_ID,
  });

  const { harvest } = useZChefActions();

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

  if (streamsError) {
    console.error("Error loading farms:", streamsError);
    return (
      <div className="text-center py-12">
        <div className="bg-black/30 border border-red-900/30 rounded-lg p-8">
          <p className="text-red-400 font-mono text-lg mb-2">[ {t("common.error_loading_farms_label")} ]</p>
          <p className="text-gray-400 text-sm">{t("common.error_loading_farms")}</p>
        </div>
      </div>
    );
  }

  if (!address) {
    return (
      <div className="text-center py-12">
        <div className="bg-black/30 border border-red-900/30 rounded-lg p-8">
          <p className="text-red-400 font-mono text-lg mb-2">[ {t("common.connect_wallet_label")} ]</p>
          <p className="text-gray-400 text-sm">{t("common.connect_wallet_to_view_farms")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with CULT branding */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <img src="/cult.jpg" alt="CULT" className="w-8 h-8 rounded-full border-2 border-red-600" />
          <h3 className="text-xl font-bold text-red-400 font-mono">{t("common.cult_farms")}</h3>
        </div>
        <div className="text-sm text-gray-400 font-mono">
          {formatBalance(formatEther(lpBalance), "LP")} {t("common.available")}
        </div>
      </div>

      {isLoadingStreams ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 bg-black/30 border border-red-900/30 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : cultFarms.length === 0 ? (
        <div className="text-center py-12">
          <div className="bg-black/30 border border-red-900/30 rounded-lg p-8">
            <p className="text-red-400 font-mono text-lg mb-2">[ {t("common.no_active_farms_label")} ]</p>
            <p className="text-gray-400 text-sm">{t("common.no_cult_farms_active")}</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {cultFarms.map((farm) => {
            if (!farm || !farm.chefId) {
              console.error("Invalid farm data in cultFarms:", farm);
              return null;
            }
            return (
              <CultFarmCard
                key={farm.chefId.toString()}
                farm={farm}
                lpToken={cultTokenWithReserves}
                lpBalance={lpBalance}
                onHarvest={handleHarvest}
                isHarvesting={harvestingId === farm.chefId}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface CultFarmCardProps {
  farm: IncentiveStream;
  lpToken: TokenMeta;
  lpBalance: bigint;
  onHarvest: (chefId: bigint) => Promise<void>;
  isHarvesting: boolean;
}

function CultFarmCard({ farm, lpToken, lpBalance, onHarvest, isHarvesting }: CultFarmCardProps) {
  const { t } = useTranslation();
  
  // Validate farm data
  if (!farm || typeof farm.chefId === 'undefined') {
    console.error("Invalid farm data:", farm);
    return null;
  }
  
  // Get real-time data
  const { data: poolData } = useZChefPool(farm.chefId);
  const { data: userBalance } = useZChefUserBalance(farm.chefId);
  const { data: pendingRewards, isLoading: isLoadingRewards } = useZChefPendingReward(farm.chefId);
  
  const totalShares = poolData?.[7] ?? farm.totalShares ?? 0n;
  const hasStaked = !!(userBalance && userBalance > 0n);
  const canStake = lpBalance > 0n;
  
  // Calculate time remaining
  const timeRemaining = useMemo(() => {
    try {
      const now = BigInt(Math.floor(Date.now() / 1000));
      const remaining = Number(farm.endTime - now);
      
      if (remaining <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
      
      const days = Math.floor(remaining / 86400);
      const hours = Math.floor((remaining % 86400) / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = remaining % 60;
      
      return { days, hours, minutes, seconds };
    } catch (error) {
      console.error("Error calculating time remaining:", error);
      return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    }
  }, [farm.endTime]);

  // Check both status and time remaining
  const hasTimeRemaining = timeRemaining.seconds > 0 || timeRemaining.days > 0 || timeRemaining.hours > 0 || timeRemaining.minutes > 0;
  // Trust the API status - if it says ACTIVE, it's active
  const isActive = farm.status === "ACTIVE";
  // Safe handling of reward token decimals
  const rewardTokenDecimals = useMemo(() => {
    try {
      return farm.rewardCoin?.decimals || 18;
    } catch (error) {
      console.error("Error getting reward token decimals:", error);
      return 18; // Default to 18 decimals
    }
  }, [farm.rewardCoin]);

  const userPosition = useMemo(() => ({
    shares: userBalance || 0n,
    pendingRewards: pendingRewards || 0n,
    totalDeposited: 0n,
    totalHarvested: 0n,
  }), [userBalance, pendingRewards]);

  return (
    <Card className="bg-black/50 border border-red-900/30 p-6 hover:border-red-600/50 transition-all">
      <div className="space-y-4">
        {/* Farm Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {farm.rewardCoin?.imageUrl && (
              <img
                src={formatImageURL(farm.rewardCoin.imageUrl)}
                alt={farm.rewardCoin.symbol}
                className="w-6 h-6 rounded-full"
              />
            )}
            <div>
              <h4 className="font-mono font-bold text-red-400">
                {farm.rewardCoin?.symbol || "???"} {t("common.rewards_suffix")}
              </h4>
              <p className="text-xs text-gray-400">
                {hasTimeRemaining ? 
                  t("common.days_hours_remaining", { days: timeRemaining.days, hours: timeRemaining.hours }) : 
                  isActive ? t("common.active") : t("common.ended")
                }
              </p>
            </div>
          </div>
          <div className={cn(
            "px-3 py-1 rounded text-xs font-mono font-bold",
            isActive ? "bg-green-900/30 text-green-400 border border-green-600/30" : "bg-gray-900/30 text-gray-400 border border-gray-600/30"
          )}>
            {isActive ? t("common.active").toUpperCase() : t("common.ended").toUpperCase()}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-black/30 p-3 rounded border border-red-900/20">
            <p className="text-xs text-gray-400 font-mono">{t("common.total_rewards")}</p>
            <p className="text-sm font-mono font-bold text-red-400">
              {formatBalance(
                formatUnits(farm.rewardAmount || 0n, rewardTokenDecimals),
                farm.rewardCoin?.symbol
              )}
            </p>
          </div>
          <div className="bg-black/30 p-3 rounded border border-red-900/20">
            <p className="text-xs text-gray-400 font-mono">{t("common.total_staked")}</p>
            <p className="text-sm font-mono font-bold text-red-400">
              {formatBalance(formatEther(totalShares), "LP")}
            </p>
          </div>
          <div className="bg-black/30 p-3 rounded border border-red-900/20 md:col-span-2">
            <APRDisplay stream={farm} lpToken={lpToken} shortView={true} />
          </div>
        </div>

        {/* User Position */}
        {hasStaked && (
          <div className="bg-green-900/10 border border-green-600/30 p-4 rounded">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <p className="text-xs text-gray-400 font-mono">{t("common.your_stake")}</p>
                <p className="text-sm font-mono font-bold text-green-400">
                  {formatBalance(formatEther(userBalance || 0n), "LP")}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-mono">{t("common.pending_rewards")}</p>
                <p className="text-sm font-mono font-bold text-green-400">
                  {isLoadingRewards ? (
                    <span className="animate-pulse">...</span>
                  ) : (() => {
                    try {
                      // ZAMM rewards are 18 decimals, use formatEther
                      const formattedRewards = formatEther(pendingRewards || 0n);
                      return formatBalance(formattedRewards, farm.rewardCoin?.symbol || "ZAMM");
                    } catch (error) {
                      console.error("Error formatting pending rewards:", error, {
                        pendingRewards,
                        rewardCoin: farm.rewardCoin,
                        rewardTokenDecimals
                      });
                      return "0";
                    }
                  })()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          {isActive && (
            <FarmStakeDialog
              stream={farm}
              lpToken={lpToken}
              trigger={
                <Button 
                  variant="outline" 
                  className="flex-1 border-red-600/50 text-red-400 hover:bg-red-600/20 font-mono"
                  disabled={!canStake && !hasStaked}
                >
                  {hasStaked ? t("common.stake_more") : t("common.stake")}
                </Button>
              }
            />
          )}
          
          {hasStaked && (
            <>
              <Button
                variant="outline"
                onClick={() => onHarvest(farm.chefId)}
                disabled={!pendingRewards || pendingRewards === 0n || isHarvesting}
                className="flex-1 border-green-600/50 text-green-400 hover:bg-green-600/20 font-mono"
              >
                {isHarvesting ? t("common.harvesting") : t("common.harvest")}
              </Button>
              
              <FarmUnstakeDialog
                stream={farm}
                lpToken={lpToken}
                userPosition={userPosition}
                trigger={
                  <Button 
                    variant="outline" 
                    className="flex-1 border-red-600/50 text-red-400 hover:bg-red-600/20 font-mono"
                  >
                    {t("common.unstake")}
                  </Button>
                }
              />
            </>
          )}
        </div>
      </div>
    </Card>
  );
}