import { useReadContract } from "wagmi";
import { ChainlinkAggregatorV3Abi, CHAINLINK_PRICE_FEEDS } from "@/constants/ChainlinkAggregator";
import { type Address } from "viem";

/**
 * Hook to fetch ERC20 token price in ETH using Chainlink price feeds
 * @param tokenAddress - The ERC20 token contract address
 * @returns Price in ETH (as a number), or undefined if no price feed available
 */
export const useErc20Price = ({ tokenAddress }: { tokenAddress?: Address }) => {
  // Normalize address to lowercase for case-insensitive lookup
  const normalizedAddress = tokenAddress ? tokenAddress.toLowerCase() : undefined;

  // Get the Chainlink price feed address for this token
  const priceFeedAddress = normalizedAddress
    ? CHAINLINK_PRICE_FEEDS[normalizedAddress]
    : undefined;

  // Fetch price from Chainlink
  const { data: priceData, isLoading } = useReadContract({
    address: priceFeedAddress,
    abi: ChainlinkAggregatorV3Abi,
    functionName: "latestRoundData",
    query: {
      enabled: !!priceFeedAddress,
      staleTime: 60_000, // 1 minute
      refetchInterval: 60_000, // Refetch every minute
    },
  });

  // Fetch decimals from the price feed
  const { data: decimalsData } = useReadContract({
    address: priceFeedAddress,
    abi: ChainlinkAggregatorV3Abi,
    functionName: "decimals",
    query: {
      enabled: !!priceFeedAddress,
      staleTime: 3600_000, // 1 hour (decimals don't change)
    },
  });


  // Parse price data
  if (!priceData || !decimalsData) {
    return { data: undefined, isLoading, hasPriceFeed: !!priceFeedAddress };
  }

  // priceData is [roundId, answer, startedAt, updatedAt, answeredInRound]
  const answer = priceData[1]; // answer is the price
  const decimals = Number(decimalsData);

  // Convert to ETH price (Chainlink feeds are TOKEN/ETH)
  const priceInEth = Number(answer) / 10 ** decimals;

  return {
    data: priceInEth,
    isLoading,
    hasPriceFeed: true,
  };
};
