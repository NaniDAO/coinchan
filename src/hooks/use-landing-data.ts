import {
  CheckTheChainAbi,
  CheckTheChainAddress,
} from "@/constants/CheckTheChain";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { formatUnits } from "viem";
import { mainnet } from "viem/chains";
import { usePublicClient } from "wagmi";

export interface LandingData {
  ethPrice: string;
  gasPrice: string;
  launchCost: string;
  coinCost: string;
}

export const useRandomLoadingText = () => {
  const { t } = useTranslation();
  const loadingTips = t("landing.loading_tips", {
    returnObjects: true,
  }) as string[];

  const getRandomLoadingText = () => {
    const randomIndex = Math.floor(Math.random() * loadingTips.length);
    return loadingTips[randomIndex];
  };

  return getRandomLoadingText;
};

const LAUNCH_COST_GAS = 365030n;
const COIN_COST_GAS = 54938n;

export const useLandingData = () => {
  const publicClient = usePublicClient({
    chainId: mainnet.id,
  });

  return useQuery<LandingData>({
    queryKey: ["landing"],
    queryFn: async () => {
      if (!publicClient) {
        console.error("[useLandingData] Public client not available");
        throw new Error("Public client not available");
      }

      const gasPrice = await publicClient.getGasPrice();

      const ethPrice = await publicClient.readContract({
        address: CheckTheChainAddress,
        abi: CheckTheChainAbi,
        functionName: "checkPrice",
        args: ["WETH"],
      });

      const ethPriceUsd = Number(ethPrice[1]);

      const launchCostUsd =
        Number(formatUnits(LAUNCH_COST_GAS * gasPrice, 18)) * ethPriceUsd;

      const coinCostUsd =
        Number(formatUnits(COIN_COST_GAS * gasPrice, 18)) * ethPriceUsd;

      return {
        ethPrice: `$${ethPriceUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        gasPrice: Number(formatUnits(gasPrice, 9)).toFixed(2) + " GWEI",
        launchCost: `$${launchCostUsd.toFixed(2)}`,
        coinCost: `$${coinCostUsd.toFixed(2)}`,
      };
    },
    refetchInterval: 60 * 5 * 1000, // 5 minutes in milliseconds
  });
};
