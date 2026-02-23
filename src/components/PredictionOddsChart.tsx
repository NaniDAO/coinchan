import { LoadingLogo } from "@/components/ui/loading-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchPredictionChart } from "@/lib/indexer";
import { calculateYesProbability } from "@/constants/PAMMSingleton";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface PredictionOddsChartProps {
  marketId: string;
  description?: string;
}

const PredictionOddsChart: React.FC<PredictionOddsChartProps> = ({ marketId, description }) => {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const { data, isLoading, error } = useQuery({
    queryKey: ["predictionChart", marketId],
    queryFn: () => fetchPredictionChart(marketId),
    staleTime: 60_000,
    gcTime: 300_000,
    retry: 3,
    enabled: !!marketId,
    refetchOnWindowFocus: false,
  });

  const chartData = useMemo(() => {
    if (!data?.data || data.data.length === 0) return [];
    return data.data
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((p) => {
        // Compute odds client-side from raw reserves to ensure correct AMM pricing
        // YES% = rNo / (rYes + rNo) — inverse relationship in constant-product AMM
        const { yesPercent, noPercent } = calculateYesProbability(BigInt(p.rYes), BigInt(p.rNo));
        return {
          timestamp: p.timestamp,
          yes: Math.round(yesPercent * 100) / 100,
          no: Math.round(noPercent * 100) / 100,
          eventType: p.eventType,
        };
      });
  }, [data]);

  const market = data?.market;
  const marketDescription = description || market?.description;

  // Compute current odds from raw reserves for consistency
  const currentOdds = useMemo(() => {
    if (!market?.currentRYes || !market?.currentRNo) return null;
    return calculateYesProbability(BigInt(market.currentRYes), BigInt(market.currentRNo));
  }, [market]);

  const yesColor = isDark ? "#33ff99" : "#10b981";
  const noColor = isDark ? "#ff3358" : "#ef4444";
  const gridColor = isDark ? "hsl(var(--border) / 0.15)" : "hsl(var(--border) / 0.25)";
  const textColor = "hsl(var(--muted-foreground))";

  if (isLoading) {
    return (
      <div className="relative h-full w-full min-h-[300px]">
        <div className="absolute inset-0 p-4">
          <div className="h-full w-full flex flex-col justify-end space-y-1">
            <Skeleton className="h-[60%] w-full opacity-10" />
            <Skeleton className="h-[30%] w-full opacity-10" />
          </div>
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <LoadingLogo />
          <p className="text-sm text-muted-foreground animate-pulse mt-3">Loading odds data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px] text-muted-foreground">
        Failed to load prediction data.
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px] text-muted-foreground">
        No odds data available.
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
        {marketDescription && (
          <p className="text-sm font-medium text-foreground truncate max-w-[60%]">{marketDescription}</p>
        )}
        {market && (
          <div className="flex items-center gap-2 ml-auto text-sm">
            {market.resolved ? (
              <span
                className={cn(
                  "px-2 py-0.5 rounded-md text-xs font-semibold",
                  market.outcome ? "bg-emerald-500/20 text-emerald-500" : "bg-red-500/20 text-red-500",
                )}
              >
                Resolved: {market.outcome ? "YES" : "NO"}
              </span>
            ) : currentOdds ? (
              <>
                <span className="font-semibold" style={{ color: yesColor }}>
                  YES {currentOdds.yesPercent.toFixed(1)}%
                </span>
                <span className="text-muted-foreground">/</span>
                <span className="font-semibold" style={{ color: noColor }}>
                  NO {currentOdds.noPercent.toFixed(1)}%
                </span>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0 text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="yesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={yesColor} stopOpacity={isDark ? 0.4 : 0.3} />
                <stop offset="95%" stopColor={yesColor} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="noGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={noColor} stopOpacity={isDark ? 0.4 : 0.3} />
                <stop offset="95%" stopColor={noColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="14 10" stroke={gridColor} strokeWidth={0.5} vertical={false} />

            <XAxis
              dataKey="timestamp"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(ts) => {
                const d = new Date(ts * 1000);
                return d.toLocaleDateString([], { month: "short", day: "numeric" });
              }}
              stroke={textColor}
              tickLine={false}
              axisLine={false}
              dy={10}
              style={{ fontSize: "11px" }}
              minTickGap={50}
            />

            <YAxis
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              stroke={textColor}
              tickLine={false}
              axisLine={false}
              dx={-10}
              style={{ fontSize: "11px" }}
              width={50}
            />

            <Tooltip content={<OddsTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1, strokeDasharray: "4 4" }} />

            <Area
              type="monotone"
              dataKey="yes"
              stroke={yesColor}
              strokeWidth={2}
              fill="url(#yesGradient)"
              fillOpacity={1}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              name="YES"
            />
            <Area
              type="monotone"
              dataKey="no"
              stroke={noColor}
              strokeWidth={2}
              fill="url(#noGradient)"
              fillOpacity={1}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              name="NO"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const OddsTooltip = ({ active, payload }: any) => {
  if (!active || !payload || payload.length === 0) return null;

  const d = payload[0].payload;
  const date = new Date(d.timestamp * 1000);

  const eventLabels: Record<string, string> = {
    SEEDED: "Seeded",
    BOUGHT: "Bought",
    SOLD: "Sold",
  };

  return (
    <div className="bg-background/95 backdrop-blur-sm border border-border/50 rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground mb-1">
        {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </p>
      <div className="flex items-center gap-3 text-sm">
        <span className="font-semibold text-emerald-500">YES {d.yes.toFixed(1)}%</span>
        <span className="font-semibold text-red-500">NO {d.no.toFixed(1)}%</span>
      </div>
      {d.eventType && (
        <p className="text-xs text-muted-foreground mt-1">{eventLabels[d.eventType] || d.eventType}</p>
      )}
    </div>
  );
};

export default PredictionOddsChart;
