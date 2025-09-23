import { useIncentiveStreamsByLpPool } from "@/hooks/use-incentive-streams";
import { useReserves } from "@/hooks/use-reserves";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Address, formatEther } from "viem";
import { IncentiveStreamCard } from "../IncentiveStreamCard";
import { Alert, AlertDescription } from "../ui/alert";
import { Info } from "lucide-react";
import type { CoinSource, TokenMeta } from "@/lib/coins";
import { CookbookAddress } from "@/constants/Cookbook";
import { useGetCoin } from "@/hooks/metadata/use-get-coin";

interface CookbookFarmTabProps {
  poolId: string;
  coinId: string;
  contractAddress?: Address;
  source: CoinSource;
  coinSymbol?: string;
  swapFee?: bigint;
  setHide?: (value: boolean) => void;
}

// Format liquidity amounts for compact display
const formatCompactLiquidity = (value: number): string => {
  if (value === 0) return "0";

  // For very small values, use shortened format
  if (value < 0.0001) {
    return "<0.0001";
  }

  // For small values, show 4 decimals
  if (value < 1) {
    return value.toFixed(4);
  }

  // For medium values, show 2 decimals
  if (value < 1000) {
    return value.toFixed(2);
  }

  // For large values, use compact notation
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
};

export const CookbookFarmTab = ({
  poolId,
  coinId,
  contractAddress,
  source,
  coinSymbol,
  swapFee,
  setHide,
}: CookbookFarmTabProps) => {
  const { t } = useTranslation();

  // Fetch coin data
  const { data: coinData } = useGetCoin({
    coinId: coinId,
    token: contractAddress || CookbookAddress,
  });

  // Get farms for this pool
  const { data: poolFarms, isLoading: isLoadingStreams } =
    useIncentiveStreamsByLpPool(poolId ? BigInt(poolId) : undefined);

  // Get fresh reserves for the pool
  const { data: poolReserves } = useReserves({
    poolId: poolId ? BigInt(poolId) : undefined,
    source: source || "COOKBOOK",
  });

  // Create token metadata for the LP token
  const lpToken: TokenMeta = useMemo(() => {
    return {
      id: coinId ? BigInt(coinId) : 0n, // This should be the coin ID for pool key computation
      symbol: `ETH/${coinSymbol || coinData?.symbol || "COIN"}`,
      name: `ETH-${coinSymbol || coinData?.symbol || "COIN"} LP`,
      decimals: 18,
      poolId: poolId ? BigInt(poolId) : undefined, // This is the actual pool ID for fetching reserves
      source: source || ("COOKBOOK" as const),
      swapFee: swapFee || 30n, // Pass the feeOrHook value for cookbook pools
      reserve0: poolReserves?.reserve0 || 0n,
      reserve1: poolReserves?.reserve1 || 0n,
      liquidity: poolReserves?.reserve0 || 0n,
      image: coinData?.imageUrl,
      imageUrl: coinData?.imageUrl,
    };
  }, [poolReserves, poolId, coinId, coinSymbol, coinData, swapFee]);

  const filteredFarms = useMemo(() => {
    // if (activeFarms) return activeFarms;
    if (!poolFarms || !poolId) return [];
    const pid = BigInt(poolId);
    const now = BigInt(Math.floor(Date.now() / 1000));

    return poolFarms
      .filter((f) => f.lpId === pid)
      .filter((f) => f.status === "ACTIVE")
      .filter((f) => {
        const start = f.startTime ?? 0n;
        const end = f.endTime ?? 0xffffffffffffffffn; // BigInt sentinel
        return now >= start && now <= end;
      });
  }, [poolFarms, poolId]);

  useEffect(() => {
    // set hide to true if filtered farms = 0
    if (filteredFarms.length === 0) {
      setHide?.(true);
    }

    // set hide to false if filtered farms > 0
    if (filteredFarms.length > 0) {
      setHide?.(false);
    }
  }, [filteredFarms]);

  // Calculate total staked across all farms
  const totalStaked = useMemo(() => {
    if (!filteredFarms) return 0n;
    return filteredFarms.reduce(
      (acc, farm) => acc + (farm.totalShares || 0n),
      0n,
    );
  }, [filteredFarms]);

  if (isLoadingStreams) {
    return (
      <div className="space-y-4">
        <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-2 border-primary/20 rounded-lg p-6 animate-pulse">
          <div className="h-6 bg-primary/20 rounded w-1/3 mb-3"></div>
          <div className="h-4 bg-primary/20 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pool Stats */}
      {poolReserves && (
        <div className="bg-gradient-to-r from-primary/5 to-primary/10 border-2 border-primary/20 rounded-lg p-4">
          <h3 className="font-mono font-bold text-primary mb-3">
            {t("common.pool_overview")}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-background/50 border border-primary/20 rounded p-3">
              <p className="text-xs text-muted-foreground font-mono">
                {t("common.eth_liquidity")}
              </p>
              <p className="font-mono font-bold">
                {formatCompactLiquidity(
                  Number(formatEther(poolReserves.reserve0)),
                )}{" "}
                ETH
              </p>
            </div>
            <div className="bg-background/50 border border-primary/20 rounded p-3">
              <p className="text-xs text-muted-foreground font-mono">
                {coinSymbol || coinData?.symbol || "Token"}{" "}
                {t("common.reserves")}
              </p>
              <p className="font-mono font-bold">
                {formatCompactLiquidity(
                  Number(formatEther(poolReserves.reserve1)),
                )}{" "}
                {coinSymbol || coinData?.symbol || ""}
              </p>
            </div>
            {totalStaked > 0n && (
              <div className="bg-background/50 border border-primary/20 rounded p-3">
                <p className="text-xs text-muted-foreground font-mono">
                  {t("common.total_staked")}
                </p>
                <p className="font-mono font-bold">
                  {formatCompactLiquidity(Number(formatEther(totalStaked)))} LP
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active Farms */}
      {filteredFarms && filteredFarms.length > 0 ? (
        <div className="space-y-4">
          <h3 className="font-mono font-bold text-primary text-sm uppercase tracking-wider">
            {t("active_farms")} ({filteredFarms.length})
          </h3>
          {filteredFarms.map((stream) => {
            // Ensure stream has required properties before rendering
            if (!stream || !stream.chefId) {
              return null;
            }
            return (
              <IncentiveStreamCard
                key={stream.chefId.toString()}
                stream={stream}
                lpToken={lpToken}
              />
            );
          })}
        </div>
      ) : (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>{t("no_active_farms_for_pool")}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};
