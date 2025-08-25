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

function weiToEthNumber(wei?: bigint) {
  if (!wei || wei <= 0n) return 0;
  // Use string math to avoid float overflow for very large numbers
  // But for UI short display, a Number cast is acceptable after division.
  const eth = Number(wei) / 1e18;
  return isFinite(eth) ? eth : 0;
}

export function SwapEfficiencyNote(props: {
  publicClient: ReturnType<typeof usePublicClient> extends infer T ? T : any;
  sellToken?: TokenMeta;
  buyToken?: TokenMeta;
  lastEditedField: "sell" | "buy";
  sellAmt: string;
  buyAmt: string;
  /** Optional: pass USD price of ETH if you want to show $ gas (not required) */
  ethPriceUsd?: number;
}) {
  const {
    publicClient,
    sellToken,
    buyToken,
    lastEditedField,
    sellAmt,
    buyAmt,
    ethPriceUsd,
  } = props;

  const {
    loading,
    error,
    side,
    zAmount,
    uniAmount,
    decimals,
    zGas,
    uniGas,
    gasPriceWei,
  } = useZRouterVsUniEfficiency({
    publicClient,
    sellToken,
    buyToken,
    lastEditedField,
    sellAmt,
    buyAmt,
  });

  console.log({
    loading,
    error,
    side,
    zAmount,
    uniAmount,
    decimals,
    zGas,
    uniGas,
    gasPriceWei,
  });

  // Only show for ERC20 <-> ERC20 (or ETH sentinel)
  if (!isERC20orETH(sellToken) || !isERC20orETH(buyToken)) return null;

  const sToken = sellToken!;
  const bToken = buyToken!;

  // While typing: preserve subtle placeholder to avoid layout shift
  if (loading) {
    return (
      <div className="mt-1 text-[11px] text-muted-foreground/70 italic">
        Checking route efficiency & gas…
      </div>
    );
  }

  if (error || !side || !zAmount || !uniAmount) return null;

  // ----- Price efficiency line (unchanged logic) -----
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

  // ----- Gas comparison line -----
  const hasGas = (zGas && zGas > 0n) || (uniGas && uniGas > 0n);
  let gasLine: string | null = null;

  if (hasGas) {
    const gp = gasPriceWei && gasPriceWei > 0n ? gasPriceWei : undefined;

    // Raw gas units
    const raw = `gas: zRouter ~ ${Number(zGas || 0n).toLocaleString()} vs Uni ~ ${Number(uniGas || 0n).toLocaleString()}`;

    // ETH cost (optional)
    let ethPart = "";
    if (gp) {
      const zEth = weiToEthNumber((zGas || 0n) * gp);
      const uEth = weiToEthNumber((uniGas || 0n) * gp);
      ethPart = ` (~${zEth.toPrecision(3)} ETH vs ~${uEth.toPrecision(3)} ETH)`;
    }

    // USD cost (optional if ethPriceUsd provided)
    let usdPart = "";
    if (gp && ethPriceUsd && ethPriceUsd > 0) {
      const zEth = weiToEthNumber((zGas || 0n) * gp);
      const uEth = weiToEthNumber((uniGas || 0n) * gp);
      const zUsd = zEth * ethPriceUsd;
      const uUsd = uEth * ethPriceUsd;
      usdPart = ` (~$${zUsd.toFixed(2)} vs ~$${uUsd.toFixed(2)})`;
    }

    gasLine = raw + ethPart + usdPart;
  }

  return (
    <div
      className={cn(
        "mt-1 text-[11px] space-y-0.5",
        good
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400",
      )}
    >
      <div>{line}</div>
      {gasLine && <div className="text-[10px] opacity-80">{gasLine}</div>}
    </div>
  );
}
