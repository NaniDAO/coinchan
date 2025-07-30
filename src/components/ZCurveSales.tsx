import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useZCurveSales } from "@/hooks/use-zcurve-sales";
import { EnhancedSaleCard } from "./EnhancedSaleCard";
import { useTheme } from "@/lib/theme";
import { calculateFundedPercentage } from "@/lib/zcurve";

/* ------------------------------------------------------------------------- */
/*                             Helper functions                              */
/* ------------------------------------------------------------------------- */


export const ZCurveSales = () => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { data, isLoading, error, isRefetching } = useZCurveSales();

  /* stable, sorted list */
  const sales = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    return [...data]
      // Exclude test demo coins
      .filter(sale => sale.coinId !== "69" && sale.coinId !== "71")
      .sort((a, b) => {
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

  console.log("SALES:", sales);

  return (
    <div className="relative min-h-screen">
      {/* header */}
      <div className="flex items-center justify-between border-border p-3 text-foreground">
        <h2 className="font-mono text-2xl font-bold uppercase tracking-widest">
          {t("common.curved_coins", "CURVED COINS")} ({sales.length})
        </h2>

        <div className="flex items-center gap-4">
          <span className="text-xs font-mono text-muted-foreground">
            Standard: 800 M cap · 10 ETH target · 69 % quad
          </span>

          {isRefetching && (
            <span className="animate-pulse text-xs font-mono text-muted-foreground">
              {t("common.updating", "Updating")}…
            </span>
          )}
        </div>
      </div>

      {/* list */}
      <div className="p-4">
        {sales.length === 0 ? (
          <div className="rounded bg-secondary p-4 font-mono text-sm text-secondary-foreground">
            &gt; {t("sale.none", "No active sales")}
          </div>
        ) : (
          <div className="space-y-2 border-l-4 border-border">
            {sales.map((s) => {               
              return <EnhancedSaleCard key={s.coinId.toString()} sale={s} fetchOnchainData={true} />
            })}
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
      <h2 className="font-mono text-2xl font-bold uppercase tracking-widest">
        CURVED COINS
      </h2>
    </div>
    <div className="p-4">
      <div className="space-y-2 border-l-4 border-border">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse border border-border bg-card p-3"
          >
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
      <h2 className="font-mono text-2xl font-bold uppercase tracking-widest">
        CURVED COINS
      </h2>
    </div>
    <div className="p-4">
      <div className="rounded border border-destructive/50 bg-destructive/10 p-4 font-mono text-sm text-destructive">
        <div className="mb-1 font-bold">{err.name}</div>
        <div className="opacity-80">{err.message}</div>
      </div>
    </div>
  </div>
);
