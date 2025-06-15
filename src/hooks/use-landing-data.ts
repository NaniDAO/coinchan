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
  coinCost: string;
}

export const loadingStateTips = [
  "ZAMM combines constant product AMMs with embedded orderbooks - get the best of both worlds!",
  "Did you know? ZAMM uses ERC6909 multi-token standard, allowing one contract to manage all tokens efficiently.",
  "ZAMM's singleton architecture means deeper liquidity and better prices across all trading pairs.",
  "Pro tip: ZAMM's orderbook supports partial fills - your large orders can execute gradually at better prices.",
  "Ethereum trivia: Gas prices are measured in Gwei (1 Gwei = 0.000000001 ETH). Currently tracking live prices!",
  "ZAMM innovation: Transient storage enables efficient multi-hop swaps without intermediate token transfers.",
  "Fun fact: Ethereum's total value locked (TVL) in DeFi protocols exceeds $50 billion across thousands of projects.",
  "ZAMM's timelock mechanism lets you schedule token unlocks - perfect for vesting schedules and security.",
  "Ethereum history: The network launched on July 30, 2015, and has processed over 1 billion transactions since.",
  "ZAMM tip: Hook system allows custom logic before/after trades - enabling advanced DeFi strategies.",
  "Did you know? Ethereum's PoS consensus uses ~99.95% less energy than Bitcoin's PoW system.",
  "ZAMM's limit orders never expire unless you set a deadline - set and forget trading at its finest!",
  "Ethereum fact: Block times average 12 seconds, with gas limits around 30 million gas per block.",
  "ZAMM innovation: Fee collection happens via liquidity provider rewards, not direct trading fees.",
  "ZAMM's constant product formula (x * y = k) ensures liquidity is always available for trades.",
  "Ethereum trivia: The network upgrade 'The Merge' happened on September 15, 2022, switching to Proof of Stake.",
  "ZAMM tip: Minimum liquidity prevents pool draining attacks while maintaining fair token distribution.",
  "Fun fact: Ethereum's native currency is technically called 'Ether', while ETH is just the ticker symbol.",
  "ZAMM's reentrancy protection uses transient storage - gas-efficient security built into the core.",
  "ZAMM advantage: Single contract deployment means lower gas costs for all operations.",
  "Did you know? Ethereum addresses are derived from public keys using Keccak-256 hashing algorithm.",
  "ZAMM's price oracles update automatically with each trade - always reflecting true market conditions.",
  "ZAMM's orderbook entries are stored efficiently - even large order books consume minimal gas.",
  "ZAMM tip: Multi-token batching reduces transaction costs when trading multiple pairs simultaneously.",
  "Remember: Ethereum's censorship resistance makes it the backbone of decentralized finance worldwide!",
];

export const getRandomLoadingText = () => {
  const randomIndex = Math.floor(Math.random() * loadingStateTips.length);
  return loadingStateTips[randomIndex];
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
    refetchInterval: 30000, // Refetch every 30 seconds
    retry: 3,
  });
};
