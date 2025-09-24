import { templates } from "./RaiseForm";

export const PreviewRaise = ({
  state,
  imageBuffer,
  ethRate,
  otcSupply,
  incentiveAmount,
  airdropIncentive,
  airdropPriceX18,
  incentiveDuration,
  ethPriceUSD,
}: {
  state: any;
  imageBuffer: ArrayBuffer | null;
  ethRate: bigint;
  otcSupply: bigint;
  incentiveAmount: bigint;
  airdropIncentive: bigint;
  airdropPriceX18: bigint;
  incentiveDuration: bigint;
  ethPriceUSD: number | null;
}) => {
  const imgUrl = imageBuffer
    ? URL.createObjectURL(new Blob([imageBuffer]))
    : null;

  const initial = (state?.name?.trim?.()?.charAt(0) || "Z").toUpperCase();

  // ----- Supply breakdown (percent-safe with BigInt math) -----
  const totalSupplyWei = parseUnitsSafe(state.totalSupplyDisplay, 18n);
  const creatorSupplyWei = parseUnitsSafe(state.creatorSupplyDisplay, 18n);

  //@ts-expect-error
  const needsChef = templates[state.template].needsChef;

  const parts: Array<{
    key: string;
    label: string;
    value: bigint;
    color: string;
  }> = [
    { key: "otc", label: "OTC", value: max0(otcSupply), color: "bg-blue-500" },
    {
      key: "creator",
      label: "Creator",
      value: max0(creatorSupplyWei),
      color: "bg-emerald-500",
    },
    ...(needsChef
      ? [
          {
            key: "incentive",
            label: "Incentive",
            value: max0(incentiveAmount),
            color: "bg-fuchsia-500",
          },
        ]
      : []),
  ];

  const breakdown = computeBreakdown(parts, totalSupplyWei);

  // ----- Initial coin price in USD -----
  // ethRate = coinsPerEth * 1e18 (BigInt). We want USD per coin = ethPriceUSD / coinsPerEth
  const coinsPerEth = ethRate > 0n ? ethRate / 10n ** 18n : 0n;
  const coinPriceUSD = computeCoinUsdPrice(ethPriceUSD, coinsPerEth);
  const coinPriceUSDStr = coinPriceUSD == null ? "—" : formatUSD(coinPriceUSD);

  return (
    <section
      className="
        h-fit rounded-2xl border bg-white/60 dark:bg-neutral-900/60
        shadow-sm backdrop-blur-sm overflow-hidden
      "
    >
      {/* header */}
      <div className="px-5 py-4 border-b bg-gradient-to-b from-transparent to-black/[0.02] dark:to-white/[0.02]">
        <h2 className="text-lg font-semibold tracking-tight">Preview</h2>
      </div>

      {/* identity row */}
      <div className="px-5 py-4">
        <div className="flex items-start gap-4">
          {/* avatar / logo */}
          <div
            className="
              relative h-32 w-32 shrink-0 rounded-xl
              ring-1 ring-black/5 dark:ring-white/10
              bg-neutral-100 dark:bg-neutral-800
              grid place-items-center overflow-hidden
            "
          >
            {imgUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgUrl}
                alt={`${state.name || "Project"} logo`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-lg font-semibold text-neutral-500">
                {initial}
              </span>
            )}
          </div>

          {/* name/symbol/desc */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-xl font-bold leading-tight truncate">
                {state.name || "Unnamed"}
              </div>
              <div className="text-sm px-2 py-0.5 rounded-md border bg-neutral-50 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-300">
                [{state.symbol || "---"}]
              </div>
            </div>
            <p
              className="
                mt-1 text-sm text-neutral-600 dark:text-neutral-300
                whitespace-pre-wrap
              "
            >
              {state.description || "No description yet."}
            </p>
          </div>
        </div>
      </div>

      {/* supply slider */}
      <div className="px-5 pb-4">
        <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
          Supply breakdown
        </h3>

        {/* Segmented, read-only slider */}
        <div
          className="
            w-full h-4 rounded-full overflow-hidden border
            bg-neutral-100/70 dark:bg-neutral-800/70
          "
          role="slider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(breakdown.totalPct)}
          aria-label="Supply breakdown"
        >
          <div className="flex w-full h-full">
            {breakdown.items.map((seg) => (
              <div
                key={seg.key}
                className={`${seg.color} h-full`}
                style={{ width: `${seg.pct}%` }}
                title={`${seg.label}: ${seg.pct.toFixed(2)}% • ${formatToken(seg.value)} tokens`}
              />
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {breakdown.items.map((seg) => (
            <div
              key={seg.key}
              className="
                flex items-center justify-between gap-3
                rounded-lg border px-3 py-2
                bg-white/70 dark:bg-neutral-900/70
              "
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`inline-block h-3 w-3 rounded-sm ${seg.color}`}
                />
                <span className="text-sm font-medium truncate">
                  {seg.label}
                </span>
              </div>
              <div className="text-xs tabular-nums text-neutral-600 dark:text-neutral-300">
                {seg.pct.toFixed(2)}%
              </div>
            </div>
          ))}
        </div>

        {/* Totals row */}
        <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          Total: {formatToken(totalSupplyWei)} tokens
        </div>
      </div>

      {/* stats */}
      <div className="px-5 pb-5">
        <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-3">
          Tokenomics
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <InfoStat title="ETH Rate (×1e18)" value={ethRate.toString()} />
          <InfoStat title="OTC Supply (wei)" value={otcSupply.toString()} />

          {/* NEW: Initial coin price in USD */}
          <InfoStat title="Initial Price (USD)" value={coinPriceUSDStr} />

          {/*@ts-expect-error */}
          {templates[state.template].needsChef && (
            <InfoStat
              title="Incentive Amount (wei)"
              value={incentiveAmount.toString()}
            />
          )}
          {/*@ts-expect-error */}
          {templates[state.template].needsAirdrop && (
            <>
              <InfoStat
                title="Airdrop Incentive (wei)"
                value={airdropIncentive.toString()}
              />
              <InfoStat
                title="Airdrop Price X18"
                value={airdropPriceX18.toString()}
              />
            </>
          )}
          {/*@ts-expect-error */}
          {templates[state.template].needsChef && (
            <InfoStat
              title="Incentive Duration (sec)"
              value={incentiveDuration.toString()}
            />
          )}
        </div>
      </div>
    </section>
  );
};

function InfoStat({ title, value }: { title: string; value: string }) {
  return (
    <div
      className="
        p-4 rounded-xl border bg-white/70 dark:bg-neutral-900/70
        shadow-xs
      "
    >
      <div className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {title}
      </div>
      <div className="mt-1 font-mono text-xs break-all text-neutral-900 dark:text-neutral-50">
        {value || "—"}
      </div>
    </div>
  );
}

/* ----------------- helpers ----------------- */

/** Safe parseUnits for whole-token display strings using BigInt math (18 decimals). */
function parseUnitsSafe(display: string, decimals: bigint): bigint {
  const cleaned = (display || "").trim();
  if (!cleaned) return 0n;
  // Whole tokens only (form already assumes whole tokens). Strip everything after dot.
  const whole = cleaned.replace(/\..*$/, "");
  // Remove any non-digits for safety (e.g., commas)
  const digits = whole.replace(/[^\d]/g, "");
  if (!digits) return 0n;
  try {
    return BigInt(digits) * 10n ** decimals;
  } catch {
    return 0n;
  }
}

function max0(v: bigint) {
  return v < 0n ? 0n : v;
}

function computeBreakdown(
  parts: Array<{ key: string; label: string; value: bigint; color: string }>,
  total: bigint,
) {
  const safeTotal = total > 0n ? total : 1n;
  const items = parts
    .filter((p) => p.value > 0n)
    .map((p) => {
      // pct with two decimals precision using integer math: pct = (value * 10000) / total / 100
      const pctTimes100 = Number((p.value * 10000n) / safeTotal); // 0..10000
      return {
        ...p,
        pct: clamp(0, 100, pctTimes100 / 100),
      };
    });

  // Normalize minor rounding to ensure the bar fills ~100%
  const totalPct = items.reduce((acc, it) => acc + it.pct, 0);
  if (items.length && totalPct !== 100) {
    const diff = 100 - totalPct;
    items[0] = { ...items[0], pct: clamp(0, 100, items[0].pct + diff) };
  }

  return {
    items,
    totalPct: items.reduce((a, b) => a + b.pct, 0),
  };
}

function clamp(min: number, max: number, v: number) {
  return Math.min(max, Math.max(min, v));
}

function formatToken(wei: bigint) {
  // Format whole tokens by dividing by 1e18 (round down). For preview, whole-number readability is enough.
  const whole = wei / 10n ** 18n;
  return numberWithSeparators(whole.toString());
}

function numberWithSeparators(x: string) {
  return x.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function computeCoinUsdPrice(
  ethPriceUSD: number | null,
  coinsPerEth: bigint,
): number | null {
  if (ethPriceUSD == null) return null;
  if (coinsPerEth <= 0n) return null;
  const denom = Number(coinsPerEth);
  if (!isFinite(denom) || denom <= 0) return null;
  return ethPriceUSD / denom;
}

function formatUSD(n: number) {
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
