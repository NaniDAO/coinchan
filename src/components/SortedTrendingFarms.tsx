import { useCombinedApr } from "@/hooks/use-combined-apr";
import { useIncentiveStream } from "@/hooks/use-incentive-stream";
import { usePoolApy } from "@/hooks/use-pool-apy";
import { useZChefPool } from "@/hooks/use-zchef-contract";
import { JPYC_POOL_ID, JPYC_TOKEN, JPYC_FARM_CHEF_ID } from "@/lib/coins";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { TrendingFarm } from "./TrendingFarm";
import { LoadingLogo } from "./ui/loading-logo";

interface FarmConfig {
  id: string;
  chefId?: string;
  url: string;
  imgUrl?: string;
  color?: string;
  isJpyc?: boolean;
}

const FARM_CONFIGS: FarmConfig[] = [
  {
    id: "wlfi",
    chefId: "4753336069341144815480881976275515062700439895685858969634251725712618967096",
    url: "/wlfi",
    imgUrl: "/wlfi.png",
    color: "var(--diamond-gold)",
  },
  {
    id: "farm-1",
    chefId: "2774204975865484998625983578957308881936129866247490838637631956688562044384",
    url: "/stake",
  },
  {
    id: "ens",
    chefId: "12765013073856762050559588919702526147788652705749016564979941683606005588033",
    url: "/ens",
    imgUrl: "/ens.svg",
    color: "var(--diamond-blue)",
  },
  {
    id: "jpyc",
    chefId: JPYC_FARM_CHEF_ID.toString(),
    url: "/jpyc",
    imgUrl: "https://content.wrappr.wtf/ipfs/bafkreigzo74zz6wlriztpznhuqxbh4nrucakv7dg6dxbroxlofzedthpce",
    color: "#4A90E2",
    isJpyc: true,
  },
];

/**
 * Hook to fetch APR for a single farm
 */
const useFarmApr = (config: FarmConfig) => {
  // Regular farm data
  const { data: streamData } = useIncentiveStream(config.chefId || "");
  const { data: poolData } = useZChefPool(config.chefId ? BigInt(config.chefId) : 0n);

  const regularAprData = useCombinedApr({
    stream:
      streamData?.stream && poolData?.[7] ? { ...streamData?.stream, totalShares: poolData?.[7] } : streamData?.stream,
    lpToken: streamData?.lpToken,
    enabled: !config.isJpyc && !!config.chefId,
  });

  // JPYC-specific data
  const { data: jpycPoolApr } = usePoolApy(JPYC_POOL_ID.toString(), "COOKBOOK");
  const { data: jpycStreamData } = useIncentiveStream(config.isJpyc && config.chefId ? config.chefId : "");
  const { data: jpycPoolData } = useZChefPool(config.isJpyc && config.chefId ? BigInt(config.chefId) : 0n);

  const jpycAprData = useCombinedApr({
    stream:
      jpycStreamData?.stream && jpycPoolData?.[7]
        ? { ...jpycStreamData?.stream, totalShares: jpycPoolData?.[7] }
        : jpycStreamData?.stream,
    lpToken: JPYC_TOKEN,
    enabled: config.isJpyc && !!config.chefId,
  });

  // Calculate total APR
  const totalApr = useMemo(() => {
    if (config.isJpyc) {
      const baseApr = jpycPoolApr ? Number.parseFloat(jpycPoolApr.replace("%", "")) : 0;
      return baseApr + (jpycAprData?.farmApr || 0);
    }
    return regularAprData?.totalApr || 0;
  }, [config.isJpyc, jpycPoolApr, jpycAprData, regularAprData]);

  const ticker = config.isJpyc ? "JPYC" : streamData?.lpToken?.symbol;

  return {
    totalApr,
    ticker,
    isLoading: config.isJpyc ? !jpycPoolApr || !jpycStreamData : !streamData,
  };
};

/**
 * Component that renders trending farms sorted by APR
 */
export const SortedTrendingFarms = () => {
  const navigate = useNavigate();

  // Fetch APR for all farms
  const farmAprs = FARM_CONFIGS.map((config) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const aprData = useFarmApr(config);
    return { config, ...aprData };
  });

  // Sort by totalApr descending
  const sortedFarms = useMemo(() => {
    return [...farmAprs].sort((a, b) => b.totalApr - a.totalApr);
  }, [farmAprs]);

  return (
    <div className="space-y-0 text-xs">
      {sortedFarms.map((farm) => {
        if (farm.config.isJpyc) {
          // Render JPYC manually
          return (
            <div key={farm.config.id} className="w-fit text-lg">
              <button
                type="button"
                onClick={() => navigate({ to: farm.config.url })}
                className="flex flex-row items-center hover:underline cursor-pointer"
              >
                <span className="text-muted-foreground">└── </span>
                <img src={farm.config.imgUrl} alt="JPYC" className="w-4 h-4 mr-2 rounded-full" />
                <span className="font-bold" style={{ color: farm.config.color }}>
                  JPYC
                </span>
                {farm.totalApr > 0 && <span className="text-muted-foreground">({farm.totalApr.toFixed(3)}%)</span>}
                {farm.totalApr === 0 && <span className="text-muted-foreground text-xs ml-1">(Smart Zap)</span>}
              </button>
            </div>
          );
        }

        // Render regular farm - chefId is guaranteed to exist for non-JPYC farms
        if (!farm.config.chefId) return null;

        return (
          <ErrorBoundary key={farm.config.id} fallback={<LoadingLogo />}>
            <TrendingFarm
              chefId={farm.config.chefId}
              url={farm.config.url}
              imgUrl={farm.config.imgUrl}
              color={farm.config.color}
            />
          </ErrorBoundary>
        );
      })}
    </div>
  );
};
