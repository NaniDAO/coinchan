import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address, PublicClient } from "viem";
import { parseUnits, encodeFunctionData } from "viem";
import type { TokenMeta } from "@/lib/coins";
import { useZRouterQuote } from "./use-zrouter-quote";

/* -------------------------- zRouter SDK imports -------------------------- */

import {
  buildRoutePlan,
  findRoute,
  zRouterAbi,
  mainnetConfig,
} from "zrouter-sdk";
import { toZRouterToken } from "@/lib/zrouter";
import { buildUniRouterCall } from "@/lib/build-uni";

/* -------------------------- constants & abi -------------------------- */

const UNISWAP_V3_QUOTER_V2: Address =
  "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";
const WETH9: Address = "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2";

/** probe account used only for gas estimation (no value transfer) */
const ADDRESS_GAS_PROBE =
  "0x0000000000000000000000000000000000000001" as Address;

/** Uniswap SwapRouter02 (V3 router) — used as a fallback if Universal Router calldata builder isn’t provided */
const UNISWAP_SWAPROUTER02: Address =
  "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";

/** Minimal ABIs */
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

const swapRouter02Abi = [
  {
    type: "function",
    name: "exactInput",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "path", type: "bytes" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "exactOutput",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "path", type: "bytes" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
          { name: "amountOut", type: "uint256" },
          { name: "amountInMaximum", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "amountIn", type: "uint256" }],
  },
] as const;

/* ------------------------------- utils ------------------------------- */

export type EfficiencySide = "EXACT_IN" | "EXACT_OUT";

/**
 * Optional builder that callers can provide to encode the actual Universal Router calldata
 * for the intended swap. If present, we estimate gas against Universal Router with it.
 */
export type BuildUniRouterCallFn = (args: {
  side: EfficiencySide;
  // For EXACT_IN: amount is amountIn; EXACT_OUT: amount is amountOut
  amount: bigint;
  path: `0x${string}`; // canonical V3 path (already reversed for exactOutput)
  recipient: Address;
}) =>
  | Promise<{ to: Address; data: `0x${string}`; value: bigint }>
  | { to: Address; data: `0x${string}`; value: bigint };

export function isERC20orETH(t?: TokenMeta): boolean {
  if (!t) return false;
  if (t.source === "ERC20" && !!t.token1) return true;
  if (t.id === null && t.symbol === "ETH") return true; // native ETH sentinel
  return false;
}

function toHex32(addr: Address) {
  return addr.toLowerCase();
}
function feeToHex(fee: number) {
  const hex = fee.toString(16).padStart(6, "0");
  return `0x${hex}`;
}
function concatHex(...parts: string[]) {
  return (
    `0x` + parts.map((p) => p.replace(/^0x/, "")).join("")
  ).toLowerCase() as `0x${string}`;
}
function buildV3Path(tokens: Address[], fees: number[]): `0x${string}` {
  const pieces: string[] = [];
  for (let i = 0; i < fees.length; i++) {
    pieces.push(toHex32(tokens[i]));
    pieces.push(feeToHex(fees[i]));
  }
  pieces.push(toHex32(tokens[tokens.length - 1]));
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
  /** Optional Universal Router calldata builder; if provided, we estimate against it */
};

