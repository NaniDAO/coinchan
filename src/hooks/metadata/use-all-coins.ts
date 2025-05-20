import { usePublicClient, useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";
import { mainnet } from "viem/chains";
import {
  ETH_TOKEN,
  USDT_TOKEN,
  TokenMeta,
  USDT_POOL_ID,
  USDT_ADDRESS,
} from "@/lib/coins";
import { CoinchanAbi, CoinchanAddress } from "@/constants/Coinchan";
import { CoinsAbi, CoinsAddress } from "@/constants/Coins";
import {
  CoinsMetadataHelperAbi,
  CoinsMetadataHelperAddress,
} from "@/constants/CoinsMetadataHelper";
import { ZAAMAbi, ZAAMAddress } from "@/constants/ZAAM";
import { SWAP_FEE } from "@/lib/swap";

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

/**
 * Fetch all on-chain coins and USDT (excluding ETH)
 */
async function fetchOtherCoins(
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
      : [
          coin.coinId,
          coin.tokenURI,
          coin.reserve0,
          coin.reserve1,
          coin.poolId,
          coin.liquidity,
        ];
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
      address: ZAAMAddress,
      abi: ZAAMAbi,
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
          inputs: [
            { internalType: "address", name: "account", type: "address" },
          ],
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
  const sortedCoins = coins.sort((a, b) =>
    Number((b.reserve0 || 0n) - (a.reserve0 || 0n)),
  );
  return [...sortedCoins, usdtToken];
}

/**
 * Hook leveraging React Query with separate ETH balance query
 */
export function useAllCoins() {
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const { address } = useAccount();

  // ETH balance query
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

  // Other coins query
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
