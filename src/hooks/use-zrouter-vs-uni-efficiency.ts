import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address, PublicClient } from "viem";
import { parseUnits } from "viem";
import type { TokenMeta } from "@/lib/coins";
import { useZRouterQuote } from "./use-zrouter-quote";

/* -------------------------- constants -------------------------- */

/** Fixed gas constants for single-pool swaps (ETH -> ERC20 on Universal Router vs zRouter). */
const GAS_UNI_SINGLE = 121_856n;
const GAS_ZROUTER_SINGLE = 110_851n;

/* -------------------------- zRouter SDK imports -------------------------- */
/* We still use zRouter for price quotes via useZRouterQuote (no gas estimation here). */

/* -------------------------- constants & abi -------------------------- */

const UNISWAP_V3_QUOTER_V2: Address = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";
const WETH9: Address = "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2";

/** Minimal ABIs: only the QuoterV2 for price discovery */
const uniQuoterV2Abi = [
  {
    type: "function",
    name: "quoteExactInput",
    stateMutability: "view",
    inputs: [
      { name: "path", type: "bytes" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96AfterList", type: "uint160[]" },
      { name: "initializedTicksCrossedList", type: "uint32[]" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "quoteExactOutput",
    stateMutability: "view",
    inputs: [
      { name: "path", type: "bytes" },
      { name: "amountOut", type: "uint256" },
    ],
    outputs: [
      { name: "amountIn", type: "uint256" },
      { name: "sqrtPriceX96AfterList", type: "uint160[]" },
      { name: "initializedTicksCrossedList", type: "uint32[]" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

/* ------------------------------- utils ------------------------------- */

export type EfficiencySide = "EXACT_IN" | "EXACT_OUT";

export function isERC20orETH(t?: TokenMeta): boolean {
  if (!t) return false;
  if (t.source === "ERC20" && !!t.token1) return true;
  if (t.id === null && t.symbol === "ETH") return true; // native ETH sentinel
  return false;
}

function toHex20(addr: Address) {
  return addr.toLowerCase();
}
function feeToHex(fee: number) {
  const hex = fee.toString(16).padStart(6, "0");
  return `0x${hex}`;
}
function concatHex(...parts: string[]) {
  return (`0x` + parts.map((p) => p.replace(/^0x/, "")).join("")).toLowerCase() as `0x${string}`;
}
function buildV3Path(tokens: Address[], fees: number[]): `0x${string}` {
  const pieces: string[] = [];
  for (let i = 0; i < fees.length; i++) {
    pieces.push(toHex20(tokens[i]));
    pieces.push(feeToHex(fees[i]));
  }
  pieces.push(toHex20(tokens[tokens.length - 1]));
  return concatHex(...pieces);
}
function toAddressForUni(t: TokenMeta): Address | null {
  if (t.id === null && t.symbol === "ETH") return WETH9; // treat as WETH
  if (t.source === "ERC20" && t.token1) return t.token1 as Address;
  return null;
}

/** simple input debounce to avoid spamming queries while typing */
function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return v;
}

/* ---------------------- UniV3 best-path via multicall ---------------------- */

type UniBestParams = {
  publicClient?: PublicClient | null;
  side: EfficiencySide;
  tokenIn?: Address | null;
  tokenOut?: Address | null;
  amount: bigint; // amountIn for EXACT_IN, amountOut for EXACT_OUT
  feeTiers?: number[]; // default [500, 3000, 10000]
};

function useUniV3BestQuote({
  publicClient,
  side,
  tokenIn,
  tokenOut,
  amount,
  feeTiers = [500, 3000, 10000],
}: UniBestParams) {
  const enabled = !!publicClient && !!tokenIn && !!tokenOut && amount > 0n && tokenIn !== tokenOut;

  const chainId = publicClient?.chain?.id ?? 0;

  const { data, isFetching, isError, error } = useQuery({
    queryKey: [
      "uniV3Best",
      chainId?.toString(),
      side?.toString(),
      tokenIn?.toString(),
      tokenOut?.toString(),
      amount?.toString(),
      feeTiers.join(","),
    ],
    enabled,
    staleTime: 5_000,
    gcTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async () => {
      if (!publicClient || !tokenIn || !tokenOut) throw new Error("bad params");

      // Build candidate paths (direct + via WETH), and *reverse* for EXACT_OUT
      const direct = feeTiers.map((f) =>
        side === "EXACT_IN"
          ? {
              fn: "quoteExactInput" as const,
              args: [buildV3Path([tokenIn, tokenOut], [f]), amount] as const,
            }
          : {
              fn: "quoteExactOutput" as const,
              args: [buildV3Path([tokenOut, tokenIn], [f]), amount] as const,
            },
      );

      const viaWeth = feeTiers.flatMap((fA) =>
        feeTiers.map((fB) =>
          side === "EXACT_IN"
            ? {
                fn: "quoteExactInput" as const,
                args: [buildV3Path([tokenIn, WETH9, tokenOut], [fA, fB]), amount] as const,
              }
            : {
                fn: "quoteExactOutput" as const,
                // reverse path + reverse fees order for ExactOutput
                args: [buildV3Path([tokenOut, WETH9, tokenIn], [fB, fA]), amount] as const,
              },
        ),
      );

      const candidates = [...direct, ...viaWeth];

      const calls = candidates.map((c) => ({
        address: UNISWAP_V3_QUOTER_V2,
        abi: uniQuoterV2Abi,
        functionName: c.fn,
        args: c.args,
      }));

      // One RPC for all candidates
      const res = await publicClient.multicall({
        contracts: calls,
        allowFailure: true,
      });

      // Pick best by amount
      let bestIdx = -1;
      let bestAmount: bigint = 0n;

      for (let i = 0; i < res.length; i++) {
        const r = res[i];
        if (r.status !== "success") continue;
        const [amount0] = r.result as any;
        if (side === "EXACT_IN") {
          if ((amount0 as bigint) > bestAmount) {
            bestAmount = amount0 as bigint;
            bestIdx = i;
          }
        } else {
          // EXACT_OUT: choose smallest required input (minimize amountIn)
          if ((amount0 as bigint) > 0n && (bestAmount === 0n || (amount0 as bigint) < bestAmount)) {
            bestAmount = amount0 as bigint;
            bestIdx = i;
          }
        }
      }

      if (bestIdx < 0) {
        // No viable path
        return {
          uniAmount: 0n,
          uniGas: 0n,
          path: "0x" as `0x${string}`,
        };
      }

      // Resolve the chosen path bytes (correct orientation per side)
      const chosen = candidates[bestIdx];
      const path = chosen.args[0] as `0x${string}`;

      // Return the fixed gas constant instead of estimating
      const uniGas: bigint = GAS_UNI_SINGLE;

      return {
        uniAmount: bestAmount ?? 0n,
        uniGas,
        path,
      };
    },
  });

  return {
    uniAmount: data?.uniAmount ?? 0n,
    uniGas: data?.uniGas ?? 0n,
    path: (data?.path as `0x${string}`) ?? ("0x" as `0x${string}`),
    isFetching,
    isError,
    error: isError ? ((error as Error)?.message ?? "error") : null,
    enabled,
  };
}

/* ---------------------- Combined efficiency comparator ---------------------- */

export function useZRouterVsUniEfficiency(opts: {
  publicClient?: PublicClient | null;
  sellToken?: TokenMeta | null;
  buyToken?: TokenMeta | null;
  lastEditedField: "sell" | "buy";
  sellAmt: string;
  buyAmt: string;
}) {
  const { publicClient, sellToken, buyToken, lastEditedField, sellAmt, buyAmt } = opts;

  const side: EfficiencySide = lastEditedField === "sell" ? "EXACT_IN" : "EXACT_OUT";

  const inDecimals = sellToken?.decimals ?? 18;
  const outDecimals = buyToken?.decimals ?? 18;

  // Debounce raw user inputs to limit query churn
  const debouncedSell = useDebouncedValue(sellAmt, 250);
  const debouncedBuy = useDebouncedValue(buyAmt, 250);

  // zRouter quote (keep existing hook; just allow it to debounce via params)
  const zQuote = useZRouterQuote({
    publicClient: publicClient ?? undefined,
    sellToken: sellToken ?? undefined,
    buyToken: buyToken ?? undefined,
    rawAmount: side === "EXACT_IN" ? debouncedSell : debouncedBuy,
    side,
  });

  // Basic readiness & guards
  const readyTokens = isERC20orETH(sellToken || undefined) && isERC20orETH(buyToken || undefined) && !!publicClient;

  const tokenInAddr = useMemo(() => (sellToken ? toAddressForUni(sellToken) : null), [sellToken]);
  const tokenOutAddr = useMemo(() => (buyToken ? toAddressForUni(buyToken) : null), [buyToken]);

  // Parse *input* amount for Uni depending on side
  const uniAmountParam = useMemo(() => {
    if (!readyTokens) return 0n;
    try {
      if (side === "EXACT_IN") {
        return parseUnits(debouncedSell || "0", inDecimals);
      } else {
        return parseUnits(debouncedBuy || "0", outDecimals);
      }
    } catch {
      return 0n;
    }
  }, [readyTokens, side, debouncedSell, debouncedBuy, inDecimals, outDecimals]);

  // Convert zRouter displayed amounts into bigints to compare apples-to-apples
  const zAmountBig = useMemo(() => {
    if (!zQuote.data?.ok) return 0n;
    try {
      if (side === "EXACT_IN" && zQuote.data.amountOut) {
        return parseUnits(zQuote.data.amountOut, outDecimals); // compare outputs
      }
      if (side === "EXACT_OUT" && zQuote.data.amountIn) {
        return parseUnits(zQuote.data.amountIn, inDecimals); // compare inputs
      }
      return 0n;
    } catch {
      return 0n;
    }
  }, [zQuote.data?.ok, zQuote.data?.amountOut, zQuote.data?.amountIn, side, inDecimals, outDecimals]);

  // Uni best quote (multicall) — returns price amount + fixed gas
  const uni = useUniV3BestQuote({
    publicClient,
    side,
    tokenIn: tokenInAddr || undefined,
    tokenOut: tokenOutAddr || undefined,
    amount: uniAmountParam,
  });

  // zRouter gas: fixed constant
  const zGas: bigint = GAS_ZROUTER_SINGLE;

  // Current gas price (for optional ETH/USD cost rendering upstream)
  const { data: gasPriceWei = 0n } = useQuery({
    queryKey: ["gasPrice", publicClient?.chain?.id ?? 0],
    enabled: !!publicClient,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    queryFn: () => publicClient!.getGasPrice(),
  });

  // Shape the final state (stable object to reduce renders)
  const loading = (zQuote.isFetching || uni.isFetching) && (!!uni.enabled || zQuote.isFetching);

  const error =
    (!readyTokens && (debouncedSell || debouncedBuy) ? "Unsupported token(s)" : null) ||
    (uni.enabled && uni.isError ? uni.error : null) ||
    (!zQuote.data?.ok && !zQuote.isFetching ? null : null);

  // Derive raw amounts for consumers that want details
  const zRaw =
    side === "EXACT_IN"
      ? {
          amountIn: parseUnits(debouncedSell || "0", inDecimals),
          amountOut: zAmountBig || undefined,
        }
      : {
          amountIn: zAmountBig || undefined,
          amountOut: parseUnits(debouncedBuy || "0", outDecimals),
        };

  const uniRaw =
    side === "EXACT_IN" ? { amountOut: uni.uniAmount || undefined } : { amountIn: uni.uniAmount || undefined };

  return {
    loading,
    error,
    side,
    // For EXACT_IN: higher is better (output). For EXACT_OUT: lower is better (input).
    zAmount: zAmountBig || undefined,
    uniAmount: uni.uniAmount || undefined,
    zRaw,
    uniRaw,
    decimals: { in: inDecimals, out: outDecimals },

    // Gas & price signals (constants now)
    zGas,
    uniGas: uni.uniGas ?? 0n,
    gasPriceWei,

    // (optional) the chosen V3 path bytes if the caller wants to display/debug
    uniPath: uni.path,
  } as const;
}
