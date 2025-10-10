import { CoinchanAbi, CoinchanAddress } from "@/constants/Coinchan";
import { CoinsAbi, CoinsAddress } from "@/constants/Coins";
import { CoinsMetadataHelperAbi, CoinsMetadataHelperAddress } from "@/constants/CoinsMetadataHelper";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { ZAMMAbi, ZAMMAddress } from "@/constants/ZAAM";
import { isCookbookCoin } from "@/lib/coin-utils";
import {
  ETH_TOKEN,
  type TokenMeta,
  USDT_ADDRESS,
  USDT_POOL_ID,
  USDT_TOKEN,
  CULT_TOKEN,
  CULT_ADDRESS,
  CULT_POOL_ID,
  ENS_TOKEN,
  ENS_ADDRESS,
  ENS_POOL_ID,
  VEZAMM_TOKEN,
} from "@/lib/coins";
import { SWAP_FEE } from "@/lib/swap";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { erc20Abi } from "viem";

/**
 * Local helpers (filtering rules)
 */
const BLACKLIST_6909 = new Set(["USDC", "USDT", "DAI", "ENS", "NANI"]);
const normalizeSymbol = (s?: string | null) => (s ?? "").trim().toUpperCase();
const is6909Source = (m: TokenMeta) => m.source === "COOKBOOK" || m.source === "ZAMM";

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
  poolId: string | null;
  reserve0: string;
  reserve1: string;
  priceInEth: string;
  saleStatus: string | null;
  swapFee: string;
  votes: string;
};

