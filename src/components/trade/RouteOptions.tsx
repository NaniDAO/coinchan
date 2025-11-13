import { cn } from "@/lib/utils";
import type { TokenMetadata } from "@/lib/pools";

interface RouteOption {
  amountIn: string;
  amountOut: string;
  venue: string;
  isMultiHop: boolean;
  sources?: string[];
  route: any;
}

interface RouteOptionsProps {
  routes: RouteOption[];
  selectedRouteIndex: number;
  onRouteSelect: (index: number) => void;
  side: "EXACT_IN" | "EXACT_OUT";
  sellToken?: TokenMetadata;
  buyToken?: TokenMetadata;
}

export function RouteOptions({
  routes,
  selectedRouteIndex,
  onRouteSelect,
  side,
  sellToken,
  buyToken,
}: RouteOptionsProps) {
  if (!routes || routes.length <= 1) {
    return null;
  }

  return (
    <div className="mt-2 p-3 bg-muted/30 rounded-lg space-y-2">
      <div className="text-xs font-medium text-muted-foreground">Select Route</div>
      <div className="space-y-1.5">
        {routes.map((routeOption, index) => {
          const isSelected = index === selectedRouteIndex;
          const isBest = index === 0;

          // Format venue name
          const venueName = routeOption.venue.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

          // Determine route type label
          const routeType = routeOption.isMultiHop ? "Multi-hop" : "Direct";

          // Determine route source (Matcha vs ZRouter)
          const isMatchaRoute = routeOption.venue.toUpperCase() === "MATCHA";
          const isZammRoute = routeOption.venue.toUpperCase() === "VZ";

          return (
            <button
              key={index}
              type="button"
              onClick={() => onRouteSelect(index)}
              className={cn(
                "w-full p-2.5 rounded-md text-left transition-all",
                "border border-border/50 hover:border-primary/50",
                "flex items-center justify-between gap-2",
                isSelected && "bg-primary/10 border-primary",
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{venueName}</span>
                  {isBest && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-600 dark:text-green-400">
                      BEST
                    </span>
                  )}
                  {isMatchaRoute && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-600 dark:text-blue-400">
                      MATCHA
                    </span>
                  )}
                  {isZammRoute && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-600 dark:text-purple-400">
                      ZROUTER
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{routeType}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {side === "EXACT_IN"
                    ? `Get ${routeOption.amountOut} ${buyToken?.symbol || ""}`
                    : `Pay ${routeOption.amountIn} ${sellToken?.symbol || ""}`}
                </div>
                {routeOption.sources && routeOption.sources.length > 0 && (
                  <div className="text-[10px] text-muted-foreground mt-1">
                    via {routeOption.sources.slice(0, 3).join(", ")}
                    {routeOption.sources.length > 3 && ` +${routeOption.sources.length - 3} more`}
                  </div>
                )}
              </div>
              <div
                className={cn(
                  "w-4 h-4 rounded-full border-2 flex-shrink-0",
                  isSelected ? "border-primary bg-primary" : "border-border",
                )}
              >
                {isSelected && <div className="w-full h-full rounded-full bg-background scale-50" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
