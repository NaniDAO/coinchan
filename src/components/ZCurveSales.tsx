/* ──────────────────────────────────────────────────────────────────────────
   ZCurve sales list
   Shows every live or finished bonding-curve launch, updating in near-real-time
   ────────────────────────────────────────────────────────────────────────── */

import { memo, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { formatImageURL } from "@/hooks/metadata";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { ZCURVE_STANDARD_PARAMS } from "@/lib/zCurveHelpers";
import type { ZCurveSale } from "@/hooks/use-zcurve-sale";

import { Badge } from "./ui/badge";
import { CreatorDisplay } from "./CreatorDisplay";
import { ZCurveMiniChart } from "./ZCurveMiniChart";

/* ------------------------------------------------------------------------- */
/*                               Types / GQL                                 */
/* ------------------------------------------------------------------------- */

interface GraphQLResponse {
  data?: {
    zcurveSales?: {
      items: Sale[];
    };
  };
  errors?: { message?: string }[];
}

interface Sale extends ZCurveSale {
  // values added by the GraphQL indexer
  purchases?: { totalCount: number; items: { buyer: string }[] };
  sells?: { totalCount: number; items: { seller: string }[] };
}

const GET_ZCURVE_SALES = /* GraphQL */ `
  query GetZCurveSales {
    zcurveSales {
      items {
        coinId
        createdAt
        creator
        currentPrice
        deadline
        divisor
        ethEscrow
        feeOrHook
        ethTarget
        lpSupply
        netSold
        percentFunded
        quadCap
        saleCap
        status
        purchases {
          totalCount
          items { buyer }
        }
        sells {
          totalCount
          items { seller }
        }
        coin {
          name
          symbol
          imageUrl
          description
          decimals
        }
      }
    }
  }
`;

/* ------------------------------------------------------------------------- */
/*                             Helper functions                              */
/* ------------------------------------------------------------------------- */

/**
 * Returns funding progress in the human range [0, 100]
 */
const calculateFundedPercentage = (sale: Sale): number => {
  try {
    if (sale.status === "FINALIZED") return 100;

    /* From the indexer: 10 000 = 100 % */
    const funded = typeof sale.percentFunded === "bigint" ? Number(sale.percentFunded) : (sale.percentFunded ?? 0);

    if (funded) return Math.min(funded / 100, 100);

    const escrow = BigInt(sale.ethEscrow ?? 0);
    const target = BigInt(sale.ethTarget ?? 0);
    if (target === 0n) return 0;

    return Number((escrow * 10_000n) / target) / 100;
  } catch (err) {
    console.error("calculateFundedPercentage()", err, sale);
    return 0;
  }
};

/**
 * Nicely formats a price given in wei
 * (uses BigInt internally so we never overflow JS Number)
 */
const formatPrice = (sale: Sale): string => {
  try {
    let priceWei = BigInt(sale.currentPrice ?? 0);

    if (sale.status === "FINALIZED" && priceWei === 0n) {
      /* average final price */
      const tokensSold = BigInt(sale.netSold ?? 0);
      const ethRaised = BigInt(sale.ethEscrow ?? 0);
      if (tokensSold !== 0n) priceWei = (ethRaised * 10n ** 18n) / tokensSold;
    }

    if (priceWei === 0n) return "0";

    const eth = Number(priceWei) / 1e18;

    if (eth < 1e-15) {
      return `${priceWei.toString()} wei`;
    }
    if (eth < 1e-9) {
      return `${(eth * 1e9).toFixed(3)} gwei`;
    }
    if (eth < 1e-6) {
      return `${(eth * 1e6).toFixed(3)} μETH`;
    }
    if (eth < 0.01) {
      return `${eth.toFixed(12).replace(/\.?0+$/, "")} ETH`;
    }
    return `${eth.toFixed(6)} ETH`;
  } catch (err) {
    console.error("formatPrice()", err, sale);
    return "—";
  }
};

/* ------------------------------------------------------------------------- */
/*                                 Queries                                   */
/* ------------------------------------------------------------------------- */

const useZCurveSales = () =>
  useQuery<Sale[], Error>({
    queryKey: ["zcurveSales"],
    queryFn: async () => {
      const url = import.meta.env.VITE_INDEXER_URL;
      if (!url) throw new Error("VITE_INDEXER_URL missing");

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30_000);

      try {
        const res = await fetch(`${url}/graphql`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: GET_ZCURVE_SALES }),
          signal: ctrl.signal,
        });

        clearTimeout(timer);
        if (!res.ok) throw new Error(res.statusText);

        const json = (await res.json()) as GraphQLResponse;
        if (json.errors?.length) throw new Error(json.errors[0]?.message ?? "GraphQL error");
        return json.data?.zcurveSales?.items ?? [];
      } finally {
        clearTimeout(timer);
      }
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 2,
    retryDelay: (i) => Math.min(1000 * 2 ** i, 30_000),
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
  });

