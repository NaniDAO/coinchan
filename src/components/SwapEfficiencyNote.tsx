import { TokenMeta } from "@/lib/coins";
import { cn } from "@/lib/utils";

import { formatUnits } from "viem";
import { usePublicClient } from "wagmi";
import {
  useZRouterVsUniEfficiency,
  isERC20orETH,
} from "@/hooks/use-zrouter-vs-uni-efficiency";

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
  let good: boolean;

  if (side === "EXACT_IN") {
    // Compare output amounts
    const z = Number(formatUnits(zAmount, decimals!.out));
    const u = Number(formatUnits(uniAmount, decimals!.out));
    if (!isFinite(z) || !isFinite(u) || z <= 0 || u <= 0) return null;
    deltaPct = ((z - u) / u) * 100;
    good = deltaPct >= 0;
    line = `zRouter swap is ${prettyPct(deltaPct)} ${good ? "more efficient" : "less efficient"} (out: ${formatCompact(z)} vs ${formatCompact(u)} ${bToken.symbol})`;
  } else {
    // EXACT_OUT: compare required input amounts (lower is better)
    const z = Number(formatUnits(zAmount, decimals!.in));
    const u = Number(formatUnits(uniAmount, decimals!.in));
    if (!isFinite(z) || !isFinite(u) || z <= 0 || u <= 0) return null;
    deltaPct = ((u - z) / u) * 100; // “cheaper by X%” vs Uni
    good = deltaPct >= 0;
    line = `zRouter swap is ${prettyPct(deltaPct)} ${good ? "cheaper" : "more expensive"} (in: ${formatCompact(z)} vs ${formatCompact(u)} ${sToken.symbol})`;
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
