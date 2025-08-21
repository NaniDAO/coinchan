import { TokenMeta } from "@/lib/coins";
import { cn } from "@/lib/utils";
import { toZRouterToken } from "@/SwapAction";
import { useEffect, useState } from "react";
import { Address, formatUnits, parseUnits } from "viem";
import { mainnet } from "viem/chains";
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

        const side: EfficiencySide =
          lastEditedField === "sell" ? "EXACT_IN" : "EXACT_OUT";
        const inDecimals = sellToken?.decimals ?? 18;
        const outDecimals = buyToken?.decimals ?? 18;

        // --- zRouter quote
        const tokenInZ = toZRouterToken(sellToken)!;
        const tokenOutZ = toZRouterToken(buyToken)!;

        let zAmountIn: bigint | undefined;
        let zAmountOut: bigint | undefined;

        if (side === "EXACT_IN") {
          const amountIn = parseUnits(sellAmt || "0", inDecimals);
          const z = await quote(publicClient, {
            tokenIn: tokenInZ,
            tokenOut: tokenOutZ,
            amount: amountIn,
            side,
          });
          zAmountIn = amountIn;
          zAmountOut = z.amountOut;
        } else {
          const amountOut = parseUnits(buyAmt || "0", outDecimals);
          const z = await quote(publicClient, {
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
        const tokenIn = toAddressForUni(sellToken)!;
        const tokenOut = toAddressForUni(buyToken)!;

        const FEE_TIERS = [500, 3000, 10000];

        async function uniExactInBest(amountIn: bigint): Promise<bigint> {
          let best = 0n;

          if (!publicClient) {
            return;
          }

          // direct
          for (const fee of FEE_TIERS) {
            const path = buildV3Path([tokenIn, tokenOut], [fee]);
            try {
              const [amountOut] = await publicClient.readContract({
                address: UNISWAP_V3_QUOTER_V2,
                abi: uniQuoterV2Abi,
                functionName: "quoteExactInput",
                args: [path, amountIn],
              });
              if (amountOut > best) best = amountOut as bigint;
            } catch {}
          }

          // through WETH
          for (const fA of FEE_TIERS) {
            for (const fB of FEE_TIERS) {
              const path = buildV3Path([tokenIn, WETH9, tokenOut], [fA, fB]);
              try {
                const [amountOut] = await publicClient.readContract({
                  address: UNISWAP_V3_QUOTER_V2,
                  abi: uniQuoterV2Abi,
                  functionName: "quoteExactInput",
                  args: [path, amountIn],
                });
                if ((amountOut as bigint) > best) best = amountOut as bigint;
              } catch {}
            }
          }
          return best;
        }

        async function uniExactOutBest(amountOut: bigint): Promise<bigint> {
          let bestIn: bigint | null = null;

          // direct (path is reversed for exactOutput)
          for (const fee of FEE_TIERS) {
            const path = buildV3Path([tokenOut, tokenIn], [fee]); // reverse
            try {
              const [amountIn] = await publicClient.readContract({
                address: UNISWAP_V3_QUOTER_V2,
                abi: uniQuoterV2Abi,
                functionName: "quoteExactOutput",
                args: [path, amountOut],
              });
              const ain = amountIn as bigint;
              if (ain > 0n && (bestIn === null || ain < bestIn)) bestIn = ain;
            } catch {}
          }

          // through WETH (reverse)
          for (const fA of FEE_TIERS) {
            for (const fB of FEE_TIERS) {
              const path = buildV3Path([tokenOut, WETH9, tokenIn], [fB, fA]); // reverse order & fees
              try {
                const [amountIn] = await publicClient.readContract({
                  address: UNISWAP_V3_QUOTER_V2,
                  abi: uniQuoterV2Abi,
                  functionName: "quoteExactOutput",
                  args: [path, amountOut],
                });
                const ain = amountIn as bigint;
                if (ain > 0n && (bestIn === null || ain < bestIn)) bestIn = ain;
              } catch {}
            }
          }
          return bestIn ?? 0n;
        }

        let uniAmount: bigint;
        if (side === "EXACT_IN") {
          uniAmount = await uniExactInBest(zAmountIn);
          if (uniAmount === 0n) {
            if (!cancelled)
              setState({ loading: false, error: "No UniV3 route" });
            return;
          }
        } else {
          uniAmount = await uniExactOutBest(zAmountOut);
          if (uniAmount === 0n) {
            if (!cancelled)
              setState({ loading: false, error: "No UniV3 route" });
            return;
          }
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

  const { loading, error, side, zAmount, uniAmount, decimals } =
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
  let good: boolean;

  if (side === "EXACT_IN") {
    // Compare output amounts
    const z = Number(formatUnits(zAmount, decimals!.out));
    const u = Number(formatUnits(uniAmount, decimals!.out));
    if (!isFinite(z) || !isFinite(u) || z <= 0 || u <= 0) return null;
    deltaPct = ((z - u) / u) * 100;
    good = deltaPct >= 0;
    line = `zRouter swap is ${prettyPct(deltaPct)} ${good ? "more efficient" : "less efficient"} (out: ${formatCompact(z)} vs ${formatCompact(u)} ${buyToken.symbol})`;
  } else {
    // EXACT_OUT: compare required input amounts (lower is better)
    const z = Number(formatUnits(zAmount, decimals!.in));
    const u = Number(formatUnits(uniAmount, decimals!.in));
    if (!isFinite(z) || !isFinite(u) || z <= 0 || u <= 0) return null;
    deltaPct = ((u - z) / u) * 100; // “cheaper by X%” vs Uni
    good = deltaPct >= 0;
    line = `zRouter swap is ${prettyPct(deltaPct)} ${good ? "cheaper" : "more expensive"} (in: ${formatCompact(z)} vs ${formatCompact(u)} ${sellToken.symbol})`;
  }

  return (
    <div
      className={cn(
        "mt-1 text-[11px]",
        good
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400",
      )}
    >
      {line}
    </div>
  );
}
