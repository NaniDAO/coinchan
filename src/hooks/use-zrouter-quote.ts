import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, parseUnits } from "viem";
import type { PublicClient } from "viem";
import { quote } from "zrouter-sdk";
import type { TokenMeta } from "@/lib/coins";
import { toZRouterToken } from "@/lib/zrouter";

type Side = "EXACT_IN" | "EXACT_OUT";

export interface UseZRouterQuoteArgs {
  publicClient?: PublicClient | null;
  sellToken?: TokenMeta | null;
  buyToken?: TokenMeta | null;
  /** raw user input as a string (e.g. "1.25") */
  rawAmount?: string;
  /** which side the user edited */
  side: Side;
  /** toggle the query; defaults to auto-enabled when inputs are valid */
  enabled?: boolean;
}

export interface ZRouterQuoteResult {
  ok: boolean;
  amountIn?: string;
  amountOut?: string;
}

function isValidNumberLike(v?: string) {
  if (!v) return false;
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

/**
 * A single-source-of-truth quote hook.
 * - Runs exactly once per (tokenIn, tokenOut, side, rawAmount, decimals) tuple.
 * - No refetch on window focus/reconnect.
 * - Stays "fresh" forever for the same key (staleTime: Infinity).
 */
export function useZRouterQuote({ publicClient, sellToken, buyToken, rawAmount, side, enabled }: UseZRouterQuoteArgs) {
  // Resolve tokens & decimals once
  const tokenIn = useMemo(() => toZRouterToken(sellToken || undefined), [sellToken]);
  const tokenOut = useMemo(() => toZRouterToken(buyToken || undefined), [buyToken]);
  const sellDecimals = sellToken?.decimals ?? 18;
  const buyDecimals = buyToken?.decimals ?? 18;

  // Compute the viem "amount" input up-front (to freeze the queryKey precisely on what matters)
  const parsedAmount = useMemo(() => {
    if (!isValidNumberLike(rawAmount)) return undefined;
    const dec = side === "EXACT_IN" ? sellDecimals : buyDecimals;
    try {
      return parseUnits(rawAmount!, dec);
    } catch {
      return undefined;
    }
  }, [rawAmount, side, sellDecimals, buyDecimals]);

  // Build a stable query key so React Query only runs when any part changes
  const queryKey = useMemo(
    () =>
      [
        "zrouter-quote",
        side,
        // key parts must be serializable/stable; we use address+id to represent tokens
        tokenIn?.address ?? null,
        // if token has an id include it, else null
        (tokenIn as any)?.id?.toString() ?? null,
        tokenOut?.address ?? null,
        (tokenOut as any)?.id?.toString() ?? null,
        parsedAmount?.toString() ?? null,
        sellDecimals?.toString(),
        buyDecimals?.toString(),
      ] as const,
    [side, tokenIn, tokenOut, parsedAmount, sellDecimals, buyDecimals],
  );

  const autoEnabled = !!publicClient && !!tokenIn && !!tokenOut && !!parsedAmount;

  return useQuery<ZRouterQuoteResult>({
    queryKey,
    enabled: enabled ?? autoEnabled,
    // run once, and don't try again automatically
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // don't mark as stale; same inputs -> never recompute until something changes
    staleTime: Infinity,
    gcTime: 15 * 60 * 1000, // keep for 15 mins; adjust if you want longer caching
    queryFn: async () => {
      // Safety guards (also protect against TS narrowing)
      if (!publicClient || !tokenIn || !tokenOut || !parsedAmount) return { ok: false };

      // Ask zrouter for a quote
      const res = await quote(publicClient, {
        tokenIn,
        tokenOut,
        amount: parsedAmount,
        side,
      });

      if (side === "EXACT_IN") {
        const out = formatUnits(res.amountOut, buyDecimals);
        return { ok: true, amountIn: rawAmount, amountOut: out };
      } else {
        const inp = formatUnits(res.amountIn, sellDecimals);
        return { ok: true, amountIn: inp, amountOut: rawAmount };
      }
    },
  });
}
