import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { formatUnits } from "viem";
import {
  CheckTheChainAbi,
  CheckTheChainAddress,
} from "@/constants/CheckTheChain";

export interface LandingData {
  ethPrice: string;
  gasPrice: string;
  launchCost: string;
}

export const loadingStateTips = [
  "Tip: Limit orders let you set your desired price and walk away - no need to watch charts all day!",
  "Did you know? ERC6909 tokens are more gas-efficient than traditional ERC20s, saving you money on every trade.",
  "Pro tip: Always check the gas price before making large trades - sometimes waiting an hour can save you significant fees.",
  "Zamm is a singleton DEX, meaning all liquidity is pooled together for better prices and deeper markets.",
  "Remember: High gas prices during network congestion affect everyone - patience can save you money.",
  "Fact: Slippage tolerance protects you from price movements during trade execution, but setting it too low might cause failures.",
  "Trading wisdom: Dollar-cost averaging into positions can help reduce the impact of market volatility.",
  "The best traders know when not to trade - sometimes the best move is no move at all.",
  "Tip: Limit orders can be used both for buying dips and taking profits at target prices.",
  "ERC6909's multi-token standard allows for more efficient batch operations compared to individual ERC20 transfers.",
  "Market insight: Liquidity tends to be lower during off-peak hours, which may result in higher slippage.",
  "Remember: Never invest more than you can afford to lose - DeFi markets can be volatile.",
  "Pro tip: Check multiple sources for token information before trading unfamiliar assets.",
  "Gas optimization: Bundling multiple operations can sometimes be more efficient than separate transactions.",
  "Zamm's architecture ensures that your trades get the best available prices across all available liquidity.",
  "Fun fact: Checking charts every 5 minutes doesn't make your portfolio go up faster, but it does make time go slower.",
  "Remember: 'Buy the dip' works great until you realize it's actually a canyon, not a dip.",
  "Pro tip: If you're stress-eating while trading, you're either doing it wrong or you're doing it very, very right.",
  "Wisdom: The market can stay irrational longer than your coffee can stay warm.",
  "Truth: Every crypto influencer's prediction is 100% accurate... until it isn't.",
  "Life hack: Diamond hands are great, but sometimes you need opposable thumbs to actually trade.",
  "Reality check: Your technical analysis is very impressive, but the market didn't read your charts.",
  "Fact: Whales don't actually live in the ocean - they live in your notifications, moving markets at 3 AM.",
  "Reminder: HODL is not just a typo, it's a lifestyle choice that may or may not pay your rent.",
  "Warning: Gas fees may cause sudden urges to become a Bitcoin maximalist.",
];

export const getRandomLoadingText = () => {
  const randomIndex = Math.floor(Math.random() * loadingStateTips.length);
  return loadingStateTips[randomIndex];
};

const LAUNCH_COST_GAS = 365030n;

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

      const launchCostUsd =
        Number(formatUnits(LAUNCH_COST_GAS * gasPrice, 18)) * ethPriceUsd;

      return {
        ethPrice: `$${ethPriceUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        gasPrice: Number(formatUnits(gasPrice, 9)).toFixed(2) + " GWEI",
        launchCost: launchCostUsd.toFixed(2).toString() + " $",
      };
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    retry: 3,
  });
};