/* ------------------------------------------------------------------------- */
/*                              Sale card                                    */
/* ------------------------------------------------------------------------- */

const SaleCard = memo(({ sale }: { sale: Sale }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  /* bail-out if data is incomplete */
  if (!sale?.coinId) return null;

  /* memoised expensive bits */
  const funded = useMemo(() => calculateFundedPercentage(sale), [sale]);
  const price = useMemo(() => formatPrice(sale), [sale]);
  const wallets = useMemo(() => {
    try {
      const buyers = sale.purchases?.items?.map((p) => p.buyer) ?? [];
      const sellers = sale.sells?.items?.map((s) => s.seller) ?? [];
      return new Set([...buyers, ...sellers]).size;
    } catch (err) {
      console.error("wallet count", err);
      return 0;
    }
  }, [sale]);

  const isStandard =
    sale.ethTarget === ZCURVE_STANDARD_PARAMS.ETH_TARGET.toString() &&
    sale.saleCap === ZCURVE_STANDARD_PARAMS.SALE_CAP.toString() &&
    sale.quadCap === ZCURVE_STANDARD_PARAMS.QUAD_CAP.toString();

  const goToSale = useCallback(() => {
    navigate({ to: "/c/$coinId", params: { coinId: String(sale.coinId) } });
  }, [navigate, sale.coinId]);

  /* --------------------------------------------------------------------- */

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={goToSale}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToSale();
        }
      }}
      className="block rounded focus:outline-none focus:ring-2 focus:ring-primary/50"
      aria-label={`View sale of ${sale.coin?.name ?? "coin"}`}
    >
      <div
        className={cn(
          "relative overflow-hidden border p-3 transition-all",
          "bg-card hover:bg-accent/5 hover:shadow-lg cursor-pointer",
          "border-border hover:border-primary active:border-primary/80 active:scale-[0.99]",
          sale.status === "FINALIZED" ? "bg-amber-50/5 dark:bg-amber-900/5" : "bg-green-50/5  dark:bg-green-900/5",
        )}
      >
        {/* funding background tint */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              sale.status === "FINALIZED"
                ? "linear-gradient(to right,rgba(245,158,11,.1) 0%,rgba(245,158,11,.05) 100%)"
                : `linear-gradient(to right,rgba(34,197,94,.1) 0%,rgba(34,197,94,.1) ${funded}%,transparent ${funded}%)`,
          }}
        />

        <div className="relative z-10 flex items-start gap-4">
          {/* image / fallback */}
          <div className="flex-shrink-0">
            <div className="h-8 w-8 overflow-hidden rounded-full border border-border bg-muted">
              {sale.coin?.imageUrl ? (
                <img
                  src={formatImageURL(sale.coin.imageUrl)}
                  alt={sale.coin?.name ?? "coin"}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    const el = e.target as HTMLImageElement;
                    el.style.display = "none";
                  }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-bold text-muted-foreground">
                  {sale.coin?.symbol?.[0]?.toUpperCase() ?? "?"}
                </div>
              )}
            </div>
          </div>

          {/* text block */}
          <div className="flex-1 text-sm font-mono">
            <div className="font-bold transition-colors group-hover:text-primary">
              {sale.coin?.name ?? "Unknown"} ({sale.coin?.symbol ?? "???"})
            </div>
            <div className="mt-1 line-clamp-2 text-muted-foreground">
              {sale.coin?.description ?? t("sale.no_desc", "No description")}
            </div>

            <div className="mt-2 space-y-2 text-[11px]">
              {/* price / funding */}
              <div className="grid grid-cols-2 gap-x-3">
                <div>
                  <span className="text-muted-foreground">
                    {sale.status === "FINALIZED"
                      ? t("sale.final_price_label", "Final Price")
                      : t("sale.price_label", "Current Price")}
                  </span>
                  <div className="font-medium">{price}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("sale.funded_label", "Funded")}</span>
                  <div className="font-medium">
                    {funded.toFixed(1)}%{isStandard && " of 10 ETH"}
                  </div>
                </div>
              </div>

              {/* trade activity */}
              <div className="border-t border-border/30 pt-1">
                <span className="font-medium">
                  {t("sale.buys_label", "Buys")} {sale.purchases?.totalCount ?? 0} | {t("sale.sells_label", "Sells")}{" "}
                  {sale.sells?.totalCount ?? 0} | {t("sale.wallets_label", "Wallets")} {wallets}
                </span>
              </div>

              {/* creator */}
              <div className="flex items-center gap-1 border-t border-border/30 pt-1">
                <span>{t("sale.creator_label", "Creator")}:</span>
                {sale.creator ? (
                  <CreatorDisplay address={sale.creator} size="sm" showLabel={false} />
                ) : (
                  <span className="text-muted-foreground">{t("common.unknown", "Unknown")}</span>
                )}
              </div>
            </div>
          </div>

          {/* mini-chart */}
          <div className="w-32 flex-shrink-0">
            <div className="rounded-sm border border-border bg-muted/20 p-1">
              <ZCurveMiniChart sale={sale} className="h-16 w-full" />
            </div>
          </div>

          {/* status & time info */}
          <div className="text-right text-xs font-mono">
            <Badge
              className={cn(
                "border border-border px-2 py-1",
                sale.status === "ACTIVE"
                  ? "bg-green-500 text-white"
                  : sale.status === "FINALIZED"
                    ? "bg-amber-500 text-white"
                    : "bg-gray-200 text-gray-600",
              )}
            >
              {sale.status}
            </Badge>

            <div className="mt-2 text-[11px] text-muted-foreground">
              <div>{sale.createdAt ? new Date(Number(sale.createdAt) * 1000).toLocaleDateString() : "Unknown"}</div>
              <div>{renderTimeInfo(sale)}</div>
            </div>
          </div>
        </div>

        {/* bottom progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-border/20">
          <div
            className={cn(
              "h-full transition-all duration-300",
              sale.status === "FINALIZED" ? "bg-amber-500/50" : "bg-green-500/50",
            )}
            style={{ width: `${Math.min(funded, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
});

SaleCard.displayName = "SaleCard";

/* helper for time left / duration */
function renderTimeInfo(sale: Sale): string {
  if (!sale.deadline) return "→ Unknown";

  const deadline = new Date(Number(sale.deadline) * 1000);
  const now = new Date();

  if (sale.status === "ACTIVE" && deadline > now) {
    const diff = deadline.getTime() - now.getTime();
    const d = Math.floor(diff / 86_400_000);
    const h = Math.floor((diff % 86_400_000) / 3_600_000);
    if (d) return `→ ${d}d ${h}h left`;
    const m = Math.floor((diff % 3_600_000) / 60_000);
    return `→ ${h ? `${h}h ` : ""}${m}m left`;
  }

  if (sale.createdAt) {
    const created = new Date(Number(sale.createdAt) * 1000);
    const days = Math.round((deadline.getTime() - created.getTime()) / 86_400_000);
    if (days === 14) return "→ 2-week sale";
    if (days === 7) return "→ 1-week sale";
    return `→ ${days}-day sale`;
  }

  return "→ Unknown";
}

/* ------------------------------------------------------------------------- */
/*                            Page component                                 */
/* ------------------------------------------------------------------------- */

export const ZCurveSales = () => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { data, isLoading, error, isRefetching } = useZCurveSales();

  /* stable, sorted list */
  const sales = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => {
      if (a.status !== b.status) return a.status === "ACTIVE" ? -1 : 1;
      const fA = calculateFundedPercentage(a);
      const fB = calculateFundedPercentage(b);
      if (fA !== fB) return fB - fA;
      return Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0);
    });
  }, [data]);

  /* --------------------------------------------------------------------- */

  if (isLoading) return <SkeletonHeader />;
  if (error) return <ErrorBlock err={error} />;

  return (
    <div className="relative min-h-screen">
      {/* header */}
      <div className="flex items-center justify-between border-border p-3 text-foreground">
        <h2 className="font-mono text-2xl font-bold uppercase tracking-widest">
          ZCURVE {t("common.sales", "SALES")} ({sales.length})
        </h2>

        <span className="text-xs font-mono text-muted-foreground">Standard: 800 M cap · 10 ETH target · 69 % quad</span>

        {isRefetching && (
          <span className="animate-pulse text-xs font-mono text-muted-foreground">
            {t("common.updating", "Updating")}…
          </span>
        )}
      </div>

      {/* list */}
      <div className="p-4">
        {sales.length === 0 ? (
          <div className="rounded bg-secondary p-4 font-mono text-sm text-secondary-foreground">
            &gt; {t("sale.none", "No active sales")}
          </div>
        ) : (
          <div className="space-y-2 border-l-4 border-border">
            {sales.map((s) => (
              <SaleCard key={s.coinId.toString()} sale={s} />
            ))}
          </div>
        )}
      </div>

      {/* decorative video */}
      <video
        className="fixed bottom-5 right-5 h-40 w-40"
        style={{ clipPath: "polygon(50% 10%,75% 50%,50% 90%,25% 50%)" }}
        src={theme === "dark" ? "/zammzamm-bw.mp4" : "/zammzamm.mp4"}
        autoPlay
        loop
        muted
      />
    </div>
  );
};