function useUniV3BestQuote({
  publicClient,
  side,
  tokenIn,
  tokenOut,
  amount,
  feeTiers = [500, 3000, 10000],
}: UniBestParams) {
  const enabled =
    !!publicClient &&
    !!tokenIn &&
    !!tokenOut &&
    amount > 0n &&
    tokenIn !== tokenOut;

  const chainId = publicClient?.chain?.id ?? 0;

  const { data, isFetching, isError, error } = useQuery({
    queryKey: [
      "uniV3Best+routerGas",
      chainId?.toString(),
      side?.toString(),
      tokenIn?.toString(),
      tokenOut?.toString(),
      amount?.toString(),
      feeTiers.join(","),
      "UR",
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
                args: [
                  buildV3Path([tokenIn, WETH9, tokenOut], [fA, fB]),
                  amount,
                ] as const,
              }
            : {
                fn: "quoteExactOutput" as const,
                // reverse path + reverse fees order for ExactOutput
                args: [
                  buildV3Path([tokenOut, WETH9, tokenIn], [fB, fA]),
                  amount,
                ] as const,
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

      // Pick best by amount; also keep quoter gas for the chosen one (fallback)
      let bestIdx = -1;
      let bestAmount: bigint = 0n;
      let chosenQuoterGas: bigint = 0n;

      for (let i = 0; i < res.length; i++) {
        const r = res[i];
        if (r.status !== "success") continue;
        const [amount0, , , gasEstimate] = r.result as any;
        if (side === "EXACT_IN") {
          if ((amount0 as bigint) > bestAmount) {
            bestAmount = amount0 as bigint;
            bestIdx = i;
            chosenQuoterGas = (gasEstimate as bigint) ?? 0n;
          }
        } else {
          // EXACT_OUT: choose smallest required input
          if (
            (amount0 as bigint) > 0n &&
            (bestAmount === 0n || (amount0 as bigint) < bestAmount)
          ) {
            bestAmount = amount0 as bigint;
            bestIdx = i;
            chosenQuoterGas = (gasEstimate as bigint) ?? 0n;
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

      // Build calldata for router estimation (UR via builder, else SR02 fallback)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 5);
      const recipient = ADDRESS_GAS_PROBE;

      let to: Address;
      let data: `0x${string}`;
      let value: bigint = 0n;

      try {
        const call = await buildUniRouterCall({
          side,
          amount,
          path,
          recipient,
        });
        to = call.to;
        data = call.data;
        value = call.value;
      } catch {
        // if builder fails, bail out to SR02 path below
        to = UNISWAP_SWAPROUTER02;
        data =
          side === "EXACT_IN"
            ? encodeFunctionData({
                abi: swapRouter02Abi,
                functionName: "exactInput",
                args: [
                  {
                    path,
                    recipient,
                    deadline,
                    amountIn: amount,
                    amountOutMinimum: 0n,
                  },
                ],
              })
            : encodeFunctionData({
                abi: swapRouter02Abi,
                functionName: "exactOutput",
                args: [
                  {
                    path,
                    recipient,
                    deadline,
                    amountOut: amount,
                    amountInMaximum: (1n << 255n) - 1n,
                  },
                ],
              });
        value = 0n;
      }

      // Try real router gas; if it reverts (no allowance/balance), use Quoter's gas
      let uniGas: bigint = 0n;
      try {
        uniGas = await publicClient.estimateGas({
          account: ADDRESS_GAS_PROBE,
          to,
          data,
          value,
        });
      } catch {
        uniGas = chosenQuoterGas ?? 0n;
      }

      return {
        uniAmount: bestAmount ?? 0n,
        uniGas: uniGas ?? 0n,
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

/* --------------------- zRouter gas estimator (calldata) -------------------- */

async function estimateZRouterGas(opts: {
  publicClient: PublicClient;
  tokenIn: ReturnType<typeof toZRouterToken>;
  tokenOut: ReturnType<typeof toZRouterToken>;
  side: EfficiencySide;
  amount: bigint;
}) {
  const { publicClient, tokenIn, tokenOut, side, amount } = opts;
  try {
    const steps = await findRoute(publicClient, {
      tokenIn,
      tokenOut,
      side,
      amount,
      // loose settings—just for gas probing
      deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 5),
      owner: ADDRESS_GAS_PROBE,
      slippageBps: 100, // 1% tolerance for planning only
    }).catch(() => []);

    if (!steps.length) return 0n;

    const plan = await buildRoutePlan(publicClient, {
      owner: ADDRESS_GAS_PROBE,
      router: mainnetConfig.router,
      steps,
      finalTo: ADDRESS_GAS_PROBE,
    }).catch(() => undefined);

    if (!plan) return 0n;

    const { calls, value } = plan;

    // Single-call vs multicall, mirroring the actual send path
    const data =
      calls.length === 1
        ? calls[0]
        : encodeFunctionData({
            abi: zRouterAbi,
            functionName: "multicall",
            args: [calls],
          });

    const gas = await publicClient.estimateGas({
      account: ADDRESS_GAS_PROBE,
      to: mainnetConfig.router as Address,
      data,
      value,
    });

    return gas;
  } catch {
    return 0n;
  }
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
  const {
    publicClient,
    sellToken,
    buyToken,
    lastEditedField,
    sellAmt,
    buyAmt,
  } = opts;

  const side: EfficiencySide =
    lastEditedField === "sell" ? "EXACT_IN" : "EXACT_OUT";

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
  const readyTokens =
    isERC20orETH(sellToken || undefined) &&
    isERC20orETH(buyToken || undefined) &&
    !!publicClient;

  const tokenInAddr = useMemo(
    () => (sellToken ? toAddressForUni(sellToken) : null),
    [sellToken],
  );
  const tokenOutAddr = useMemo(
    () => (buyToken ? toAddressForUni(buyToken) : null),
    [buyToken],
  );

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
  }, [
    zQuote.data?.ok,
    zQuote.data?.amountOut,
    zQuote.data?.amountIn,
    side,
    inDecimals,
    outDecimals,
  ]);

  // Uni best quote (multicall) + router gas estimate (UR via builder or SR02 fallback)
  const uni = useUniV3BestQuote({
    publicClient,
    side,
    tokenIn: tokenInAddr || undefined,
    tokenOut: tokenOutAddr || undefined,
    amount: uniAmountParam,
  });

  // zRouter gas estimate based on planned calldata (mirrors actual send)
  const { data: zGas = 0n, isFetching: zGasLoading } = useQuery({
    queryKey: [
      "zGas",
      publicClient?.chain?.id ?? 0,
      side,
      sellToken?.id?.toString(),
      buyToken?.id?.toString(),
      (side === "EXACT_IN" ? debouncedSell : debouncedBuy) || "",
    ],
    enabled:
      !!publicClient &&
      !!sellToken &&
      !!buyToken &&
      ((side === "EXACT_IN" && Number(debouncedSell) > 0) ||
        (side === "EXACT_OUT" && Number(debouncedBuy) > 0)),
    staleTime: 5_000,
    gcTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async () => {
      const tIn = toZRouterToken(sellToken!);
      const tOut = toZRouterToken(buyToken!);
      const amt =
        side === "EXACT_IN"
          ? parseUnits(debouncedSell || "0", inDecimals)
          : parseUnits(debouncedBuy || "0", outDecimals);

      if (amt <= 0n) return 0n;
      return estimateZRouterGas({
        publicClient: publicClient!,
        tokenIn: tIn,
        tokenOut: tOut,
        side,
        amount: amt,
      });
    },
  });

  // Current gas price (for optional ETH/USD cost rendering upstream)
  const { data: gasPriceWei = 0n } = useQuery({
    queryKey: ["gasPrice", publicClient?.chain?.id ?? 0],
    enabled: !!publicClient,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    queryFn: () => publicClient!.getGasPrice(),
  });

  // Shape the final state (stable object to reduce renders)
  const loading =
    (zQuote.isFetching || uni.isFetching || zGasLoading) &&
    (!!uni.enabled || zQuote.isFetching);

  const error =
    (!readyTokens && (debouncedSell || debouncedBuy)
      ? "Unsupported token(s)"
      : null) ||
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
    side === "EXACT_IN"
      ? { amountOut: uni.uniAmount || undefined }
      : { amountIn: uni.uniAmount || undefined };

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

    // Gas & price signals
    zGas,
    uniGas: uni.uniGas ?? 0n,
    gasPriceWei,

    // (optional) the chosen V3 path bytes if the caller wants to display/debug
    uniPath: uni.path,
  } as const;
}
