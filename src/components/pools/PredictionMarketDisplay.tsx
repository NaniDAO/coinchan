import { formatEther, zeroAddress } from "viem";
import { cn } from "@/lib/utils";
import type { PAMMMarketData } from "@/hooks/use-pamm-market";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

interface PredictionMarketDisplayProps {
  marketData: PAMMMarketData;
  className?: string;
}

/**
 * Displays prediction market odds in a Polymarket-style format
 */
export function PredictionMarketDisplay({ marketData, className }: PredictionMarketDisplayProps) {
  const {
    description,
    yesPercent,
    noPercent,
    resolved,
    outcome,
    tradingOpen,
    closeTimestamp,
    collateral,
    collateralLocked,
    rYes,
    rNo,
  } = marketData;

  const formatCollateral = (value: bigint | null) => {
    if (!value) return "—";
    const formatted = Number(formatEther(value));
    if (formatted >= 1000000) return `${(formatted / 1000000).toFixed(2)}M`;
    if (formatted >= 1000) return `${(formatted / 1000).toFixed(2)}K`;
    return formatted.toFixed(2);
  };

  const getCollateralSymbol = () => {
    if (!collateral || collateral === zeroAddress) return "ETH";
    return "Token";
  };

  const formatCloseDate = (timestamp: bigint | null) => {
    if (!timestamp) return null;
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = () => {
    if (resolved) {
      return (
        <Badge
          variant="outline"
          className={cn(
            "gap-1",
            outcome
              ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
              : "border-rose-500 text-rose-600 dark:text-rose-400",
          )}
        >
          {outcome ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {outcome ? "YES Won" : "NO Won"}
        </Badge>
      );
    }

    if (!tradingOpen) {
      return (
        <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600 dark:text-amber-400">
          <AlertCircle className="w-3 h-3" />
          Closed
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="gap-1 border-blue-500 text-blue-600 dark:text-blue-400">
        <Clock className="w-3 h-3" />
        Open
      </Badge>
    );
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Prediction Market Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
          Prediction Market
        </Badge>
        {getStatusBadge()}
      </div>

      {/* Market Question */}
      {description && (
        <div className="p-4 rounded-lg bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 border border-purple-200 dark:border-purple-800">
          <h3 className="font-semibold text-lg text-foreground">{description}</h3>
          {closeTimestamp !== null && closeTimestamp > 0n && (
            <p className="text-sm text-muted-foreground mt-1">Resolves: {formatCloseDate(closeTimestamp)}</p>
          )}
        </div>
      )}

      {/* Large Odds Display - Polymarket Style */}
      <div className="grid grid-cols-2 gap-4">
        {/* YES Side */}
        <div
          className={cn(
            "relative rounded-xl p-4 border-2 transition-all",
            resolved && outcome
              ? "bg-emerald-100 dark:bg-emerald-950/40 border-emerald-400"
              : resolved
                ? "bg-muted/30 border-muted opacity-50"
                : "bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/30 dark:to-emerald-900/30 border-emerald-300 dark:border-emerald-700",
          )}
        >
          {resolved && outcome && (
            <div className="absolute top-2 right-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
          )}
          <div className="text-sm font-medium text-emerald-700 dark:text-emerald-300 mb-1">YES</div>
          <div className="text-4xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {yesPercent.toFixed(1)}%
          </div>
          <div className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-2">
            {rYes !== null && `${formatCollateral(rYes)} ${getCollateralSymbol()} in pool`}
          </div>
        </div>

        {/* NO Side */}
        <div
          className={cn(
            "relative rounded-xl p-4 border-2 transition-all",
            resolved && !outcome
              ? "bg-rose-100 dark:bg-rose-950/40 border-rose-400"
              : resolved
                ? "bg-muted/30 border-muted opacity-50"
                : "bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-950/30 dark:to-rose-900/30 border-rose-300 dark:border-rose-700",
          )}
        >
          {resolved && !outcome && (
            <div className="absolute top-2 right-2">
              <CheckCircle2 className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
          )}
          <div className="text-sm font-medium text-rose-700 dark:text-rose-300 mb-1">NO</div>
          <div className="text-4xl font-bold text-rose-600 dark:text-rose-400 tabular-nums">
            {noPercent.toFixed(1)}%
          </div>
          <div className="text-xs text-rose-600/70 dark:text-rose-400/70 mt-2">
            {rNo !== null && `${formatCollateral(rNo)} ${getCollateralSymbol()} in pool`}
          </div>
        </div>
      </div>

      {/* Probability Bar */}
      <div className="space-y-2">
        <div className="flex h-4 rounded-full overflow-hidden bg-muted/30 shadow-inner">
          <div
            className={cn(
              "transition-all duration-500",
              resolved && outcome
                ? "bg-emerald-500"
                : resolved
                  ? "bg-muted"
                  : "bg-gradient-to-r from-emerald-400 to-emerald-500",
            )}
            style={{ width: `${yesPercent}%` }}
          />
          <div
            className={cn(
              "transition-all duration-500",
              resolved && !outcome
                ? "bg-rose-500"
                : resolved
                  ? "bg-muted"
                  : "bg-gradient-to-r from-rose-400 to-rose-500",
            )}
            style={{ width: `${noPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span className="tabular-nums">{yesPercent.toFixed(2)}% YES</span>
          <span className="tabular-nums">{noPercent.toFixed(2)}% NO</span>
        </div>
      </div>

      {/* Collateral Info */}
      {collateralLocked !== null && collateralLocked > 0n && (
        <div className="flex justify-between items-center text-sm p-3 rounded-lg bg-muted/30 border border-border/50">
          <span className="text-muted-foreground">Total Collateral Locked</span>
          <span className="font-medium tabular-nums">
            {formatCollateral(collateralLocked)} {getCollateralSymbol()}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Compact odds display for header/overview areas
 */
export function PredictionMarketOddsCompact({
  yesPercent,
  noPercent,
  resolved,
  outcome,
  className,
}: {
  yesPercent: number;
  noPercent: number;
  resolved?: boolean;
  outcome?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            "w-3 h-3 rounded-full",
            resolved && outcome ? "bg-emerald-500 ring-2 ring-emerald-300" : "bg-emerald-500",
          )}
        />
        <span
          className={cn(
            "font-bold text-lg tabular-nums",
            resolved && !outcome ? "text-muted-foreground" : "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {yesPercent.toFixed(1)}%
        </span>
        <span className="text-xs text-muted-foreground">YES</span>
      </div>
      <div className="w-px h-4 bg-border" />
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            "w-3 h-3 rounded-full",
            resolved && !outcome ? "bg-rose-500 ring-2 ring-rose-300" : "bg-rose-500",
          )}
        />
        <span
          className={cn(
            "font-bold text-lg tabular-nums",
            resolved && outcome ? "text-muted-foreground" : "text-rose-600 dark:text-rose-400",
          )}
        >
          {noPercent.toFixed(1)}%
        </span>
        <span className="text-xs text-muted-foreground">NO</span>
      </div>
    </div>
  );
}
