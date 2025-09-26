import { formatDuration } from "@/lib/date";
import { templates } from "./RaiseForm";
import { formatEther } from "viem"; // ✅ use library utility
import { bigintToNumberSafe, formatDexscreenerStyle } from "@/lib/math";
import { useTranslation } from "react-i18next";

export const PreviewRaise = ({
  state,
  imageBuffer,
  ethRate,
  otcSupply,
  incentiveAmount,
  incentiveDuration,
  ethPriceUSD,
}: {
  state: any;
  imageBuffer: ArrayBuffer | null;
  ethRate: bigint;
  otcSupply: bigint;
  incentiveAmount: bigint;
  incentiveDuration: bigint;
  ethPriceUSD: number | null;
}) => {
  const { t, i18n } = useTranslation();
  const imgUrl = imageBuffer
    ? URL.createObjectURL(new Blob([imageBuffer]))
    : null;

  const initial = (state?.name?.trim?.()?.charAt(0) || "Z").toUpperCase();

  // ----- Supply breakdown (percent-safe with BigInt math) -----
  const totalSupplyWei = parseUnitsSafe(state.totalSupplyDisplay, 18n);
  const creatorSupplyWei = parseUnitsSafe(state.creatorSupplyDisplay, 18n);
  // Calculate 5% of total supply if airdrop display is not set
  const defaultAirdrop = (Number(state.totalSupplyDisplay?.replace(/,/g, '') || "1000000000") * 0.05).toString();
  const airdropSupply = parseUnitsSafe(state.airdropIncentiveDisplay || defaultAirdrop, 18n);

  // @ts-expect-error
  const needsChef = templates[state.template].needsChef;

  const parts: Array<{
    key: string;
    label: string;
    value: bigint;
    color: string;
  }> = [
    { key: "otc", label: t("raise.preview.otc"), value: max0(otcSupply), color: "bg-blue-500" },
    {
      key: "creator",
      label: t("raise.preview.creator"),
      value: max0(creatorSupplyWei),
      color: "bg-emerald-500",
    },
    {
      key: "airdrop",
      label: t("raise.preview.airdrop") || "Airdrop",
      value: max0(airdropSupply),
      color: "bg-purple-500",
    },
    ...(needsChef
      ? [
          {
            key: "incentive",
            label: t("raise.preview.incentive"),
            value: max0(incentiveAmount),
            color: "bg-fuchsia-500",
          },
        ]
      : []),
  ];

  const breakdown = computeBreakdown(parts, totalSupplyWei);

  // ----- Initial coin price in ETH & USD -----
  // Interpret ethRate as tokens-per-ETH scaled by 1e18 (consistent with existing code).
  const coinsPerEth = ethRate > 0n ? ethRate / 10n ** 18n : 0n;

  // price in ETH per token
  const coinPriceETH = computeCoinEthPrice(coinsPerEth);

  // price in USD per token
  const coinPriceUSD = computeCoinUsdPrice(ethPriceUSD, coinsPerEth);
  const coinPriceUSDStr = coinPriceUSD == null ? "—" : formatUSD(coinPriceUSD);

  const symbol = state.symbol || "---";
  const initialPriceCombined =
    coinPriceETH == null && coinPriceUSD == null
      ? "—"
      : `1 ${symbol} = ${formatDexscreenerStyle(coinPriceETH ?? 0)} ETH = ${coinPriceUSDStr} USD`;

  // Calculate max ETH that can be raised from OTC supply
  // Note: Both airdrop and farm incentives are allocated separately and don't reduce ETH raised
  // All ETH from the sale goes to the creator
  const otcSupplyForEthCalc = totalSupplyWei - creatorSupplyWei;
  const maxEthRaisable = coinsPerEth > 0n ? otcSupplyForEthCalc / coinsPerEth : 0n;
  const maxEthRaisableStr = formatEtherWithCommas(maxEthRaisable, 6);
  const maxUsdRaisable = ethPriceUSD && maxEthRaisable > 0n
    ? Number(formatEther(maxEthRaisable)) * ethPriceUSD
    : null;

  // Build dynamic summary
  const buildSummary = () => {
    const otcSupplyFormatted = formatTokenCompact(otcSupply);
    const totalSupplyFormatted = formatTokenCompact(totalSupplyWei);
    const creatorSupplyFormatted = formatTokenCompact(creatorSupplyWei);
    const airdropSupplyFormatted = formatTokenCompact(airdropSupply);
    const incentiveFormatted = needsChef ? formatTokenCompact(incentiveAmount) : null;
    const maxEthFormatted = formatEther(maxEthRaisable);

    // Remove trailing zeros and format nicely
    const cleanEth = Number(maxEthFormatted).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3
    });

    if (i18n.language === 'zh') {
      let summary = `您正在通过 ${otcSupplyFormatted} 个代币的销售筹集最多 ${cleanEth} ETH`;
      if (creatorSupplyWei > 0n) {
        summary += `，${creatorSupplyFormatted} 个创建者储备`;
      }
      if (airdropSupply > 0n) {
        summary += `，${airdropSupplyFormatted} 个空投`;
      }
      if (needsChef && incentiveAmount > 0n) {
        summary += `，${incentiveFormatted} 个农场激励`;
      }
      summary += `（总供应量：${totalSupplyFormatted}）`;
      return summary;
    } else {
      let summary = `You are raising up to ${cleanEth} ETH through a ${otcSupplyFormatted} token sale`;
      const parts = [];
      if (creatorSupplyWei > 0n) {
        parts.push(`${creatorSupplyFormatted} creator reserve`);
      }
      if (airdropSupply > 0n) {
        parts.push(`${airdropSupplyFormatted} airdrop`);
      }
      if (needsChef && incentiveAmount > 0n) {
        parts.push(`${incentiveFormatted} farm incentives`);
      }
      if (parts.length > 0) {
        summary += ` with ${parts.join(', ')}`;
      }
      summary += ` (${totalSupplyFormatted} total supply)`;
      return summary;
    }
  };

  return (
    <section
      className="
        h-fit rounded-2xl border bg-white/60 dark:bg-neutral-900/60
        shadow-sm backdrop-blur-sm overflow-hidden
      "
    >
      {/* header */}
      <div className="px-5 py-4 border-b bg-gradient-to-b from-transparent to-black/[0.02] dark:to-white/[0.02]">
        <h2 className="text-lg font-semibold tracking-tight">{t("raise.preview.title")}</h2>
      </div>

      {/* Summary sentence */}
      <div className="px-5 py-3 bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-blue-950/20 dark:to-purple-950/20 border-b">
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
          {buildSummary()}
        </p>
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
                {state.name || t("raise.preview.unnamed")}
              </div>
              <div className="text-sm px-2 py-0.5 rounded-md border bg-neutral-50 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-300">
                [{symbol}]
              </div>
            </div>
            <p
              className="
                mt-1 text-sm text-neutral-600 dark:text-neutral-300
                whitespace-pre-wrap
              "
            >
              {state.description || t("raise.preview.no_description")}
            </p>
          </div>
        </div>
      </div>

      {/* supply slider */}
      <div className="px-5 pb-4">
        <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
          {t("raise.preview.supply_breakdown")}
        </h3>

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
                title={`${seg.label}: ${formatPct(seg.pct, 2)} • ${formatToken(
                  seg.value,
                )} tokens`}
              />
            ))}
          </div>
        </div>

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
                {formatPct(seg.pct, 2)}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          {t("raise.preview.total")} {formatToken(totalSupplyWei)} tokens
        </div>
      </div>

      {/* stats */}
      <div className="px-5 pb-5">
        <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-3">
          {t("raise.preview.tokenomics")}
        </h3>
        <InfoStat
          title={t("raise.preview.total_supply") || "Total Supply"}
          value={`${formatToken(totalSupplyWei)} ${symbol}`}
        />
        <InfoStat
          title={t("raise.preview.otc_supply") || "OTC Supply"}
          value={`${formatToken(otcSupply)} ${symbol}`}
        />
        <InfoStat
          title={t("raise.preview.eth_rate") || "Tokens per ETH"}
          value={formatEtherWithCommas(ethRate, 6)}
        />
        <InfoStat
          title={t("raise.preview.initial_price")}
          value={initialPriceCombined}
        />
        <InfoStat
          title={t("raise.preview.max_eth_raise") || "Max ETH Raisable"}
          value={`${maxEthRaisableStr} ETH${maxUsdRaisable ? ` (${formatUSD(maxUsdRaisable)})` : ""}`}
        />
        {/*@ts-expect-error*/}
        {templates[state.template].needsChef && (
          <div>
            <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-3">
              {t("raise.preview.farming_incentives")}
            </h3>
            <InfoStat
              title={`${t("raise.preview.incentive_amount")} ${state.symbol && state.symbol}`}
              value={formatEtherWithCommas(incentiveAmount, 6)}
            />
            <InfoStat
              title={t("raise.preview.incentive_duration")}
              value={formatDuration(bigintToNumberSafe(incentiveDuration))}
            />
          </div>
        )}
      </div>
    </section>
  );
};

