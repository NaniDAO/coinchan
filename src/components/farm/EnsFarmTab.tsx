import { useAccount, usePublicClient } from "wagmi";
import { useTranslation } from "react-i18next";
import { useState, useMemo, useEffect } from "react";
import { formatEther, formatUnits } from "viem";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useActiveIncentiveStreams } from "@/hooks/use-incentive-streams";
import { useZChefUserBalance, useZChefPendingReward, useZChefActions, useZChefPool } from "@/hooks/use-zchef-contract";
import { FarmStakeDialog } from "@/components/FarmStakeDialog";
import { FarmUnstakeDialog } from "@/components/FarmUnstakeDialog";
import { isUserRejectionError } from "@/lib/errors";
import { ENS_TOKEN, ENS_POOL_ID, type TokenMeta } from "@/lib/coins";
import { cn, formatBalance, formatNumber } from "@/lib/utils";
import { useCombinedApr } from "@/hooks/use-combined-apr";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import type { IncentiveStream } from "@/hooks/use-incentive-streams";
import { useAllCoins } from "@/hooks/metadata/use-all-coins";
import { useETHPrice } from "@/hooks/use-eth-price";
import { useReserves } from "@/hooks/use-reserves";
import { ENSLogo } from "@/components/icons/ENSLogo";

// ENS farm chef ID from the user's specification
const ENS_FARM_CHEF_ID = 9911777932062439318891919186675338016828468353880863972728110112967458165574n;

// Hardcoded ZAMM pool ID for price calculations
const ZAMM_POOL_ID = 22979666169544372205220120853398704213623237650449182409187385558845249460832n;

