import { TokenMeta } from "@/lib/coins";
import { cn } from "@/lib/utils";
import { formatUnits } from "viem";
import { usePublicClient } from "wagmi";
import {
  useZRouterVsUniEfficiency,
  isERC20orETH,
} from "@/hooks/use-zrouter-vs-uni-efficiency";
import { useETHPrice } from "@/hooks/use-eth-price";

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
  /** Optional: legacy fallback if ETH price hook is unavailable */
  ethPriceUsd?: number;
}) {
  const {
    publicClient,
    sellToken,
    buyToken,
    lastEditedField,
    sellAmt,
    buyAmt,
    ethPriceUsd: ethPriceUsdProp,
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

  // ETH/USD price via on-chain source
  const { data: ethHook } = useETHPrice();
  const ethPriceUsd =
    (typeof ethHook?.priceUSD === "number" && isFinite(ethHook.priceUSD)
      ? ethHook.priceUSD
      : undefined) ??
    (isFinite(ethPriceUsdProp || NaN) ? ethPriceUsdProp : undefined);

  // Only show for ERC20 <-> ERC20 (or ETH sentinel)
  if (!isERC20orETH(sellToken) || !isERC20orETH(buyToken)) return null;

  // While typing: keep a tiny placeholder to avoid jumps
  if (loading) {
    return (
      <div
        className={cn(
          // terminal card strip
          "mt-2 border-2 border-[var(--terminal-black)] bg-[var(--terminal-white)] px-2 py-1",
          "font-mono text-[11px] tracking-tight",
        )}
      >
        <div className="flex items-center justify-between">
          <span className="uppercase">Route Check</span>
          <span className="opacity-70">…</span>
        </div>
      </div>
    );
  }

  if (error || !side || !zAmount || !uniAmount) return null;

  const sToken = sellToken!;
  const bToken = buyToken!;

  // -------- Price edge ----------
  let deltaPct: number;
  let priceLine: string;
  let good: boolean;

  if (side === "EXACT_IN") {
    const z = Number(formatUnits(zAmount, decimals!.out));
    const u = Number(formatUnits(uniAmount, decimals!.out));
    if (!isFinite(z) || !isFinite(u) || z <= 0 || u <= 0) return null;
    deltaPct = ((z - u) / u) * 100;
    good = deltaPct >= 0;
    priceLine = `${formatCompact(z)} vs ${formatCompact(u)} ${bToken.symbol}`;
  } else {
    const z = Number(formatUnits(zAmount, decimals!.in));
    const u = Number(formatUnits(uniAmount, decimals!.in));
    if (!isFinite(z) || !isFinite(u) || z <= 0 || u <= 0) return null;
    // cheaper by X%: (u - z)/u
    deltaPct = ((u - z) / u) * 100;
    good = deltaPct >= 0;
    priceLine = `${formatCompact(z)} vs ${formatCompact(u)} ${sToken.symbol}`;
  }

  // -------- Gas (constants) ----------
  const gp = gasPriceWei && gasPriceWei > 0n ? gasPriceWei : undefined;
  const zEth = gp ? weiToEthNumber((zGas || 0n) * gp) : 0;
  const uEth = gp ? weiToEthNumber((uniGas || 0n) * gp) : 0;
  const zUsd = ethPriceUsd ? zEth * ethPriceUsd : undefined;
  const uUsd = ethPriceUsd ? uEth * ethPriceUsd : undefined;
  const diffUsd =
    zUsd !== undefined && uUsd !== undefined ? zUsd - uUsd : undefined;

  const diffBadge =
    diffUsd === undefined
      ? null
      : (() => {
          const cheaper = diffUsd < 0;
          const label = cheaper ? "CHEAPER" : "MORE";
          const abs = Math.abs(diffUsd);
          return (
            <span
              className={cn(
                "ml-2 inline-flex items-center px-1.5 py-[1px] border border-[var(--terminal-black)]",
                "uppercase text-[10px] leading-tight",
                "bg-[var(--terminal-white)]",
              )}
              title={cheaper ? "zRouter gas cheaper" : "zRouter gas more"}
            >
              Δ ${abs.toFixed(2)} {label}
            </span>
          );
        })();

  return (
    <div
      className={cn(
        "mt-2 border-2 border-[var(--terminal-black)] bg-[var(--terminal-white)]",
        "px-2 py-1 font-mono text-[11px] tracking-tight select-text",
        // slight raise on hover for terminal vibe
        "transition-transform duration-100 hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[2px_2px_0_var(--terminal-black)]",
      )}
    >
      {/* Row: PRICE EDGE */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="uppercase">Price Edge</span>
          <span
            className={cn(
              "px-1.5 py-[1px] border border-[var(--terminal-black)] uppercase",
              "text-[10px] leading-tight",
              good ? "bg-[var(--diamond-green)]" : "bg-[var(--diamond-orange)]",
            )}
          >
            {prettyPct(deltaPct)} {good ? "Better" : "Worse"}
          </span>
        </div>
        <div className="opacity-80">{priceLine}</div>
      </div>

      {/* Divider */}
      <div className="my-1 h-[1px] w-full bg-[var(--terminal-black)] opacity-20" />

      {/* Row: GAS */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex items-center gap-2">
          <span className="uppercase">Gas</span>
          <span className="opacity-80">
            zRouter&nbsp;~&nbsp;{Number(zGas || 0n).toLocaleString()} vs
            Uni&nbsp;~&nbsp;
            {Number(uniGas || 0n).toLocaleString()}
          </span>
          {diffBadge}
        </div>

        <div className="opacity-80">
          {gp ? (
            <>
              ~{zEth.toPrecision(3)} ETH vs ~{uEth.toPrecision(3)} ETH
              {zUsd !== undefined && uUsd !== undefined ? (
                <>
                  &nbsp;(&nbsp;${zUsd.toFixed(2)} vs ${uUsd.toFixed(2)}&nbsp;)
                </>
              ) : null}
            </>
          ) : (
            <span className="uppercase">Waiting for gas price…</span>
          )}
        </div>
      </div>
    </div>
  );
}