async function fetchCoinPoolsViaGraphQL(): Promise<CoinData[]> {
  const res = await fetch(import.meta.env.VITE_INDEXER_URL + "/api/pools", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("GraphQL fetch failed");
  const data = await res.json();
  return data as CoinData[];
}

async function loadErc20Tokens(): Promise<TokenMeta[]> {
  const res = await fetch("/tokenlist/ethereum.tokenlist.json", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json();

  const tokens = data.tokens;

  return tokens.map((token: any) => {
    return {
      id: 0n,
      token1: token.address,
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
      source: "ERC20",
      imageUrl: token.logoURI,
    } as TokenMeta;
  });
}

/**
 * Intelligent comparator that creates tiers of tokens:
 * Tier 1: ETH (always first)
 * Tier 2: 6909 tokens with balance AND good liquidity
 * Tier 3: Well-known ERC20s with balance (USDT, USDC, DAI, etc)
 * Tier 4: 6909 tokens with balance but low liquidity
 * Tier 5: Other ERC20s with balance
 * Tier 6: 6909 tokens without balance but with liquidity
 * Tier 7: Everything else
 */
function tokenSort(a: TokenMeta, b: TokenMeta) {
  // ETH always comes first
  if (a.id === null) return -1;
  if (b.id === null) return 1;

  const aBal = a?.balance ? Number(a.balance) : 0;
  const bBal = b?.balance ? Number(b.balance) : 0;
  const aLiq = a?.reserve0 ? Number(a.reserve0) : 0;
  const bLiq = b?.reserve0 ? Number(b.reserve0) : 0;

  // Identify token types
  const aIs6909 = a.source === "COOKBOOK" || a.source === "ZAMM";
  const bIs6909 = b.source === "COOKBOOK" || b.source === "ZAMM";
  const aIsERC20 = a.source === "ERC20";
  const bIsERC20 = b.source === "ERC20";

  // Well-known stablecoins and major tokens (including CULT and ENS which have Cookbook pools)
  const majorTokens = new Set([
    "USDT",
    "USDC",
    "DAI",
    "WETH",
    "WBTC",
    "LINK",
    "UNI",
    "AAVE",
    "CRV",
    "MKR",
    "SNX",
    "COMP",
    "CULT",
    "ENS",
  ]);
  const aIsMajor = (aIsERC20 && majorTokens.has(a.symbol as string)) || a.symbol === "CULT" || a.symbol === "ENS"; // Special case for CULT/ENS
  const bIsMajor = (bIsERC20 && majorTokens.has(b.symbol as string)) || b.symbol === "CULT" || b.symbol === "ENS"; // Special case for CULT/ENS

  // Calculate liquidity scores (using log scale)
  const aLiqScore = aLiq > 0 ? Math.log10(aLiq + 1) : 0;
  const bLiqScore = bLiq > 0 ? Math.log10(bLiq + 1) : 0;

  // Define good liquidity threshold (e.g., > 0.1 ETH)
  const MIN_GOOD_LIQUIDITY = 1e17; // 0.1 ETH in wei
  const aHasGoodLiquidity = aLiq >= MIN_GOOD_LIQUIDITY;
  const bHasGoodLiquidity = bLiq >= MIN_GOOD_LIQUIDITY;

  const aHasBalance = aBal > 0;
  const bHasBalance = bBal > 0;

  // Calculate token tiers
  function getTier(
    token: TokenMeta,
    hasBalance: boolean,
    is6909: boolean,
    isERC20: boolean,
    isMajor: boolean,
    hasGoodLiq: boolean,
    liq: number,
  ): number {
    if (token.id === null) return 1; // ETH
    if (is6909 && hasBalance && hasGoodLiq) return 2; // Liquid 6909 with balance
    if (isMajor && hasBalance) return 3; // Major ERC20 with balance
    if (is6909 && hasBalance && !hasGoodLiq) return 4; // Low liquidity 6909 with balance
    if (isERC20 && hasBalance && !isMajor) return 5; // Other ERC20 with balance
    if (is6909 && !hasBalance && liq > 0) return 6; // 6909 without balance but with liquidity
    return 7; // Everything else
  }

  const aTier = getTier(a, aHasBalance, aIs6909, aIsERC20, aIsMajor, aHasGoodLiquidity, aLiq);
  const bTier = getTier(b, bHasBalance, bIs6909, bIsERC20, bIsMajor, bHasGoodLiquidity, bLiq);

  // Different tiers: lower tier number wins
  if (aTier !== bTier) return aTier - bTier;

  // Same tier: sort within tier
  if (aTier === 2 || aTier === 4) {
    // 6909 tokens with balance: sort by liquidity-weighted value
    const aBalScore = Math.log10(aBal + 1) / 20;
    const bBalScore = Math.log10(bBal + 1) / 20;
    const aScore = aLiqScore * 3 + aBalScore; // Heavily weight liquidity
    const bScore = bLiqScore * 3 + bBalScore;
    if (Math.abs(aScore - bScore) > 0.001) return bScore - aScore;
  } else if (aTier === 3 || aTier === 5) {
    // ERC20 tokens: sort by balance amount (since no liquidity data)
    if (aBal !== bBal) return bBal - aBal;
    // Then alphabetically for consistency
    return (a.symbol || "").localeCompare(b.symbol || "");
  } else if (aTier === 6) {
    // 6909 without balance: sort by liquidity
    if (aLiq !== bLiq) return bLiq - aLiq;
  }

  // Final tiebreaker: newer coins first (higher ID) for 6909, alphabetical for ERC20
  if (aIs6909 && bIs6909) {
    const aId = a?.id ? Number(a.id) : 0;
    const bId = b?.id ? Number(b.id) : 0;
    return bId - aId;
  }

  return (a.symbol || "").localeCompare(b.symbol || "");
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
    return originalFetchOtherCoins(publicClient, address);
  }

  let metas: TokenMeta[] = [];
  try {
    // map GraphQL → TokenMeta skeleton
    metas = coins
      .filter((c) => c?.coinId != null)
      .map((c) => ({
        id: BigInt(c.coinId),
        symbol: c.symbol === null ? "N/A" : c.symbol,
        name: c.name,
        tokenUri: c.tokenURI,
        imageUrl: c.imageUrl,
        reserve0: c.reserve0 !== null ? BigInt(c.reserve0) : undefined,
        reserve1: c.reserve1 !== null ? BigInt(c.reserve1) : undefined,
        poolId: c.poolId ? BigInt(c.poolId) : undefined,
        source: isCookbookCoin(BigInt(c.coinId)) ? "COOKBOOK" : "ZAMM",
        liquidity: 0n,
        swapFee: c.swapFee !== null ? BigInt(c.swapFee) : SWAP_FEE,
        balance: 0n,
      }));
  } catch (error) {
    console.error("useAllCoins: [failed to map pools to TokenMeta]", error);
  }

  // Load ERC20 list and build symbol set for collision filtering
  const erc20metas = await loadErc20Tokens();
  const erc20Symbols = new Set(erc20metas.map((t) => normalizeSymbol(t.symbol)));

  // Filter out 6909 coins that are blacklisted or collide with ERC20 symbols
  metas = metas.filter((m) => {
    if (!is6909Source(m)) return true;
    const sym = normalizeSymbol(m.symbol as string);
    if (!sym) return true;
    if (BLACKLIST_6909.has(sym)) return false;
    if (erc20Symbols.has(sym)) return false;
    return true;
  });

  // then append ERC20s
  for (const meta of erc20metas) metas.push(meta);

  // For each token, fetch balance (ERC20 and 6909)
  const withBalances = await Promise.all(
    metas.map(async (m) => {
      if (!address) return m;
      try {
        let bal = 0n;

        if (m.source === "ERC20" && m.token1) {
          // ERC20
          bal = (await publicClient.readContract({
            address: m.token1 as Address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          })) as bigint;
        } else if (m.id != null) {
          // 6909 (COOKBOOK/ZAMM)
          const isBookCoin = m.id < 1000000n;
          const contractAddress = isBookCoin ? CookbookAddress : CoinsAddress;
          const contractAbi = isBookCoin ? CookbookAbi : CoinsAbi;

          bal = (await publicClient.readContract({
            address: contractAddress,
            abi: contractAbi,
            functionName: "balanceOf",
            args: [address, m.id],
          })) as bigint;
        }

        return { ...m, balance: bal };
      } catch (error) {
        console.error(`Failed to fetch balance for ${m.source} token ${m.symbol}`, error);
        return m;
      }
    }),
  );

  // CULT pool + balance
  const cultToken = { ...CULT_TOKEN };
  try {
    const poolData = await publicClient.readContract({
      address: CookbookAddress,
      abi: CookbookAbi,
      functionName: "pools",
      args: [CULT_POOL_ID],
    });
    cultToken.reserve0 = poolData[0];
    cultToken.reserve1 = poolData[1];
  } catch {}
  if (address) {
    try {
      const cultBal = (await publicClient.readContract({
        address: CULT_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      cultToken.balance = cultBal;
    } catch {}
  }

  // ENS pool + balance
  const ensToken = { ...ENS_TOKEN };
  try {
    const poolData = await publicClient.readContract({
      address: CookbookAddress,
      abi: CookbookAbi,
      functionName: "pools",
      args: [ENS_POOL_ID],
    });
    ensToken.reserve0 = poolData[0];
    ensToken.reserve1 = poolData[1];
  } catch {}

  if (address) {
    try {
      const ensBalance = (await publicClient.readContract({
        address: ENS_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      ensToken.balance = ensBalance;
    } catch {}
  }

  // veZAMM token balance (ERC6909 cookbook coin with ID 87)
  const veZammToken = { ...VEZAMM_TOKEN };
  if (address) {
    try {
      const veZammBalance = (await publicClient.readContract({
        address: CookbookAddress,
        abi: CookbookAbi,
        functionName: "balanceOf",
        args: [address, 87n],
      })) as bigint;
      veZammToken.balance = veZammBalance;
    } catch {}
  }

  // Sort (balance first), then return
  return [...withBalances, ensToken, cultToken, veZammToken].sort(tokenSort);
}

/**
 * Fetch all on-chain coins and USDT (excluding ETH)
 * (legacy path; now also fetches ERC20 balances and sorts by balance first)
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
      const isBookCoin = coinId < 1000000n;
      const contractAddress = isBookCoin ? CookbookAddress : CoinsAddress;
      const contractAbi = isBookCoin ? CookbookAbi : CoinsAbi;

      balance = (await publicClient.readContract({
        address: contractAddress,
        abi: contractAbi,
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
      source: coinId < 1000000n ? "COOKBOOK" : "ZAMM",
    } as TokenMeta;
  });
  const coins = (await Promise.all(coinPromises)).filter(Boolean);

  // Build ERC20 symbol set from your tokenlist for collision filtering
  const erc20metas = await loadErc20Tokens();
  const erc20Symbols = new Set(erc20metas.map((t) => normalizeSymbol(t.symbol)));

  // Filter out 6909 coins (COOKBOOK/ZAMM) with blacklisted or ERC20-colliding symbols
  const filteredCoins = coins.filter((m) => {
    if (!is6909Source(m)) return true;
    const sym = normalizeSymbol(m.symbol as string);
    if (!sym) return true;
    if (BLACKLIST_6909.has(sym)) return false;
    if (erc20Symbols.has(sym)) return false;
    return true;
  });

  // Include ERC20 list here too (parity with GQL path)
  const withErc20 = [...filteredCoins, ...erc20metas];

  // Fetch balances for ERC20 entries
  const withBalances = await Promise.all(
    withErc20.map(async (m) => {
      if (!address) return m;
      try {
        if (m.source === "ERC20" && m.token1) {
          const bal = (await publicClient.readContract({
            address: m.token1 as Address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          })) as bigint;
          return { ...m, balance: bal };
        }
        return m;
      } catch (e) {
        console.error(`Failed to fetch ERC20 balance for ${m.symbol} @ ${m.token1}`, e);
        return m;
      }
    }),
  );

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
    try {
      const usdtBal = (await publicClient.readContract({
        address: USDT_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      usdtToken.balance = usdtBal;
    } catch {}
  }

  // CULT pool + balance
  const cultToken = { ...CULT_TOKEN };
  try {
    const poolData = await publicClient.readContract({
      address: CookbookAddress,
      abi: CookbookAbi,
      functionName: "pools",
      args: [CULT_POOL_ID],
    });
    cultToken.reserve0 = poolData[0];
    cultToken.reserve1 = poolData[1];
  } catch {}
  if (address) {
    try {
      const cultBal = (await publicClient.readContract({
        address: CULT_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      cultToken.balance = cultBal;
    } catch {}
  }

  // ENS pool + balance
  const ensToken = { ...ENS_TOKEN };
  try {
    const poolData = await publicClient.readContract({
      address: CookbookAddress,
      abi: CookbookAbi,
      functionName: "pools",
      args: [ENS_POOL_ID],
    });
    ensToken.reserve0 = poolData[0];
    ensToken.reserve1 = poolData[1];
  } catch {}
  if (address) {
    try {
      const ensBal = (await publicClient.readContract({
        address: ENS_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      ensToken.balance = ensBal;
    } catch {}
  }

  // Sort and return
  return [...withBalances, usdtToken, cultToken, ensToken].sort(tokenSort);
}

/**
 * Hook leveraging React Query with separate ETH balance query
 */
export function useAllCoins() {
  const publicClient = usePublicClient();
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
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    gcTime: 1000 * 60 * 60,
    meta: { persist: true },
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
    refetchOnMount: true,
  });

  // Combine & sort again across ETH and others to ensure global ordering
  const ethWithBalance = ethToken || ETH_TOKEN;
  const combined = [ethWithBalance, ...(otherTokens || [])];

  const loading = isEthBalanceFetching || isOtherLoading;
  const error = ethError || otherError ? "Failed to load tokens" : null;

  return {
    tokens: combined,
    tokenCount: combined.length,
    loading,
    error,
    isEthBalanceFetching,
    refetchEthBalance,
  };
}
