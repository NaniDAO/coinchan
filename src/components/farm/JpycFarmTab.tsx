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
import { JPYC_TOKEN, JPYC_POOL_ID, JPYC_FARM_CHEF_ID, JPYC_ADDRESS, type TokenMeta } from "@/lib/coins";
import { cn, formatBalance, formatNumber } from "@/lib/utils";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import type { IncentiveStream } from "@/hooks/use-incentive-streams";
import { useAllCoins } from "@/hooks/metadata/use-all-coins";
import { useETHPrice } from "@/hooks/use-eth-price";
import { useReserves } from "@/hooks/use-reserves";
import { useErc20Price } from "@/hooks/use-erc20-price";
import { useErc20Metadata } from "@/hooks/use-erc20-metadata";
import { useCombinedApr } from "@/hooks/use-combined-apr";

export function JpycFarmTab() {
  const { t } = useTranslation();
  const { address: userAddress } = useAccount();
  const [harvestingId, setHarvestingId] = useState<bigint | null>(null);
  const { data: ethPrice } = useETHPrice();

  // Get all coins including JPYC with updated reserves
  const { tokens } = useAllCoins();

  // Get fresh reserves for JPYC pool
  const { data: jpycReserves } = useReserves({
    poolId: JPYC_POOL_ID,
    source: "COOKBOOK",
  });

  // Get the JPYC token with real reserves from the tokens list
  const jpycTokenWithReserves = useMemo(() => {
    const jpycToken = tokens.find((t) => t.symbol === "JPYC") || JPYC_TOKEN;
    // Ensure the token has the correct pool ID and source for LP balance fetching
    return {
      ...jpycToken,
      poolId: JPYC_POOL_ID,
      source: "COOKBOOK" as const,
      reserve0: jpycReserves?.reserve0 || jpycToken.reserve0,
      reserve1: jpycReserves?.reserve1 || jpycToken.reserve1,
      liquidity: jpycReserves?.reserve0 || jpycToken.liquidity,
    };
  }, [tokens, jpycReserves]);

  // Get all active streams
  const { data: allStreams, isLoading: isLoadingStreams, error: streamsError } = useActiveIncentiveStreams();

  // Filter for JPYC farms (matching JPYC_POOL_ID or the specific farm chef ID)
  // Also exclude expired streams based on endTime
  const jpycFarms = useMemo(() => {
    try {
      if (!allStreams) return [];

      const now = BigInt(Math.floor(Date.now() / 1000)); // Current unix timestamp

      return allStreams.filter((stream) => {
        try {
          // Match by pool ID or specific chef ID
          const matchesPool = BigInt(stream.lpId) === JPYC_POOL_ID;
          const matchesChefId = BigInt(stream.chefId) === JPYC_FARM_CHEF_ID;

          // Exclude expired streams (endTime has passed)
          const isNotExpired = stream.endTime > now;

          return (matchesPool || matchesChefId) && isNotExpired;
        } catch (err) {
          console.error(`Error processing stream ${stream?.chefId}:`, err);
          return false;
        }
      });
    } catch (error) {
      console.error("Error filtering JPYC farms:", error);
      return [];
    }
  }, [allStreams]);

  // Get LP balance for JPYC pool - directly read from Cookbook
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [lpBalance, setLpBalance] = useState(0n);

  useEffect(() => {
    const fetchLpBalance = async () => {
      if (!address || !publicClient) return;

      try {
        // Read directly from Cookbook contract for JPYC pool
        const balance = (await publicClient.readContract({
          address: CookbookAddress,
          abi: CookbookAbi,
          functionName: "balanceOf",
          args: [address, JPYC_POOL_ID],
        })) as bigint;

        setLpBalance(balance);
      } catch (err) {
        console.error("Failed to fetch JPYC LP balance:", err);
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
      {/* Header with JPYC branding */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <img
            src="https://content.wrappr.wtf/ipfs/bafkreigzo74zz6wlriztpznhuqxbh4nrucakv7dg6dxbroxlofzedthpce"
            alt="JPYC"
            className="w-8 h-8 rounded-full"
          />
          <h3 className="text-xl font-bold text-primary font-mono">{t("common.jpyc_farms")}</h3>
        </div>
        <div className="text-sm text-muted-foreground font-mono">
          {formatBalance(formatEther(lpBalance), "LP")} {t("common.available")}
        </div>
      </div>

      {isLoadingStreams ? (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-48 bg-muted/10 border border-primary/30 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : jpycFarms.length === 0 ? (
        <div className="text-center py-12">
          <div className="bg-muted/10 border border-primary/30 rounded-lg p-8">
            <p className="text-primary font-mono text-lg mb-2">[ {t("common.no_active_farms_label")} ]</p>
            <p className="text-muted-foreground text-sm">{t("common.no_jpyc_farms_active")}</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {jpycFarms.map((farm) => {
            if (!farm || !farm.chefId) {
              console.error("Invalid farm data in jpycFarms:", farm);
              return null;
            }
            // Ensure lpToken has the correct poolId and all necessary fields
            const farmLpToken: TokenMeta = {
              ...jpycTokenWithReserves,
              poolId: JPYC_POOL_ID, // Use constant JPYC_POOL_ID for correct APY lookup
              source: "COOKBOOK" as const,
              swapFee: 30n, // 0.3% fee (30 bps)
              poolKey: {
                id0: 0n,
                id1: 0n,
                token0: "0x0000000000000000000000000000000000000000" as `0x${string}`,
                token1: JPYC_ADDRESS,
                swapFee: 30n,
              },
            };
            return (
              <JpycFarmCard
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

interface JpycFarmCardProps {
  farm: IncentiveStream;
  lpToken: TokenMeta;
  onHarvest: (chefId: bigint) => Promise<void>;
  isHarvesting: boolean;
  ethPrice?: { priceUSD: number };
  userLpBalance: bigint;
}

function JpycFarmCard({ farm, lpToken, onHarvest, isHarvesting, ethPrice, userLpBalance }: JpycFarmCardProps) {
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

  // Check if reward is ERC20 (rewardId === 0n)
  // Handle both bigint and string types from indexer, and hardcode JPYC farm
  const isErc20Reward =
    farm.rewardId === 0n || String(farm.rewardId) === "0" || BigInt(farm.chefId) === JPYC_FARM_CHEF_ID;

  // Debug logging
  if (process.env.NODE_ENV === "development") {
    console.log("[JpycFarmCard] Farm data:", farm);
    console.log("[JpycFarmCard] rewardId raw:", farm.rewardId, "type:", typeof farm.rewardId);
    console.log("[JpycFarmCard] Is ERC20 reward:", isErc20Reward);
    console.log("[JpycFarmCard] Reward token address:", farm.rewardToken);
    console.log("[JpycFarmCard] RewardCoin:", farm.rewardCoin);
  }

  // Get ERC20 metadata (symbol, decimals) for ERC20 rewards
  const {
    symbol: erc20Symbol,
    decimals: erc20Decimals,
    isLoading: isMetadataLoading,
  } = useErc20Metadata({
    tokenAddress: isErc20Reward ? (farm.rewardToken as `0x${string}`) : undefined,
  });

  // Get ERC20 price from Chainlink
  const { data: erc20Price } = useErc20Price({
    tokenAddress: isErc20Reward ? (farm.rewardToken as `0x${string}`) : undefined,
  });

  // Hardcoded DAI metadata as fallback (DAI mainnet address)
  const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
  const isDaiToken = farm.rewardToken?.toLowerCase() === DAI_ADDRESS.toLowerCase();

  // For ERC20 rewards, ALWAYS prioritize the ERC20 metadata over indexer data
  // If still loading, show "Loading..." instead of wrong symbol from indexer
  // For DAI specifically, use hardcoded values as ultimate fallback
  const rewardSymbol = isErc20Reward
    ? erc20Symbol || (isDaiToken ? "DAI" : isMetadataLoading ? "Loading..." : "ERC20")
    : farm.rewardCoin?.symbol || "???";
  const rewardDecimals = isErc20Reward ? erc20Decimals || (isDaiToken ? 18 : 18) : farm.rewardCoin?.decimals || 18;

  // Fetch APR - useCombinedApr internally calls usePoolApy and returns both baseApr and farmApr
  const combinedAprData = useCombinedApr({
    stream: poolData?.[7] ? { ...farm, totalShares: poolData[7] } : farm,
    lpToken,
    enabled: true,
  });

  const baseApr = combinedAprData.baseApr;
  const farmApr = combinedAprData.farmApr;

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
  const isActive = true;

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
            <img
              src="https://content.wrappr.wtf/ipfs/bafkreigzo74zz6wlriztpznhuqxbh4nrucakv7dg6dxbroxlofzedthpce"
              alt="JPYC"
              className="w-6 h-6 rounded-full"
            />
            <div>
              <h4 className="font-mono font-bold text-primary">
                JPYC {t("common.pool")} - {rewardSymbol} {t("common.rewards_suffix")}
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
              {formatBalance(formatUnits(farm.rewardAmount || 0n, rewardDecimals), rewardSymbol)}
            </p>
          </div>
          <div className="bg-muted/10 p-3 rounded border border-border">
            <p className="text-xs text-muted-foreground font-mono">{t("common.total_staked")}</p>
            <p className="text-sm font-mono font-bold text-primary">{formatBalance(formatEther(totalShares), "LP")}</p>
          </div>
          <div className="bg-muted/10 p-3 rounded border border-border">
            <p className="text-xs text-muted-foreground font-mono">{t("common.apr")}</p>
            <div className="text-sm font-mono font-bold">
              <span className="text-primary">Base {baseApr.toFixed(1)}%</span>
              {farmApr > 0 && <span className="text-green-600"> + Farm {farmApr.toFixed(1)}%</span>}
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
                          const formattedRewards = formatUnits(pendingRewards || 0n, rewardDecimals);
                          return formatBalance(formattedRewards, rewardSymbol);
                        } catch (error) {
                          console.error("Error formatting pending rewards:", error);
                          return "0";
                        }
                      })()
                    )}
                  </p>
                  {ethPrice?.priceUSD && pendingRewards && pendingRewards > 0n && isErc20Reward && erc20Price ? (
                    <p className="text-xs text-muted-foreground">
                      ≈ ${(() => {
                        const rewardAmount = parseFloat(formatUnits(pendingRewards, rewardDecimals));
                        const tokenPriceUsd = erc20Price * ethPrice.priceUSD;
                        return formatNumber(rewardAmount * tokenPriceUsd, 2);
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
