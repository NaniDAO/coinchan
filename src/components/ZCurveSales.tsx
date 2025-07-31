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

  /* Calculate momentum score based on recent activity */
  const calculateMomentum = (sale: any): number => {
    // Base momentum from transaction counts
    const buyCount = sale.purchases?.totalCount || 0;
    const sellCount = sale.sells?.totalCount || 0;
    const totalTxCount = buyCount + sellCount;
    
    // Time-based decay (newer sales have higher base momentum)
    const ageInHours = (Date.now() - Number(sale.createdAt)) / (1000 * 60 * 60);
    const timeFactor = Math.max(0, 1 - (ageInHours / 168)); // Decay over 1 week
    
    // Activity score with buy/sell ratio consideration
    // More buys than sells = positive momentum
    const buyRatio = totalTxCount > 0 ? buyCount / totalTxCount : 0.5;
    const activityScore = totalTxCount * (0.5 + buyRatio);
    
    // Combined momentum score
    return activityScore * timeFactor;
  };

  /* stable, sorted list with momentum data */
  const salesWithMomentum = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    
    // Calculate momentum for all active sales
    const activeSales = data.filter(sale => sale.status === "ACTIVE");
    const maxMomentum = Math.max(...activeSales.map(sale => calculateMomentum(sale)), 1);
    
    return (
      [...data]
        // Exclude test demo coins
        .filter((sale) => sale.coinId !== "69" && sale.coinId !== "71")
        .map(sale => {
          const momentum = calculateMomentum(sale);
          const fundedPercentage = calculateFundedPercentage(sale);
          const normalizedMomentum = (momentum / maxMomentum) * 100;
          
          // A sale has high momentum if it's getting boosted significantly beyond its funding level
          const hasHighMomentum = sale.status === "ACTIVE" && 
                                  normalizedMomentum > 20 && 
                                  normalizedMomentum > fundedPercentage * 0.5;
          
          return {
            ...sale,
            momentum,
            normalizedMomentum,
            hasHighMomentum
          };
        })
        .sort((a, b) => {
          // Always show active sales first
          if (a.status !== b.status) return a.status === "ACTIVE" ? -1 : 1;
          
          // For active sales, use combined score
          if (a.status === "ACTIVE" && b.status === "ACTIVE") {
            const fA = calculateFundedPercentage(a);
            const fB = calculateFundedPercentage(b);
            
            // Combine funding progress (70% weight) with momentum (30% weight)
            const scoreA = (fA * 0.7) + (a.normalizedMomentum * 0.3);
            const scoreB = (fB * 0.7) + (b.normalizedMomentum * 0.3);
            
            if (Math.abs(scoreA - scoreB) > 0.1) return scoreB - scoreA;
          }
          
          // Fallback to creation date
          return Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0);
        })
    );
  }, [data]);

  /* --------------------------------------------------------------------- */

  if (isLoading) return <SkeletonHeader />;
  if (error) return <ErrorBlock err={error} />;

  console.log("SALES WITH MOMENTUM:", salesWithMomentum);

  return (
    <div className="relative min-h-screen">
      {/* header */}
      <div className="flex items-center justify-between border-border p-3 text-foreground">
        <h2 className="font-mono text-2xl font-bold uppercase tracking-widest">
          {t("common.curved_coins", "CURVED COINS")} ({salesWithMomentum.length})
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
        {salesWithMomentum.length === 0 ? (
          <div className="rounded bg-secondary p-4 font-mono text-sm text-secondary-foreground">
            &gt; {t("sale.none", "No active sales")}
          </div>
        ) : (
          <div className="space-y-2 border-l-4 border-border">
            {salesWithMomentum.map((s) => {
              return <EnhancedSaleCard key={s.coinId.toString()} sale={s} fetchOnchainData={true} hasHighMomentum={s.hasHighMomentum} />;
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
      <h2 className="font-mono text-2xl font-bold uppercase tracking-widest">CURVED COINS</h2>
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
      <h2 className="font-mono text-2xl font-bold uppercase tracking-widest">CURVED COINS</h2>
    </div>
    <div className="p-4">
      <div className="rounded border border-destructive/50 bg-destructive/10 p-4 font-mono text-sm text-destructive">
        <div className="mb-1 font-bold">{err.name}</div>
        <div className="opacity-80">{err.message}</div>
      </div>
    </div>
  </div>
);
