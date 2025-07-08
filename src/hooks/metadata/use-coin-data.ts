import { CoinsMetadataHelperAbi, CoinsMetadataHelperAddress } from "@/constants/CoinsMetadataHelper";
import { useQuery } from "@tanstack/react-query";
import { mainnet } from "viem/chains";
import { useReadContract } from "wagmi";
import type { CoinData } from "./coin-utils";

/**
 * Hook to access data for a single coin
 * First tries to get the data from the global cache, then falls back to a direct contract call
 */
export function useCoinData(coinId: bigint) {
  const { data: rawData } = useReadContract({
    address: CoinsMetadataHelperAddress,
    abi: CoinsMetadataHelperAbi,
    functionName: "getCoinData",
    args: [coinId],
    chainId: mainnet.id,
  });
  // Direct query for a single coin as a fallback
  return useQuery({
    queryKey: ["coinData", coinId.toString()],
    queryFn: async () => {
      const data = await processRawCoinData(rawData as any);

      const coinData: CoinData & {
        marketCapEth: number | undefined;
      } = {
        ...data,
        marketCapEth: undefined,
      };
      if (data && data.priceInEth) {
        const FIXED_SUPPLY = 21_000_000;
        coinData.marketCapEth = data.priceInEth * FIXED_SUPPLY;
      }

      return coinData;
    },
    enabled: !!rawData,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  });
}

// Helper function to process raw coin data from the contract
async function processRawCoinData(rawData: any): Promise<CoinData> {
  // Extract the fields
  const coinData = {
    coinId: rawData.coinId,
    tokenURI: rawData.tokenURI,
    reserve0: rawData.reserve0,
    reserve1: rawData.reserve1,
    poolId: rawData.poolId,
    liquidity: rawData.liquidity,
    name: null,
    symbol: null,
    description: null,
    imageUrl: null,
    metadata: null,
    priceInEth: null,
    votes: undefined,
  };

  // Calculate price in ETH if reserves are available
  if (coinData.reserve0 > 0n && coinData.reserve1 > 0n) {
    const r0 = Number.parseFloat(coinData.reserve0.toString()) / 1e18;
    const r1 = Number.parseFloat(coinData.reserve1.toString()) / 1e18;
    // @ts-ignore
    coinData.priceInEth = r0 / r1;
  }

  // Try to fetch metadata
  if (coinData.tokenURI && coinData.tokenURI !== "N/A") {
    try {
      // Handle IPFS URIs
      let uri = coinData.tokenURI.trim();
      if (uri.startsWith("ipfs://")) {
        uri = `https://content.wrappr.wtf/ipfs/${uri.slice(7)}`;
      }

      // Only proceed if it's an HTTP URI
      if (uri.startsWith("http")) {
        const response = await fetch(uri);
        if (response.ok) {
          const metadata = await response.json();

          // Extract common fields
          coinData.name = metadata.name || null;
          coinData.symbol = metadata.symbol || null;
          coinData.description = metadata.description || null;
          coinData.metadata = metadata;

          // Process image URL if present
          if (metadata.image) {
            if (metadata.image.startsWith("ipfs://")) {
              // @ts-ignore
              coinData.imageUrl = `https://content.wrappr.wtf/ipfs/${metadata.image.slice(7)}`;
            } else {
              coinData.imageUrl = metadata.image;
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error processing metadata for coin ${coinData.coinId.toString()}:`, error);
      // We'll just continue with the partial data
    }
  }

  return coinData;
}
