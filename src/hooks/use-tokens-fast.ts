/*  src/hooks/use-tokens-fast.ts
 *  — ultra‑lean token loader that keeps your existing on‑chain helper.
 *    • instant first paint
 *    • virtualised dropdown support
 *    • lazy balances & images
 */

import {
    useAccount,
    usePublicClient,
    useBalance,
  } from "wagmi";
  import { mainnet } from "viem/chains";
  import { useState, useEffect, useCallback } from "react";
  import {
    CoinsMetadataHelperAbi,
    CoinsMetadataHelperAddress,
  } from "@/constants/CoinsMetadataHelper";
  
  /* ---------- exported type ---------- */
  export interface TokenMeta {
    id: bigint | null;             // null = ETH
    name: string;
    symbol: string;
    tokenUri?: string;
    reserve0?: bigint;
    reserve1?: bigint;
    poolId?: bigint;
    liquidity?: bigint;
    balance?: bigint;
    lpBalance?: bigint;
  }
  
  /* ---------- ETH skeleton ---------- */
  // Inline SVG for ETH
const ETH_SVG = `<svg fill="#000000" width="800px" height="800px" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
<g fill-rule="evenodd">
<path d="M16 32C7.163 32 0 24.837 0 16S7.163 0 16 0s16 7.163 16 16-7.163 16-16 16zm7.994-15.781L16.498 4 9 16.22l7.498 4.353 7.496-4.354zM24 17.616l-7.502 4.351L9 17.617l7.498 10.378L24 17.616z"/>
<g fill-rule="nonzero">
<path fill-opacity=".298" d="M16.498 4v8.87l7.497 3.35zm0 17.968v6.027L24 17.616z"/>
<path fill-opacity=".801" d="M16.498 20.573l7.497-4.353-7.497-3.348z"/>
<path fill-opacity=".298" d="M9 16.22l7.498 4.353v-7.701z"/>
</g>
</g>
</svg>`;

export const ETH_TOKEN: TokenMeta = {
    id: null,
    name: "Ether",
    symbol: "ETH",
    tokenUri: `data:image/svg+xml;base64,${btoa(ETH_SVG)}`,
  };
  
  /* ---------- main hook ---------- */
  export const useTokensFast = () => {
    const pc = usePublicClient({ chainId: mainnet.id });
    const { address } = useAccount();
  
    const [tokens, setTokens] = useState<TokenMeta[]>([ETH_TOKEN]);
    const [loading, setLoading] = useState(true);
  
    /* 1 ─ ETH balance (updates without re‑sorting) */
    const { data: ethBal } = useBalance({
      address,
      chainId: mainnet.id,
    });
  
    useEffect(() => {
      if (!ethBal) return;
      setTokens((prev) =>
        prev.map((t) =>
          t.id === null ? { ...t, balance: ethBal.value } : t,
        ),
      );
    }, [ethBal]);
  
    /* 2 ─ one‑shot bulk load + idle patch */
    useEffect(() => {
      let cancelled = false;
  
      (async () => {
        const raw = (await pc.readContract({
          address: CoinsMetadataHelperAddress,
          abi: CoinsMetadataHelperAbi,
          functionName: "getAllCoinsData",
        })) as {
          coinId: bigint;
          name: string;
          symbol: string;
          tokenURI: string;
          reserve0: bigint;
          reserve1: bigint;
          poolId: bigint;
          liquidity: bigint;
        }[];
  
        if (cancelled) return;
  
        /* phase‑1: fast fields only */
        const fast = raw
          .map((c) => ({
            id: c.coinId,
            name: "",                // fill later
            symbol: c.symbol,
            reserve0: c.reserve0,
            reserve1: c.reserve1,
            poolId: c.poolId,
            liquidity: c.liquidity,
          }))
          .sort((a, b) =>
            (b.reserve0 ?? 0n) > (a.reserve0 ?? 0n) ? 1 : -1,
          );
  
        setTokens((prev) => [prev[0], ...fast]);
        setLoading(false);
  
        /* phase‑2: heavy strings patched during idle time */
        requestIdleCallback?.(() => {
          setTokens((prev) =>
            prev.map((t) => {
              if (t.id === null) return t;
              const full = raw.find((r) => r.coinId === t.id)!;
              return { ...t, name: full.name, tokenUri: full.tokenURI };
            }),
          );
        });
      })();
  
      return () => {
        cancelled = true;
      };
    }, [pc]);
  
    /* 3 ─ visible‑row balance patcher (called by dropdown) */
    const patchBalances = useCallback(
      async (ids: bigint[]) => {
        if (!address || !ids.length) return;
  
        const [, coinBal, lpBal] = (await pc.readContract({
          address: CoinsMetadataHelperAddress,
          abi: CoinsMetadataHelperAbi,
          functionName: "getUserBalances",
          args: [address, 0n, BigInt(ids.length - 1)],
        })) as [bigint, bigint[], bigint[]];
  
        setTokens((prev) =>
          prev.map((t) => {
            const idx = ids.indexOf(t.id as bigint);
            return idx === -1
              ? t
              : { ...t, balance: coinBal[idx], lpBalance: lpBal[idx] };
          }),
        );
      },
      [address, pc],
    );
  
    return { tokens, loading, patchBalances };
  };
  