function InfoStat({ title, value }: { title: string; value: string }) {
  return (
    <div className="w-full flex flex-row justify-between py-1 px-2 rounded-none mb-1 bg-secondary text-secondary-foreground">
      <div className="text-sm uppercase tracking-wide">{title}</div>
      <div className="mt-1 font-mono text-sm break-all">{value || "—"}</div>
    </div>
  );
}

/* ----------------- helpers ----------------- */

function parseUnitsSafe(display: string, decimals: bigint): bigint {
  const cleaned = (display || "").trim();
  if (!cleaned) return 0n;
  // Remove commas first
  const noCommas = cleaned.replace(/,/g, "");
  const whole = noCommas.replace(/\..*$/, "");
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
      const pctTimes100 = Number((p.value * 10000n) / safeTotal);
      return {
        ...p,
        pct: clamp(0, 100, pctTimes100 / 100),
      };
    });

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
  const whole = wei / 10n ** 18n;
  return numberWithSeparators(whole.toString());
}

function formatTokenCompact(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const num = Number(whole);

  if (num >= 1e9) {
    return (num / 1e9).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    }) + 'B';
  }
  if (num >= 1e6) {
    return (num / 1e6).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    }) + 'M';
  }
  if (num >= 1e3) {
    return (num / 1e3).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    }) + 'K';
  }
  return num.toLocaleString();
}

