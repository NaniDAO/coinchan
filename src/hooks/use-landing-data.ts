import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { formatUnits } from "viem";
import { useTranslation } from "react-i18next";
import { CheckTheChainAbi, CheckTheChainAddress } from "@/constants/CheckTheChain";

export interface LandingData {
  ethPrice: string;
  gasPrice: string;
  launchCost: string;
  coinCost: string;
}

export const useRandomLoadingText = () => {
  const { t } = useTranslation();
  const loadingTips = t("landing.loading_tips", { returnObjects: true }) as string[];

  const getRandomLoadingText = () => {
    const randomIndex = Math.floor(Math.random() * loadingTips.length);
    return loadingTips[randomIndex];
  };

  return getRandomLoadingText;
};

const LAUNCH_COST_GAS = 365030n;
const COIN_COST_GAS = 54938n;

export const useLandingData = () => {
  const publicClient = usePublicClient();

  return useQuery<LandingData>({
    queryKey: ["landing-data"],
    queryFn: async () => {
      if (!publicClient) {
        throw new Error("Public client not available");
      }

      const [gasPrice, ethPrice] = await Promise.all([
        publicClient.getGasPrice(),
        publicClient.readContract({
          address: CheckTheChainAddress,
          abi: CheckTheChainAbi,
          functionName: "checkPrice",
          args: ["WETH"],
        }),
      ]);

      const ethPriceUsd = Number(ethPrice[1]);

      const launchCostUsd = Number(formatUnits(LAUNCH_COST_GAS * gasPrice, 18)) * ethPriceUsd;

      const coinCostUsd = Number(formatUnits(COIN_COST_GAS * gasPrice, 18)) * ethPriceUsd;

      return {
        ethPrice: `$${ethPriceUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        gasPrice: Number(formatUnits(gasPrice, 9)).toFixed(2) + " GWEI",
        launchCost: `$${launchCostUsd.toFixed(2)}`,
        coinCost: `$${coinCostUsd.toFixed(2)}`,
      };
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    retry: 3,
  });
};
