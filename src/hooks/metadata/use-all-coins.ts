import { CoinchanAbi, CoinchanAddress } from "@/constants/Coinchan";
import { CoinsAbi, CoinsAddress } from "@/constants/Coins";
import { CoinsMetadataHelperAbi, CoinsMetadataHelperAddress } from "@/constants/CoinsMetadataHelper";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { ZAMMAbi, ZAMMAddress } from "@/constants/ZAAM";
import { ETH_TOKEN, type TokenMeta, USDT_ADDRESS, USDT_POOL_ID, USDT_TOKEN } from "@/lib/coins";
import { SWAP_FEE } from "@/lib/swap";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { mainnet } from "viem/chains";
import { useAccount, usePublicClient } from "wagmi";

/**
 * Fetch ETH balance as TokenMeta
 */
async function fetchEthBalance(
  publicClient: ReturnType<typeof usePublicClient> | undefined,
  address: Address | undefined,
): Promise<TokenMeta> {
  if (!publicClient) throw new Error("Public client not available");
  if (address) {
    const balanceData = await publicClient.getBalance({
      address,
    });
    return {
      ...ETH_TOKEN,
      balance: balanceData,
    };
  }
  return ETH_TOKEN;
}

type CoinData = {
  coinId: string;
  tokenURI: string;
  name: string;
  symbol: string | null;
  description: string;
  imageUrl: string;
  decimals: number;
  poolId: string;
  reserve0: string;
  reserve1: string;
  priceInEth: string;
  saleStatus: string;
  swapFee: string;
  votes: string;
};

