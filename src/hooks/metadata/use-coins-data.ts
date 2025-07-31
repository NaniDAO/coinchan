import { CoinsMetadataHelperAbi, CoinsMetadataHelperAddress } from "@/constants/CoinsMetadataHelper";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { ZAMMAbi, ZAMMAddress } from "@/constants/ZAAM";
import { useQuery } from "@tanstack/react-query";
import { http, createPublicClient } from "viem";
import { mainnet } from "viem/chains";
import { type CoinData, type RawCoinData, enrichMetadata, hydrateRawCoin } from "./coin-utils";
import { CULT_TOKEN, CULT_POOL_ID, ENS_TOKEN, ENS_POOL_ID, USDT_TOKEN, USDT_POOL_ID } from "@/lib/coins";

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http("https://eth-mainnet.g.alchemy.com/v2/demo"),
});

export const getVotesForAllCoins = async () => {
  const data = await fetch(import.meta.env.VITE_ZAMMHUB_URL + "/api/votes").then((res) => res.json());

  return data as Record<string, string>;
};

export function useCoinsData() {
  return useQuery<CoinData[], Error>({
    queryKey: ["coins-data"],
    queryFn: async () => {
      try {
        const resp = await fetch(`${import.meta.env.VITE_INDEXER_URL}/api/coins`);
        if (!resp.ok) {
          throw new Error(`Indexer error: ${resp.statusText}`);
        }

        const raw = (await resp.json()) as Array<{
          coinId: string;
          tokenURI: string;
          name: string;
          symbol: string;
          description: string;
          imageUrl: string;
          decimals: number;
          poolId: string | null;
          reserve0: string;
          reserve1: string;
          priceInEth: number | null;
          createdAt: number;
          saleStatus: "ACTIVE" | "EXPIRED" | "FINALIZED" | null;
          votes: string;
        }>;

        const indexerCoins = raw.map((c) => ({
          coinId: BigInt(c.coinId),
          tokenURI: c.tokenURI,
          reserve0: BigInt(c.reserve0),
          reserve1: BigInt(c.reserve1),
          poolId: c.poolId ? BigInt(c.poolId) : 0n,
          liquidity: 0n, // or compute server-side if you like
          name: c.name,
          symbol: c.symbol,
          description: c.description,
          imageUrl: c.imageUrl,
          createdAt: Number(c.createdAt),
          priceInEth: c.priceInEth,
          votes: BigInt(c.votes),
          saleStatus: c.saleStatus,
        }));

        // Fetch reserves for ENS and CULT
        let ensReserves = { reserve0: 0n, reserve1: 0n };
        let cultReserves = { reserve0: 0n, reserve1: 0n };
        let usdtReserves = { reserve0: 0n, reserve1: 0n };

        try {
          const [ensPool, cultPool, usdtPool] = await Promise.all([
            publicClient.readContract({
              address: CookbookAddress,
              abi: CookbookAbi,
              functionName: "pools",
              args: [ENS_POOL_ID],
            }),
            publicClient.readContract({
              address: CookbookAddress,
              abi: CookbookAbi,
              functionName: "pools",
              args: [CULT_POOL_ID],
            }),
            publicClient.readContract({
              address: ZAMMAddress,
              abi: ZAMMAbi,
              functionName: "pools",
              args: [USDT_POOL_ID],
            }),
          ]);

          ensReserves = { reserve0: ensPool[0], reserve1: ensPool[1] };
          cultReserves = { reserve0: cultPool[0], reserve1: cultPool[1] };
          usdtReserves = { reserve0: usdtPool[0], reserve1: usdtPool[1] };
        } catch (err) {
          console.warn("Failed to fetch ENS/CULT/USDT reserves:", err);
        }

        // Add ENS, CULT, and USDT as CoinData
        const ensData: CoinData = {
          coinId: ENS_TOKEN.id ?? 0n,
          tokenURI: ENS_TOKEN.tokenUri || "",
          reserve0: ensReserves.reserve0,
          reserve1: ensReserves.reserve1,
          poolId: ENS_POOL_ID,
          liquidity: 0n,
          name: ENS_TOKEN.name,
          symbol: ENS_TOKEN.symbol,
          description: "Ethereum Name Service governance token",
          imageUrl: ENS_TOKEN.imageUrl || "/ens.svg",
          createdAt: 1638316800, // ENS launch date
          priceInEth: null,
          votes: 0n,
          saleStatus: null,
        };

        const cultData: CoinData = {
          coinId: CULT_TOKEN.id ?? 999999n,
          tokenURI: CULT_TOKEN.tokenUri || "",
          reserve0: cultReserves.reserve0,
          reserve1: cultReserves.reserve1,
          poolId: CULT_POOL_ID,
          liquidity: 0n,
          name: CULT_TOKEN.name,
          symbol: CULT_TOKEN.symbol,
          description: "Milady Cult Coin - powered by CultHook",
          imageUrl: CULT_TOKEN.imageUrl || "/cult.jpg",
          createdAt: 1700000000, // Approximate CULT launch
          priceInEth: null,
          votes: 0n,
          saleStatus: null,
        };

        const usdtData: CoinData = {
          coinId: USDT_TOKEN.id ?? 9999999n,
          tokenURI: USDT_TOKEN.tokenUri || "",
          reserve0: usdtReserves.reserve0,
          reserve1: usdtReserves.reserve1,
          poolId: USDT_POOL_ID,
          liquidity: 0n,
          name: USDT_TOKEN.name,
          symbol: USDT_TOKEN.symbol,
          description: "Tether USD stablecoin",
          imageUrl: USDT_TOKEN.imageUrl || "",
          createdAt: 1500000000, // Approximate USDT launch
          priceInEth: null,
          votes: 0n,
          saleStatus: null,
        };

        // Filter out any existing ENS, CULT, or USDT entries from the indexer to avoid duplicates
        const filteredIndexerCoins = indexerCoins.filter(
          (coin) => coin.symbol !== "ENS" && coin.symbol !== "CULT" && coin.symbol !== "USDT"
        );

        return [...filteredIndexerCoins, ensData, cultData, usdtData];
      } catch (err) {
        console.warn("Fetch failed, falling back to RPC:", err);

        // --- your existing RPC fallback below unchanged ---
        const rawRpc = (await publicClient.readContract({
          address: CoinsMetadataHelperAddress,
          abi: CoinsMetadataHelperAbi,
          functionName: "getAllCoinsData",
        })) as any[];

        const raws: RawCoinData[] = rawRpc.map((rc: any) => {
          const arr = Array.isArray(rc)
            ? rc
            : [rc.coinId, rc.tokenURI, rc.reserve0, rc.reserve1, rc.poolId, rc.liquidity];
          const [coinId, tokenURI, reserve0, reserve1, poolId, liquidity] = arr;
          return {
            coinId: BigInt(coinId ?? 0),
            tokenURI: tokenURI?.toString() ?? "",
            reserve0: BigInt(reserve0 ?? 0),
            reserve1: BigInt(reserve1 ?? 0),
            poolId: BigInt(poolId ?? 0),
            liquidity: BigInt(liquidity ?? 0),
            createdAt: undefined,
          };
        });

        const coinsData = raws.map(hydrateRawCoin).map(enrichMetadata);
        return Promise.all(coinsData);
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}
