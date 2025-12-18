import React, { useEffect } from "react";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, Clock, CheckCircle2 } from "lucide-react";
import { useUserOrders, useCancelOrder, type UserOrder } from "@/hooks/use-user-orders";
import { cn } from "@/lib/utils";

interface UserOrdersListProps {
  marketId?: bigint;
  onOrderCancelled?: () => void;
  compact?: boolean;
}

export const UserOrdersList: React.FC<UserOrdersListProps> = ({
  marketId,
  onOrderCancelled,
  compact = false,
}) => {
  const { address } = useAccount();
  const { activeOrders, inactiveOrders, isLoading, refetch } = useUserOrders({ marketId });
  const { cancelOrder, isPending: isCancelling, isSuccess: cancelSuccess, reset } = useCancelOrder();

  // Refresh on cancel success
  useEffect(() => {
    if (cancelSuccess) {
      toast.success("Order cancelled");
      reset();
      refetch();
      onOrderCancelled?.();
    }
  }, [cancelSuccess, reset, refetch, onOrderCancelled]);

  if (!address) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Connect wallet to view orders
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (activeOrders.length === 0 && inactiveOrders.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground">
        No orders found
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Active Orders */}
      {activeOrders.length > 0 && (
        <div className="space-y-2">
          {!compact && (
            <h4 className="text-sm font-medium text-muted-foreground">Active Orders</h4>
          )}
          {activeOrders.map((order) => (
            <OrderCard
              key={order.orderHash}
              order={order}
              onCancel={() => cancelOrder(order.orderHash)}
              isCancelling={isCancelling}
              compact={compact}
            />
          ))}
        </div>
      )}

      {/* Inactive Orders (filled/expired) */}
      {!compact && inactiveOrders.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Past Orders</h4>
          {inactiveOrders.slice(0, 5).map((order) => (
            <OrderCard
              key={order.orderHash}
              order={order}
              compact={compact}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface OrderCardProps {
  order: UserOrder;
  onCancel?: () => void;
  isCancelling?: boolean;
  compact?: boolean;
}

const OrderCard: React.FC<OrderCardProps> = ({
  order,
  onCancel,
  isCancelling,
  compact,
}) => {
  const formatPrice = (price: number) => price.toFixed(4);
  const formatAmount = (amount: bigint) => {
    const val = Number(formatEther(amount));
    if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
    return val.toFixed(4);
  };

  const expiresIn = Number(order.order.deadline) - Math.floor(Date.now() / 1000);
  const isExpired = expiresIn <= 0;
  const isFilled = order.sharesRemaining === 0n;

  const sideLabel = order.order.isYes ? "YES" : "NO";
  const actionLabel = order.order.isBuy ? "Buy" : "Sell";

  if (compact) {
    return (
      <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-xs">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              order.order.isBuy
                ? "bg-green-500/10 text-green-500 border-green-500/30"
                : "bg-red-500/10 text-red-500 border-red-500/30"
            )}
          >
            {actionLabel}
          </Badge>
          <span className="font-mono">{formatPrice(order.price)}</span>
          <span className="text-muted-foreground">×</span>
          <span>{formatAmount(order.order.shares)} {sideLabel}</span>
        </div>
        {order.active && onCancel && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onCancel}
            disabled={isCancelling}
          >
            {isCancelling ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <X className="h-3 w-3" />
            )}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="p-3 rounded-lg border border-border bg-card">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          {/* Order Type Badge */}
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                order.order.isBuy
                  ? "bg-green-500/10 text-green-500 border-green-500/30"
                  : "bg-red-500/10 text-red-500 border-red-500/30"
              )}
            >
              {actionLabel} {sideLabel}
            </Badge>
            {isFilled && (
              <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Filled
              </Badge>
            )}
            {isExpired && !isFilled && (
              <Badge variant="outline" className="bg-muted text-muted-foreground">
                Expired
              </Badge>
            )}
            {order.active && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">
                <Clock className="h-3 w-3 mr-1" />
                Active
              </Badge>
            )}
          </div>

          {/* Price and Size */}
          <div className="flex items-baseline gap-3 text-sm">
            <span className="font-mono">
              <span className="text-muted-foreground">@</span> {formatPrice(order.price)} ETH
            </span>
            <span className="text-muted-foreground">×</span>
            <span className="font-mono">{formatAmount(order.order.shares)} shares</span>
          </div>

          {/* Fill Progress */}
          {order.percentFilled > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${order.percentFilled}%` }}
                />
              </div>
              <span className="text-muted-foreground">{order.percentFilled}% filled</span>
            </div>
          )}

          {/* Expiry */}
          {order.active && !isExpired && (
            <p className="text-xs text-muted-foreground">
              Expires in {formatTimeRemaining(expiresIn)}
            </p>
          )}
        </div>

        {/* Cancel Button */}
        {order.active && onCancel && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isCancelling}
            className="text-muted-foreground hover:text-destructive"
          >
            {isCancelling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </>
            )}
          </Button>
        )}
      </div>

      {/* Order Details */}
      <div className="mt-2 pt-2 border-t border-border/50 grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Total Value: </span>
          <span className="font-mono">{formatAmount(order.order.collateral)} ETH</span>
        </div>
        <div>
          <span className="text-muted-foreground">Remaining: </span>
          <span className="font-mono">{formatAmount(order.sharesRemaining)} shares</span>
        </div>
      </div>
    </div>
  );
};

function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export default UserOrdersList;
