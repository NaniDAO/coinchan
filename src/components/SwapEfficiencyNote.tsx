import { TokenMeta } from "@/lib/coins";
import { cn } from "@/lib/utils";
import { toZRouterToken } from "@/SwapAction";
import { useEffect, useState } from "react";
import { Address, formatUnits, parseUnits, formatGwei } from "viem";
import { usePublicClient } from "wagmi";
import { quote } from "zrouter-sdk";

// ===== Uniswap Quoter utilities (V3 QuoterV2) =====
const UNISWAP_V3_QUOTER_V2: Address =
  "0x61fFE014bA17989E743c5F6cB21bF9697530B21e"; // mainnet
const WETH9: Address = "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2";

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

// Uniswap V3 path encoding helpers (token + fee + token [+ fee + token ...])
function toHex32(addr: Address) {
  return addr.toLowerCase();
}
function feeToHex(fee: number) {
  // 3 bytes big-endian
  const hex = fee.toString(16).padStart(6, "0");
  return `0x${hex}`;
}
function concatHex(...parts: string[]) {
  return (
    `0x` + parts.map((p) => p.replace(/^0x/, "")).join("")
  ).toLowerCase() as `0x${string}`;
}
// Build a v3 path: tokenIn ->(fee)-> tokenOut (single hop)
// or tokenIn ->(feeA)-> WETH ->(feeB)-> tokenOut (two hops)
function buildV3Path(tokens: Address[], fees: number[]): `0x${string}` {
  // tokens length = fees length + 1
  const pieces: string[] = [];
  for (let i = 0; i < fees.length; i++) {
    pieces.push(toHex32(tokens[i]));
    pieces.push(feeToHex(fees[i]));
  }
  pieces.push(toHex32(tokens[tokens.length - 1]));
  return concatHex(...pieces);
}

type EfficiencySide = "EXACT_IN" | "EXACT_OUT";

function isERC20orETH(t?: TokenMeta): boolean {
  if (!t) return false;
  if (t.source === "ERC20" && !!t.token1) return true;
  if (t.id === null && t.symbol === "ETH") return true; // native ETH sentinel
  return false;
}

function toAddressForUni(t: TokenMeta): Address | null {
  if (t.id === null && t.symbol === "ETH") return WETH9; // unwrap to WETH
  if (t.source === "ERC20" && t.token1) return t.token1 as Address;
  return null;
}

function prettyPct(n: number) {
  const s = n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
  return `${s}%`;
}

function formatCompact(n: bigint | number, decimals = 6) {
  const val = typeof n === "bigint" ? Number(n) : n;
  if (!isFinite(val)) return "-";
  if (Math.abs(val) >= 1)
    return val.toLocaleString(undefined, { maximumFractionDigits: decimals });
  return val.toPrecision(3);
}