/* ------------------------------------------------------------------------- */
/*                               UI helpers                                  */
/* ------------------------------------------------------------------------- */

const SkeletonHeader = () => (
  <div>
    <div className="p-3 text-foreground">
      <h2 className="font-mono text-2xl font-bold uppercase tracking-widest">ZCURVE SALES</h2>
    </div>
    <div className="p-4">
      <div className="space-y-2 border-l-4 border-border">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse border border-border bg-card p-3">
            <div className="flex items-start gap-4">
              <div className="h-8 w-8 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 rounded bg-muted" />
                <div className="h-3 w-2/3 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
              </div>
              <div className="h-16 w-32 rounded bg-muted" />
              <div className="w-16 space-y-2">
                <div className="h-6 rounded bg-muted" />
                <div className="h-3 rounded bg-muted" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const ErrorBlock = ({ err }: { err: Error }) => (
  <div>
    <div className="p-3 text-foreground">
      <h2 className="font-mono text-2xl font-bold uppercase tracking-widest">ZCURVE SALES</h2>
    </div>
    <div className="p-4">
      <div className="rounded border border-destructive/50 bg-destructive/10 p-4 font-mono text-sm text-destructive">
        <div className="mb-1 font-bold">{err.name}</div>
        <div className="opacity-80">{err.message}</div>
      </div>
    </div>
  </div>
);