export function EnsFarmTab() {
  const { t } = useTranslation();
  const { address: userAddress } = useAccount();
  const [harvestingId, setHarvestingId] = useState<bigint | null>(null);
  const { data: ethPrice } = useETHPrice();

  // Get all coins including ENS with updated reserves
  const { tokens } = useAllCoins();

  // Get fresh reserves for ENS pool
  const { data: ensReserves } = useReserves({
    poolId: ENS_POOL_ID,
    source: "COOKBOOK",
  });

  // Get the ENS token with real reserves from the tokens list
  const ensTokenWithReserves = useMemo(() => {
    const ensToken = tokens.find((t) => t.symbol === "ENS") || ENS_TOKEN;
    // Ensure the token has the correct pool ID and source for LP balance fetching
    return {
      ...ensToken,
      poolId: ENS_POOL_ID,
      source: "COOKBOOK" as const,
      reserve0: ensReserves?.reserve0 || ensToken.reserve0,
      reserve1: ensReserves?.reserve1 || ensToken.reserve1,
      liquidity: ensReserves?.reserve0 || ensToken.liquidity,
    };
  }, [tokens, ensReserves]);

  // Get all active streams
  const { data: allStreams, isLoading: isLoadingStreams, error: streamsError } = useActiveIncentiveStreams();

  // Filter for ENS farms (matching ENS_POOL_ID or the specific farm chef ID)
  const ensFarms = useMemo(() => {
    try {
      if (!allStreams) return [];

      return allStreams.filter((stream) => {
        try {
          // Match by pool ID or specific chef ID
          const matchesPool = BigInt(stream.lpId) === ENS_POOL_ID;
          const matchesChefId = BigInt(stream.chefId) === ENS_FARM_CHEF_ID;
          return matchesPool || matchesChefId;
        } catch (err) {
          console.error(`Error processing stream ${stream?.chefId}:`, err);
          return false;
        }
      });
    } catch (error) {
      console.error("Error filtering ENS farms:", error);
      return [];
    }
  }, [allStreams]);

  // Get LP balance for ENS pool - directly read from Cookbook like RemoveLiquidity does
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [lpBalance, setLpBalance] = useState(0n);

  useEffect(() => {
    const fetchLpBalance = async () => {
      if (!address || !publicClient) return;

      try {
        // Read directly from Cookbook contract for ENS pool
        const balance = (await publicClient.readContract({
          address: CookbookAddress,
          abi: CookbookAbi,
          functionName: "balanceOf",
          args: [address, ENS_POOL_ID],
        })) as bigint;

        setLpBalance(balance);
      } catch (err) {
        console.error("Failed to fetch ENS LP balance:", err);
        setLpBalance(0n);
      }
    };

    fetchLpBalance();
  }, [userAddress, publicClient]);

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
        <div className="bg-muted/10 border border-primary/30 rounded-lg p-8">
          <p className="text-primary font-mono text-lg mb-2">[ {t("common.error_loading_farms_label")} ]</p>
          <p className="text-muted-foreground text-sm">{t("common.error_loading_farms")}</p>
        </div>
      </div>
    );
  }

  if (!userAddress) {
    return (
      <div className="text-center py-12">
        <div className="bg-muted/10 border border-primary/30 rounded-lg p-8">
          <p className="text-primary font-mono text-lg mb-2">[ {t("common.connect_wallet_label")} ]</p>
          <p className="text-muted-foreground text-sm">{t("common.connect_wallet_to_view_farms")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with ENS branding */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ENSLogo className="w-8 h-8" />
          <h3 className="text-xl font-bold text-primary font-mono">{t("common.ens_farms")}</h3>
        </div>
        <div className="text-sm text-muted-foreground font-mono">
          {formatBalance(formatEther(lpBalance), "LP")} {t("common.available")}
        </div>
      </div>

      {isLoadingStreams ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 bg-muted/10 border border-primary/30 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : ensFarms.length === 0 ? (
        <div className="text-center py-12">
          <div className="bg-muted/10 border border-primary/30 rounded-lg p-8">
            <p className="text-primary font-mono text-lg mb-2">[ {t("common.no_active_farms_label")} ]</p>
            <p className="text-muted-foreground text-sm">{t("common.no_ens_farms_active")}</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {ensFarms.map((farm) => {
            if (!farm || !farm.chefId) {
              console.error("Invalid farm data in ensFarms:", farm);
              return null;
            }
            // Ensure lpToken has the correct poolId that matches the farm's lpId
            const farmLpToken = {
              ...ensTokenWithReserves,
              poolId: farm.lpId, // Use the farm's lpId to ensure consistency
            };
            return (
              <EnsFarmCard
                key={farm.chefId.toString()}
                farm={farm}
                lpToken={farmLpToken}
                onHarvest={handleHarvest}
                isHarvesting={harvestingId === farm.chefId}
                ethPrice={ethPrice}
                userLpBalance={lpBalance}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface EnsFarmCardProps {
  farm: IncentiveStream;
  lpToken: TokenMeta;
  onHarvest: (chefId: bigint) => Promise<void>;
  isHarvesting: boolean;
  ethPrice?: { priceUSD: number };
  userLpBalance: bigint;
}

function EnsFarmCard({ farm, lpToken, onHarvest, isHarvesting, ethPrice, userLpBalance }: EnsFarmCardProps) {
  const { t } = useTranslation();

  // Validate farm data
  if (!farm || typeof farm.chefId === "undefined") {
    console.error("Invalid farm data:", farm);
    return null;
  }

  // Get real-time data
  const { data: poolData } = useZChefPool(farm.chefId);
  const { data: userBalance } = useZChefUserBalance(farm.chefId);
  const { data: pendingRewards, isLoading: isLoadingRewards } = useZChefPendingReward(farm.chefId);

  // Get combined APR data to show base and farm APR separately
  const { baseApr, farmApr } = useCombinedApr({
    stream: farm,
    lpToken: lpToken,
    enabled: true,
  });

  // Fetch ZAMM reserves if reward token is ZAMM
  const isZAMMReward = farm.rewardCoin?.symbol === "ZAMM";
  const { data: zammReserves } = useReserves({
    poolId: isZAMMReward ? ZAMM_POOL_ID : undefined,
    source: "ZAMM",
  });

  const totalShares = poolData?.[7] ?? farm.totalShares ?? 0n;
  const hasStaked = !!(userBalance && userBalance > 0n);
  const canStake = userLpBalance > 0n;

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
  const hasTimeRemaining =
    timeRemaining.seconds > 0 || timeRemaining.days > 0 || timeRemaining.hours > 0 || timeRemaining.minutes > 0;
  // Since we're using useActiveIncentiveStreams, all farms are active
  const isActive = true;
  // Safe handling of reward token decimals
  const rewardTokenDecimals = useMemo(() => {
    try {
      return farm.rewardCoin?.decimals || 18;
    } catch (error) {
      console.error("Error getting reward token decimals:", error);
      return 18; // Default to 18 decimals
    }
  }, [farm.rewardCoin]);

  const userPosition = useMemo(
    () => ({
      shares: userBalance || 0n,
      pendingRewards: pendingRewards || 0n,
      totalDeposited: 0n,
      totalHarvested: 0n,
    }),
    [userBalance, pendingRewards],
  );

  return (
    <Card className="bg-card border border-border p-6 hover:border-primary/50 transition-all">
      <div className="space-y-4">
        {/* Farm Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ENSLogo className="w-6 h-6" />
            <div>
              <h4 className="font-mono font-bold text-primary">
                ENS {t("common.pool")} - {farm.rewardCoin?.symbol || "???"} {t("common.rewards_suffix")}
              </h4>
              <p className="text-xs text-muted-foreground">
                {hasTimeRemaining
                  ? t("common.days_hours_remaining", { days: timeRemaining.days, hours: timeRemaining.hours })
                  : isActive
                    ? "Active"
                    : "Ended"}
              </p>
            </div>
          </div>
          <div
            className={cn(
              "px-3 py-1 rounded text-xs font-mono font-bold",
              isActive
                ? "bg-green-500/10 text-green-600 border border-green-600/30"
                : "bg-muted/30 text-muted-foreground border border-muted",
            )}
          >
            {isActive ? "ACTIVE" : "ENDED"}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-muted/10 p-3 rounded border border-border">
            <p className="text-xs text-muted-foreground font-mono">{t("common.total_rewards")}</p>
            <p className="text-sm font-mono font-bold text-primary">
              {formatBalance(formatUnits(farm.rewardAmount || 0n, rewardTokenDecimals), farm.rewardCoin?.symbol)}
            </p>
          </div>
          <div className="bg-muted/10 p-3 rounded border border-border">
            <p className="text-xs text-muted-foreground font-mono">{t("common.total_staked")}</p>
            <p className="text-sm font-mono font-bold text-primary">{formatBalance(formatEther(totalShares), "LP")}</p>
          </div>
          <div className="bg-muted/10 p-3 rounded border border-border">
            <p className="text-xs text-muted-foreground font-mono">{t("common.apr")}</p>
            <div className="text-sm font-mono font-bold">
              <span className="text-primary">Base APR {baseApr.toFixed(1)}%</span>
              {farmApr > 0 && <span className="text-green-600"> + Farm APR {farmApr.toFixed(1)}%</span>}
            </div>
          </div>
        </div>

        {/* User Position */}
        {hasStaked && (
          <div className="bg-green-500/10 border border-green-600/30 p-4 rounded">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <p className="text-xs text-muted-foreground font-mono">{t("common.your_stake")}</p>
                <p className="text-sm font-mono font-bold text-green-600">
                  {formatBalance(formatEther(userBalance || 0n), "LP")}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-mono">{t("common.pending_rewards")}</p>
                <div>
                  <p className="text-sm font-mono font-bold text-green-600">
                    {isLoadingRewards ? (
                      <span className="animate-pulse">...</span>
                    ) : (
                      (() => {
                        try {
                          // ZAMM rewards are 18 decimals, use formatEther
                          const formattedRewards = formatEther(pendingRewards || 0n);
                          return formatBalance(formattedRewards, farm.rewardCoin?.symbol || "ZAMM");
                        } catch (error) {
                          console.error("Error formatting pending rewards:", error, {
                            pendingRewards,
                            rewardCoin: farm.rewardCoin,
                            rewardTokenDecimals,
                          });
                          return "0";
                        }
                      })()
                    )}
                  </p>
                  {ethPrice?.priceUSD &&
                  pendingRewards &&
                  pendingRewards > 0n &&
                  isZAMMReward &&
                  zammReserves &&
                  zammReserves.reserve0 &&
                  zammReserves.reserve1 &&
                  zammReserves.reserve0 > 0n &&
                  zammReserves.reserve1 > 0n ? (
                    <p className="text-xs text-muted-foreground">
                      ≈ ${(() => {
                        const rewardAmount = parseFloat(formatEther(pendingRewards));
                        const ethReserve = parseFloat(formatEther(zammReserves.reserve0));
                        const zammReserve = parseFloat(formatEther(zammReserves.reserve1));
                        const zammPriceInEth = ethReserve / zammReserve;
                        const zammPriceUsd = zammPriceInEth * ethPrice.priceUSD;
                        return formatNumber(rewardAmount * zammPriceUsd, 2);
                      })()} USD
                    </p>
                  ) : null}
                </div>
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
                  className="flex-1 border-primary/50 text-primary hover:bg-primary/10 font-mono"
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
                className="flex-1 border-green-600/50 text-green-600 hover:bg-green-600/10 font-mono"
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
                    className="flex-1 border-destructive/50 text-destructive hover:bg-destructive/10 font-mono"
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