async function fetchCoinPoolsViaGraphQL(): Promise<CoinData[]> {
  const res = await fetch(import.meta.env.VITE_INDEXER_URL + "/api/coins", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("GraphQL fetch failed");
  const data = await res.json();
  return data as CoinData[];
}

/**
 * Fetch all on-chain coins **metadata** via GraphQL + user balances on-chain.
 * Falls back to your old `getAllCoinsData` helper if the GQL request errors.
 */
async function fetchOtherCoins(
  publicClient: ReturnType<typeof usePublicClient> | undefined,
  address: Address | undefined,
): Promise<TokenMeta[]> {
  if (!publicClient) throw new Error("Public client not available");

  let coins;
  try {
    coins = await fetchCoinPoolsViaGraphQL();
  } catch {
    // fallback to your original batching logic
    // (just paste your old fetchOtherCoins here)
    return originalFetchOtherCoins(publicClient, address);
  }

  let metas: TokenMeta[] = []; // Initialize metas to an empty array
  try {
    // map GraphQL → TokenMeta skeleton
    metas = coins
      .filter((c) => c?.coinId != null)
      .map((c) => ({
        id: BigInt(c.coinId),
        symbol: c.symbol === null ? "N/A" : c.symbol,
        name: c.name,
        tokenUri: c.tokenURI,
        reserve0: c.reserve0 !== null ? BigInt(c.reserve0) : undefined,
        reserve1: c.reserve1 !== null ? BigInt(c.reserve1) : undefined,
        poolId: c.poolId ? BigInt(c.poolId) : undefined,
        source: c.saleStatus === null ? "ZAMM" : "COOKBOOK",
        liquidity: 0n, // your subgraph doesn’t track total liquidity?
        swapFee: c.swapFee !== null ? BigInt(c.swapFee) : SWAP_FEE, // basis points
        balance: 0n, // to be filled in next step
      }));

    console.log("useAllCoins [TokenMeta]", {
      metas,
      defiCoin: metas.find((m) => m.id === BigInt(40)),
    });
  } catch (error) {
    console.error("useAllCoins: [failed to map pools to TokenMeta]", error);
    // metas remains [] if mapping fails
  }

  // For each coin, get balance from the correct contract based on source
  const withBalances = await Promise.all(
    metas.map(async (m) => {
      if (!address) return m;
      try {
        if (m.id == null) {
          return m;
        }

        // Use the correct contract based on source
        const contractAddress = m.source === "COOKBOOK" ? CookbookAddress : CoinsAddress;
        const contractAbi = m.source === "COOKBOOK" ? CookbookAbi : CoinsAbi;

        const balance = (await publicClient.readContract({
          address: contractAddress,
          abi: contractAbi,
          functionName: "balanceOf",
          args: [address, m.id],
        })) as bigint;

        return { ...m, balance };
      } catch (error) {
        console.error(`Failed to fetch balance for ${m.source} coin ${m.id}:`, error);
        return m;
      }
    }),
  );

  // finally tack on USDT pool as before
  const usdtToken: TokenMeta = { ...USDT_TOKEN };
  try {
    const poolData = await publicClient.readContract({
      address: ZAMMAddress,
      abi: ZAMMAbi,
      functionName: "pools",
      args: [USDT_POOL_ID],
    });
    usdtToken.reserve0 = poolData[0];
    usdtToken.reserve1 = poolData[1];
  } catch {}
  if (address) {
    try {
      const usdtBal = (await publicClient.readContract({
        address: USDT_ADDRESS,
        abi: [
          {
            inputs: [{ internalType: "address", name: "account", type: "address" }],
            name: "balanceOf",
            outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      usdtToken.balance = usdtBal;
    } catch {}
  }

  return [...withBalances, usdtToken].sort((a, b) => {
    // Safely convert to numbers, handling potential null/undefined values
    const aLiquidity = a?.reserve0 ? Number(a.reserve0) : 0;
    const bLiquidity = b?.reserve0 ? Number(b.reserve0) : 0;

    // If liquidity values are identical, use coinId as secondary sort
    if (aLiquidity === bLiquidity) {
      const aId = Number(a.id);
      const bId = Number(b.id);
      return bId - aId; // Secondary sort by coinId (newest first)
    }

    return bLiquidity - aLiquidity; // Descending (highest liquidity first)
  });
}

/**
 * Fetch all on-chain coins and USDT (excluding ETH)
 */
async function originalFetchOtherCoins(
  publicClient: ReturnType<typeof usePublicClient> | undefined,
  address: Address | undefined,
): Promise<TokenMeta[]> {
  if (!publicClient) throw new Error("Public client not available");

  // Get total number of coins
  const countResult = await publicClient.readContract({
    address: CoinchanAddress,
    abi: CoinchanAbi,
    functionName: "getCoinsCount",
  });
  const totalCoinCount = Number(countResult);

  // Fetch coins metadata (with fallback batching)
  let allCoinsData: any[];
  try {
    allCoinsData = (await publicClient.readContract({
      address: CoinsMetadataHelperAddress,
      abi: CoinsMetadataHelperAbi,
      functionName: "getAllCoinsData",
    })) as any[];
    if (allCoinsData.length < totalCoinCount) throw new Error("Incomplete");
  } catch {
    const batchSize = 50;
    const batches = [];
    for (let i = 0; i < totalCoinCount; i += batchSize) {
      batches.push(
        publicClient.readContract({
          address: CoinsMetadataHelperAddress,
          abi: CoinsMetadataHelperAbi,
          functionName: "getCoinDataBatch",
          args: [BigInt(i), BigInt(Math.min(i + batchSize, totalCoinCount))],
        }),
      );
    }
    const results = await Promise.all(batches);
    allCoinsData = results.flat();
  }

  // Transform into TokenMeta
  const coinPromises = allCoinsData.map(async (coin: any) => {
    const [id, uri, r0, r1, pid, liq] = Array.isArray(coin)
      ? coin
      : [coin.coinId, coin.tokenURI, coin.reserve0, coin.reserve1, coin.poolId, coin.liquidity];
    const coinId = BigInt(id);
    const [symbol, name, lockup] = await Promise.all([
      publicClient
        .readContract({
          address: CoinsAddress,
          abi: CoinsAbi,
          functionName: "symbol",
          args: [coinId],
        })
        .catch(() => `C#${coinId}`),
      publicClient
        .readContract({
          address: CoinsAddress,
          abi: CoinsAbi,
          functionName: "name",
          args: [coinId],
        })
        .catch(() => `Coin #${coinId}`),
      publicClient
        .readContract({
          address: CoinchanAddress,
          abi: CoinchanAbi,
          functionName: "lockups",
          args: [coinId],
        })
        .catch(() => null),
    ]);

    let swapFee = SWAP_FEE;
    if (lockup && Array.isArray(lockup) && lockup[4] > 0n) swapFee = lockup[4];

    let balance = 0n;
    if (address) {
      balance = (await publicClient.readContract({
        address: CoinsAddress,
        abi: CoinsAbi,
        functionName: "balanceOf",
        args: [address, coinId],
      })) as bigint;
    }

    return {
      id: coinId,
      symbol,
      name,
      tokenUri: uri?.toString() || "",
      reserve0: BigInt(r0 || 0),
      reserve1: BigInt(r1 || 0),
      poolId: BigInt(pid || 0),
      liquidity: BigInt(liq || 0),
      swapFee,
      balance,
    } as TokenMeta;
  });
  const coins = (await Promise.all(coinPromises)).filter(Boolean);

  // Fetch USDT-ETH pool reserves & balance
  const usdtToken: TokenMeta = { ...USDT_TOKEN };
  try {
    const poolData = (await publicClient.readContract({
      address: ZAMMAddress,
      abi: ZAMMAbi,
      functionName: "pools",
      args: [USDT_POOL_ID],
    })) as [bigint, bigint, number, bigint, bigint, bigint, bigint];
    usdtToken.reserve0 = poolData[0];
    usdtToken.reserve1 = poolData[1];
  } catch {}
  if (address) {
    const usdtBal = (await publicClient.readContract({
      address: USDT_ADDRESS,
      abi: [
        {
          inputs: [{ internalType: "address", name: "account", type: "address" }],
          name: "balanceOf",
          outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "balanceOf",
      args: [address],
    })) as bigint;
    usdtToken.balance = usdtBal;
  }

  // Sort coins by ETH reserves descending
  const sortedCoins = coins.sort((a, b) => Number((b.reserve0 || 0n) - (a.reserve0 || 0n)));
  return [...sortedCoins, usdtToken];
}

/**
 * Hook leveraging React Query with separate ETH balance query
 */
export function useAllCoins() {
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const { address } = useAccount();

  // ETH balance
  const {
    data: ethToken,
    isLoading: isEthBalanceFetching,
    isError: ethError,
    refetch: refetchEthBalance,
  } = useQuery({
    queryKey: ["ethBalance", address],
    queryFn: () => fetchEthBalance(publicClient, address),
    enabled: !!publicClient,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnMount: false,
  });

  // Other coins + pools via GraphQL → TokenMeta
  const {
    data: otherTokens,
    isLoading: isOtherLoading,
    isError: otherError,
  } = useQuery({
    queryKey: ["otherCoins", address],
    queryFn: () => fetchOtherCoins(publicClient, address),
    enabled: !!publicClient,
    staleTime: 60_000,
    refetchOnMount: false,
  });

  const tokens = [ethToken || ETH_TOKEN, ...(otherTokens || [])];
  const loading = isEthBalanceFetching || isOtherLoading;
  const error = ethError || otherError ? "Failed to load tokens" : null;

  return {
    tokens,
    tokenCount: tokens.length,
    loading,
    error,
    isEthBalanceFetching,
    refetchEthBalance,
  };
}