function numberWithSeparators(x: string) {
  return x.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Insert commas into the integer part of a decimal string, keep fraction as-is. */
function withCommasDecimalString(s: string) {
  const [int, frac] = s.split(".");
  const withInt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac != null && frac.length > 0 ? `${withInt}.${frac}` : withInt;
}

/** Trim trailing zeros in the fraction; keep up to maxFractionDigits (no rounding). */
function trimFraction(s: string, maxFractionDigits = 6) {
  if (!s.includes(".")) return s;
  let [int, frac] = s.split(".");
  if (maxFractionDigits >= 0) frac = frac.slice(0, maxFractionDigits);
  frac = frac.replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

/** Format a decimal string (e.g., result of formatEther) with commas + trimmed fraction. */
function formatDecimalString(s: string, maxFractionDigits = 6) {
  return withCommasDecimalString(trimFraction(s, maxFractionDigits));
}

/** ETH (from wei) → "1,234.5678" (no precision loss). */
function formatEtherWithCommas(wei: bigint, maxFractionDigits = 6) {
  return formatDecimalString(formatEther(wei), maxFractionDigits);
}

/** Percent to "12,345.67%". */
function formatPct(p: number, digits = 2) {
  return (
    p.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }) + "%"
  );
}

/** Compute ETH price per token as a JS number from bigint tokens-per-ETH (integer). */
function computeCoinEthPrice(coinsPerEth: bigint): number | null {
  if (coinsPerEth <= 0n) return null;
  const denom = Number(coinsPerEth);
  if (!isFinite(denom) || denom <= 0) return null;
  return 1 / denom;
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
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}