// ===== Hook: compare zRouter vs Uniswap (V3 QuoterV2) =====
function useZRouterVsUniEfficiency(opts: {
  publicClient: ReturnType<typeof usePublicClient> extends infer T ? T : any;
  sellToken?: TokenMeta;
  buyToken?: TokenMeta;
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

  const [state, setState] = useState<{
    loading: boolean;
    error?: string | null;
    side?: EfficiencySide;
    zAmount?: bigint; // out (EXACT_IN) or in (EXACT_OUT), in buyToken/sellToken units respectively
    uniAmount?: bigint;
    zRaw?: { amountIn?: bigint; amountOut?: bigint };
    uniRaw?: { amountIn?: bigint; amountOut?: bigint };
    decimals?: { in: number; out: number };
    gasComparison?: {
      zRouterGas?: bigint;
      uniswapGas?: bigint;
    };
  }>({ loading: false });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setState((s) => ({ ...s, loading: true, error: null }));

        if (
          !publicClient ||
          !isERC20orETH(sellToken) ||
          !isERC20orETH(buyToken) ||
          (!sellAmt && !buyAmt)
        ) {
          setState({ loading: false, error: null });
          return;
        }

        // From here on, treat these as non-null (we've validated above)
        const pc = publicClient!;
        const sToken = sellToken!;
        const bToken = buyToken!;

        const side: EfficiencySide =
          lastEditedField === "sell" ? "EXACT_IN" : "EXACT_OUT";
        const inDecimals = sToken.decimals ?? 18;
        const outDecimals = bToken.decimals ?? 18;

        // --- zRouter quote
        const tokenInZ = toZRouterToken(sToken)!;
        const tokenOutZ = toZRouterToken(bToken)!;

        let zAmountIn: bigint | undefined;
        let zAmountOut: bigint | undefined;

        if (side === "EXACT_IN") {
          const amountIn = parseUnits(sellAmt || "0", inDecimals);
          const z = await quote(pc, {
            tokenIn: tokenInZ,
            tokenOut: tokenOutZ,
            amount: amountIn,
            side,
          });
          zAmountIn = amountIn;
          zAmountOut = z.amountOut;
        } else {
          const amountOut = parseUnits(buyAmt || "0", outDecimals);
          const z = await quote(pc, {
            tokenIn: tokenInZ,
            tokenOut: tokenOutZ,
            amount: amountOut,
            side,
          });
          zAmountOut = amountOut;
          zAmountIn = z.amountIn;
        }

        // early out if no usable amount
        if (
          !zAmountIn ||
          !zAmountOut ||
          zAmountIn === 0n ||
          zAmountOut === 0n
        ) {
          if (!cancelled) setState({ loading: false, error: null });
          return;
        }

        // --- Uniswap V3 QuoterV2: try best of [direct 500/3000/10000] and [via WETH with combinations]
        const tokenIn = toAddressForUni(sToken)!;
        const tokenOut = toAddressForUni(bToken)!;

        const FEE_TIERS = [500, 3000, 10000];

        async function uniExactInBest(amountIn: bigint): Promise<{ amountOut: bigint; gasEstimate: bigint }> {
          let best = 0n;
          let bestGas = 0n;

          // direct
          for (const fee of FEE_TIERS) {
            const path = buildV3Path([tokenIn, tokenOut], [fee]);
            try {
              const [amountOut, , , gasEstimate] = await pc.readContract({
                address: UNISWAP_V3_QUOTER_V2,
                abi: uniQuoterV2Abi,
                functionName: "quoteExactInput",
                args: [path, amountIn],
              });
              if ((amountOut as bigint) > best) {
                best = amountOut as bigint;
                bestGas = gasEstimate as bigint;
              }
            } catch {}
          }

          // through WETH
          for (const fA of FEE_TIERS) {
            for (const fB of FEE_TIERS) {
              const path = buildV3Path([tokenIn, WETH9, tokenOut], [fA, fB]);
              try {
                const [amountOut, , , gasEstimate] = await pc.readContract({
                  address: UNISWAP_V3_QUOTER_V2,
                  abi: uniQuoterV2Abi,
                  functionName: "quoteExactInput",
                  args: [path, amountIn],
                });
                if ((amountOut as bigint) > best) {
                  best = amountOut as bigint;
                  bestGas = gasEstimate as bigint;
                }
              } catch {}
            }
          }
          return { amountOut: best, gasEstimate: bestGas };
        }

        async function uniExactOutBest(amountOut: bigint): Promise<{ amountIn: bigint; gasEstimate: bigint }> {
          let bestIn: bigint | null = null;
          let bestGas = 0n;

          // direct (path is reversed for exactOutput)
          for (const fee of FEE_TIERS) {
            const path = buildV3Path([tokenOut, tokenIn], [fee]); // reverse
            try {
              const [amountIn, , , gasEstimate] = await pc.readContract({
                address: UNISWAP_V3_QUOTER_V2,
                abi: uniQuoterV2Abi,
                functionName: "quoteExactOutput",
                args: [path, amountOut],
              });
              const ain = amountIn as bigint;
              if (ain > 0n && (bestIn === null || ain < bestIn)) {
                bestIn = ain;
                bestGas = gasEstimate as bigint;
              }
            } catch {}
          }

          // through WETH (reverse)
          for (const fA of FEE_TIERS) {
            for (const fB of FEE_TIERS) {
              const path = buildV3Path([tokenOut, WETH9, tokenIn], [fB, fA]); // reverse order & fees
              try {
                const [amountIn, , , gasEstimate] = await pc.readContract({
                  address: UNISWAP_V3_QUOTER_V2,
                  abi: uniQuoterV2Abi,
                  functionName: "quoteExactOutput",
                  args: [path, amountOut],
                });
                const ain = amountIn as bigint;
                if (ain > 0n && (bestIn === null || ain < bestIn)) {
                  bestIn = ain;
                  bestGas = gasEstimate as bigint;
                }
              } catch {}
            }
          }
          return { amountIn: bestIn ?? 0n, gasEstimate: bestGas };
        }

        let uniAmount: bigint;
        let uniGasEstimate: bigint = 0n;
        if (side === "EXACT_IN") {
          const result = await uniExactInBest(zAmountIn);
          uniAmount = result.amountOut;
          uniGasEstimate = result.gasEstimate;
          if (uniAmount === 0n) {
            if (!cancelled)
              setState({ loading: false, error: "No UniV3 route" });
            return;
          }
        } else {
          const result = await uniExactOutBest(zAmountOut);
          uniAmount = result.amountIn;
          uniGasEstimate = result.gasEstimate;
          if (uniAmount === 0n) {
            if (!cancelled)
              setState({ loading: false, error: "No UniV3 route" });
            return;
          }
        }

        // Estimate gas for zRouter swap
        let zRouterGasEstimate: bigint | undefined;
        try {
          // Import necessary functions from zrouter-sdk
          const { buildRoutePlan, simulateRoute, findRoute, mainnetConfig } = await import("zrouter-sdk");
          
          // Find the route
          const route = await findRoute(pc, {
            tokenIn: tokenInZ,
            tokenOut: tokenOutZ,
            amountIn: side === "EXACT_IN" ? zAmountIn : undefined,
            amountOut: side === "EXACT_OUT" ? zAmountOut : undefined,
          });

          if (route && route.steps?.length > 0) {
            // Build the plan
            const plan = await buildRoutePlan(pc, {
              owner: "0x0000000000000000000000000000000000000001" as Address, // dummy address for simulation
              router: mainnetConfig.router,
              steps: route.steps,
              finalTo: "0x0000000000000000000000000000000000000001" as Address,
            });

            if (plan) {
              // Simulate to get gas estimate
              const simulation = await pc.estimateContractGas({
                address: mainnetConfig.router,
                abi: (await import("zrouter-sdk")).zRouterAbi,
                functionName: "multicall",
                args: [plan.calls],
                value: plan.value,
                account: "0x0000000000000000000000000000000000000001" as Address,
              }).catch(() => undefined);
              
              zRouterGasEstimate = simulation;
            }
          }
        } catch (err) {
          console.debug("Failed to estimate zRouter gas:", err);
        }

        if (cancelled) return;

        setState({
          loading: false,
          error: null,
          side,
          zAmount: side === "EXACT_IN" ? zAmountOut : zAmountIn,
          uniAmount: uniAmount,
          zRaw: { amountIn: zAmountIn, amountOut: zAmountOut },
          uniRaw:
            side === "EXACT_IN"
              ? { amountOut: uniAmount }
              : { amountIn: uniAmount },
          decimals: { in: inDecimals, out: outDecimals },
          gasComparison: {
            zRouterGas: zRouterGasEstimate,
            uniswapGas: uniGasEstimate,
          },
        });
      } catch (e: any) {
        if (!cancelled)
          setState({ loading: false, error: e?.message || "error" });
      }
    }

    // small debounce to avoid hammering on quick typing
    const id = setTimeout(run, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [
    publicClient,
    sellToken?.token1,
    buyToken?.token1,
    sellAmt,
    buyAmt,
    lastEditedField,
  ]);

  return state;
}

