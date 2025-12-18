import React, { useMemo } from "react";
import { formatEther } from "viem";
import { cn } from "@/lib/utils";
import type { Orderbook, OrderbookEntry } from "@/hooks/use-market-orderbook";
import { Loader2 } from "lucide-react";

interface OrderbookDisplayProps {
  orderbook: Orderbook | null;
  isLoading?: boolean;
  onSelectPrice?: (price: number, isBuy: boolean) => void;
  maxRows?: number;
  showSpread?: boolean;
  compact?: boolean;
  ammPrice?: number; // Current AMM price for reference
}

export const OrderbookDisplay: React.FC<OrderbookDisplayProps> = ({
  orderbook,
  isLoading = false,
  onSelectPrice,
  maxRows = 8,
  showSpread = true,
  compact = false,
  ammPrice,
}) => {
  // Calculate max total for depth visualization
  const maxTotal = useMemo(() => {
    if (!orderbook) return 0n;
    const maxBid = orderbook.bids.length > 0 ? orderbook.bids[orderbook.bids.length - 1].total : 0n;
    const maxAsk = orderbook.asks.length > 0 ? orderbook.asks[orderbook.asks.length - 1].total : 0n;
    return maxBid > maxAsk ? maxBid : maxAsk;
  }, [orderbook]);

  // Slice to maxRows
  const displayBids = orderbook?.bids.slice(0, maxRows) ?? [];
  const displayAsks = orderbook?.asks.slice(0, maxRows) ?? [];

  // Reverse asks so best ask is at bottom (closest to spread)
  const reversedAsks = [...displayAsks].reverse();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!orderbook || (orderbook.bids.length === 0 && orderbook.asks.length === 0)) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground">
        No orders in book
      </div>
    );
  }

  const formatPrice = (price: number) => {
    if (price >= 0.01) return price.toFixed(4);
    return price.toFixed(6);
  };

  const formatSize = (size: bigint) => {
    const val = Number(formatEther(size));
    if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
    if (val >= 1) return val.toFixed(2);
    return val.toFixed(4);
  };

  return (
    <div className={cn("font-mono text-xs", compact ? "text-[10px]" : "text-xs")}>
      {/* Header */}
      <div className="grid grid-cols-3 gap-1 px-2 py-1 text-muted-foreground border-b border-border/50">
        <div>Price</div>
        <div className="text-right">Size</div>
        <div className="text-right">Total</div>
      </div>

      {/* Asks (sells) - shown in reverse so best ask is at bottom */}
      <div className="relative">
        {reversedAsks.length === 0 ? (
          <div className="py-2 text-center text-muted-foreground">No asks</div>
        ) : (
          reversedAsks.map((entry) => (
            <OrderRow
              key={entry.orderHash}
              entry={entry}
              maxTotal={maxTotal}
              isBid={false}
              onClick={() => onSelectPrice?.(entry.price, true)}
              compact={compact}
              formatPrice={formatPrice}
              formatSize={formatSize}
            />
          ))
        )}
      </div>

      {/* Spread indicator */}
      {showSpread && (
        <div className="flex items-center justify-between px-2 py-1.5 bg-muted/30 border-y border-border/50">
          <span className="text-muted-foreground">Spread</span>
          <span className="flex items-center gap-2">
            {orderbook.spread !== null ? (
              <>
                <span className="text-foreground">{formatPrice(orderbook.spread)}</span>
                {orderbook.midPrice !== null && (
                  <span className="text-muted-foreground">
                    ({((orderbook.spread / orderbook.midPrice) * 100).toFixed(2)}%)
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </span>
        </div>
      )}

      {/* AMM Price reference */}
      {ammPrice !== undefined && (
        <div className="flex items-center justify-between px-2 py-1 bg-primary/5 text-primary text-[10px]">
          <span>AMM Price</span>
          <span>{formatPrice(ammPrice)}</span>
        </div>
      )}

      {/* Bids (buys) */}
      <div className="relative">
        {displayBids.length === 0 ? (
          <div className="py-2 text-center text-muted-foreground">No bids</div>
        ) : (
          displayBids.map((entry) => (
            <OrderRow
              key={entry.orderHash}
              entry={entry}
              maxTotal={maxTotal}
              isBid={true}
              onClick={() => onSelectPrice?.(entry.price, false)}
              compact={compact}
              formatPrice={formatPrice}
              formatSize={formatSize}
            />
          ))
        )}
      </div>
    </div>
  );
};

interface OrderRowProps {
  entry: OrderbookEntry;
  maxTotal: bigint;
  isBid: boolean;
  onClick?: () => void;
  compact?: boolean;
  formatPrice: (price: number) => string;
  formatSize: (size: bigint) => string;
}

const OrderRow: React.FC<OrderRowProps> = ({
  entry,
  maxTotal,
  isBid,
  onClick,
  compact,
  formatPrice,
  formatSize,
}) => {
  // Calculate depth bar width
  const depthPercent = maxTotal > 0n ? (Number(entry.total) / Number(maxTotal)) * 100 : 0;

  return (
    <div
      className={cn(
        "relative grid grid-cols-3 gap-1 px-2 cursor-pointer transition-colors",
        compact ? "py-0.5" : "py-1",
        "hover:bg-muted/50",
      )}
      onClick={onClick}
    >
      {/* Depth background bar */}
      <div
        className={cn(
          "absolute inset-y-0 right-0 opacity-20",
          isBid ? "bg-green-500" : "bg-red-500",
        )}
        style={{ width: `${depthPercent}%` }}
      />

      {/* Price */}
      <div className={cn("relative z-10", isBid ? "text-green-500" : "text-red-500")}>
        {formatPrice(entry.price)}
      </div>

      {/* Size */}
      <div className="relative z-10 text-right text-foreground">
        {formatSize(entry.size)}
      </div>

      {/* Total */}
      <div className="relative z-10 text-right text-muted-foreground">
        {formatSize(entry.total)}
      </div>
    </div>
  );
};

/**
 * Compact orderbook preview for the limit order form
 */
export const OrderbookPreview: React.FC<{
  orderbook: Orderbook | null;
  isLoading?: boolean;
  isBuy: boolean;
  onSelectPrice?: (price: number) => void;
}> = ({ orderbook, isLoading, isBuy: _isBuy, onSelectPrice }) => {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading orderbook...
      </div>
    );
  }

  if (!orderbook) return null;

  // Show best bid and ask
  const bestBid = orderbook.bestBid;
  const bestAsk = orderbook.bestAsk;

  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-3">
        {bestBid !== null && (
          <button
            type="button"
            onClick={() => onSelectPrice?.(bestBid)}
            className="flex items-center gap-1 hover:underline"
          >
            <span className="text-muted-foreground">Bid:</span>
            <span className="text-green-500 font-mono">{bestBid.toFixed(4)}</span>
          </button>
        )}
        {bestAsk !== null && (
          <button
            type="button"
            onClick={() => onSelectPrice?.(bestAsk)}
            className="flex items-center gap-1 hover:underline"
          >
            <span className="text-muted-foreground">Ask:</span>
            <span className="text-red-500 font-mono">{bestAsk.toFixed(4)}</span>
          </button>
        )}
      </div>
      {orderbook.spread !== null && (
        <span className="text-muted-foreground">
          Spread: {orderbook.spread.toFixed(4)}
        </span>
      )}
    </div>
  );
};

export default OrderbookDisplay;