// ===== UI: the tiny note line =====
export function SwapEfficiencyNote(props: {
  publicClient: ReturnType<typeof usePublicClient> extends infer T ? T : any;
  sellToken?: TokenMeta;
  buyToken?: TokenMeta;
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
  } = props;

  const { loading, error, side, zAmount, uniAmount, decimals, gasComparison } =
    useZRouterVsUniEfficiency({
      publicClient,
      sellToken,
      buyToken,
      lastEditedField,
      sellAmt,
      buyAmt,
    });

  console.log("SwapEfficiencyNote", {
    sellToken,
    buyToken,
  });

  // Only show for ERC20 <-> ERC20
  if (!isERC20orETH(sellToken) || !isERC20orETH(buyToken)) return null;

  // Promote to non-null for the JSX below (we just validated)
  const sToken = sellToken!;
  const bToken = buyToken!;

  // Need valid values
  if (error || loading || !side || !zAmount || !uniAmount) {
    // Render a subtle placeholder to avoid layout shift only when typing
    return loading ? (
      <div className="mt-1 text-[11px] text-muted-foreground/70 italic">
        Checking route efficiency…
      </div>
    ) : null;
  }

  let deltaPct: number;
  let line: string;
  let gasLine: string | undefined;
  let good: boolean;
  let gasGood: boolean | undefined;

  if (side === "EXACT_IN") {
    // Compare output amounts
    const z = Number(formatUnits(zAmount, decimals!.out));
    const u = Number(formatUnits(uniAmount, decimals!.out));
    if (!isFinite(z) || !isFinite(u) || z <= 0 || u <= 0) return null;
    deltaPct = ((z - u) / u) * 100;
    good = deltaPct >= 0;
    line = `Output: ${formatCompact(z)} vs ${formatCompact(u)} ${bToken.symbol} (${prettyPct(deltaPct)} ${good ? "better" : "worse"})`;
  } else {
    // EXACT_OUT: compare required input amounts (lower is better)
    const z = Number(formatUnits(zAmount, decimals!.in));
    const u = Number(formatUnits(uniAmount, decimals!.in));
    if (!isFinite(z) || !isFinite(u) || z <= 0 || u <= 0) return null;
    deltaPct = ((u - z) / u) * 100; // "cheaper by X%" vs Uni
    good = deltaPct >= 0;
    line = `Input: ${formatCompact(z)} vs ${formatCompact(u)} ${sToken.symbol} (${prettyPct(deltaPct)} ${good ? "cheaper" : "more expensive"})`;
  }

  // Gas comparison if available
  if (gasComparison?.zRouterGas && gasComparison?.uniswapGas) {
    const zGas = Number(gasComparison.zRouterGas);
    const uGas = Number(gasComparison.uniswapGas);
    if (zGas > 0 && uGas > 0) {
      const gasDeltaPct = ((uGas - zGas) / uGas) * 100;
      gasGood = gasDeltaPct >= 0;
      gasLine = `Gas: ~${(zGas / 1000).toFixed(0)}k vs ~${(uGas / 1000).toFixed(0)}k (${prettyPct(gasDeltaPct)} ${gasGood ? "cheaper" : "more expensive"})`;
    }
  }

  const overallGood = good && (gasGood === undefined || gasGood);

  return (
    <div className="mt-1 space-y-0.5">
      <div className="text-[11px] text-muted-foreground">
        <span className="font-medium">zRouter vs Uniswap V3:</span>
      </div>
      <div
        className={cn(
          "text-[11px]",
          good
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-amber-600 dark:text-amber-400",
        )}
      >
        {line}
      </div>
      {gasLine && (
        <div
          className={cn(
            "text-[11px]",
            gasGood
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-400",
          )}
        >
          {gasLine}
        </div>
      )}
      <div
        className={cn(
          "text-[10px] font-medium",
          overallGood
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-amber-600 dark:text-amber-400",
        )}
      >
        Overall: zRouter is {overallGood ? "more" : "less"} efficient
      </div>
    </div>
  );
}
