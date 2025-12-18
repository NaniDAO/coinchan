import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { useMemo } from "react";
import { PMRouterAddress, PMRouterAbi, type PMRouterOrder, getOrderPrice } from "@/constants/PMRouter";
import { toast } from "sonner";
import { isUserRejectionError } from "@/lib/errors";

export interface UserOrder {
  orderHash: `0x${string}`;
  order: PMRouterOrder;
  price: number;
  sharesFilled: bigint;
  sharesRemaining: bigint;
  collateralFilled: bigint;
  collateralRemaining: bigint;
  active: boolean;
  percentFilled: number;
}

/**
 * Fetch user's orders from PMRouter
 */
export function useUserOrders({
  marketId,
  enabled = true,
}: {
  marketId?: bigint;
  enabled?: boolean;
} = {}) {
  const { address } = useAccount();

  // Get user's order count
  const { data: orderCount } = useReadContract({
    address: PMRouterAddress,
    abi: PMRouterAbi,
    functionName: "getUserOrderCount",
    args: address ? [address] : undefined,
    query: {
      enabled: enabled && !!address,
    },
  });

  // Get user's order hashes (paginated, get first 50)
  const { data: orderHashes, refetch: refetchHashes } = useReadContract({
    address: PMRouterAddress,
    abi: PMRouterAbi,
    functionName: "getUserOrderHashes",
    args: address ? [address, 0n, 50n] : undefined,
    query: {
      enabled: enabled && !!address && (orderCount ?? 0n) > 0n,
    },
  });

  // Get details for each order
  const orderDetailContracts = useMemo(() => {
    if (!orderHashes || orderHashes.length === 0) return [];
    return orderHashes.map((hash) => ({
      address: PMRouterAddress,
      abi: PMRouterAbi,
      functionName: "getOrder" as const,
      args: [hash] as const,
    }));
  }, [orderHashes]);

  const { data: orderDetails, refetch: refetchDetails, isLoading } = useReadContracts({
    contracts: orderDetailContracts,
    query: {
      enabled: orderDetailContracts.length > 0,
      staleTime: 10_000,
    },
  });

  // Process orders
  const orders: UserOrder[] = useMemo(() => {
    if (!orderHashes || !orderDetails) return [];

    return orderHashes
      .map((hash, i) => {
        const result = orderDetails[i];
        if (result.status !== "success" || !result.result) return null;

        const [order, sharesFilled, sharesRemaining, collateralFilled, collateralRemaining, active] =
          result.result as [
            {
              owner: `0x${string}`;
              deadline: bigint;
              isYes: boolean;
              isBuy: boolean;
              partialFill: boolean;
              shares: bigint;
              collateral: bigint;
              marketId: bigint;
            },
            bigint,
            bigint,
            bigint,
            bigint,
            boolean,
          ];

        // Filter by marketId if specified
        if (marketId !== undefined && order.marketId !== marketId) return null;

        const pmOrder: PMRouterOrder = {
          owner: order.owner,
          deadline: order.deadline,
          isYes: order.isYes,
          isBuy: order.isBuy,
          partialFill: order.partialFill,
          shares: order.shares,
          collateral: order.collateral,
          marketId: order.marketId,
        };

        const totalShares = sharesFilled + sharesRemaining;
        const percentFilled = totalShares > 0n ? Number((sharesFilled * 100n) / totalShares) : 0;

        return {
          orderHash: hash,
          order: pmOrder,
          price: getOrderPrice(pmOrder),
          sharesFilled,
          sharesRemaining,
          collateralFilled,
          collateralRemaining,
          active,
          percentFilled,
        };
      })
      .filter((o): o is UserOrder => o !== null);
  }, [orderHashes, orderDetails, marketId]);

  // Separate active and inactive orders
  const activeOrders = orders.filter((o) => o.active);
  const inactiveOrders = orders.filter((o) => !o.active);

  const refetch = () => {
    refetchHashes();
    refetchDetails();
  };

  return {
    orders,
    activeOrders,
    inactiveOrders,
    orderCount: orderCount ?? 0n,
    isLoading,
    refetch,
  };
}

/**
 * Hook to place a limit order via PMRouter
 */
export function usePlaceOrder() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const placeOrder = async ({
    marketId,
    isYes,
    isBuy,
    shares,
    collateral,
    deadline,
    partialFill = true,
  }: {
    marketId: bigint;
    isYes: boolean;
    isBuy: boolean;
    shares: bigint;
    collateral: bigint;
    deadline: bigint;
    partialFill?: boolean;
  }) => {
    try {
      // For buy orders, we need to send ETH
      const value = isBuy ? collateral : 0n;

      writeContract({
        address: PMRouterAddress,
        abi: PMRouterAbi,
        functionName: "placeOrder",
        args: [
          marketId,
          isYes,
          isBuy,
          shares, // uint96
          collateral, // uint96
          deadline, // uint56
          partialFill,
        ],
        value,
      });
    } catch (err) {
      if (!isUserRejectionError(err)) {
        toast.error("Failed to place order");
        console.error(err);
      }
    }
  };

  return {
    placeOrder,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  };
}

/**
 * Hook to cancel a limit order via PMRouter
 */
export function useCancelOrder() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const cancelOrder = async (orderHash: `0x${string}`) => {
    try {
      writeContract({
        address: PMRouterAddress,
        abi: PMRouterAbi,
        functionName: "cancelOrder",
        args: [orderHash],
      });
    } catch (err) {
      if (!isUserRejectionError(err)) {
        toast.error("Failed to cancel order");
        console.error(err);
      }
    }
  };

  return {
    cancelOrder,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  };
}

/**
 * Hook to fill a limit order via PMRouter
 */
export function useFillOrder() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const fillOrder = async ({
    orderHash,
    sharesToFill,
    collateralRequired,
    isBuyOrder, // Is the order we're filling a BUY order?
  }: {
    orderHash: `0x${string}`;
    sharesToFill: bigint;
    collateralRequired: bigint;
    isBuyOrder: boolean;
  }) => {
    if (!address) {
      toast.error("Please connect wallet");
      return;
    }

    try {
      // If filling a BUY order, we provide shares and receive collateral (no ETH needed)
      // If filling a SELL order, we provide collateral (ETH) and receive shares
      const value = isBuyOrder ? 0n : collateralRequired;

      writeContract({
        address: PMRouterAddress,
        abi: PMRouterAbi,
        functionName: "fillOrder",
        args: [orderHash, sharesToFill, address],
        value,
      });
    } catch (err) {
      if (!isUserRejectionError(err)) {
        toast.error("Failed to fill order");
        console.error(err);
      }
    }
  };

  return {
    fillOrder,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  };
}

/**
 * Hook for hybrid execution - fill orders then swap via AMM
 * This is the optimal execution path for large trades
 */
export function useFillOrdersThenSwap() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const execute = async ({
    marketId,
    isYes,
    isBuy,
    totalAmount,
    minOutput,
    orderHashes,
    feeOrHook,
    deadline,
  }: {
    marketId: bigint;
    isYes: boolean;
    isBuy: boolean;
    totalAmount: bigint; // collateral if buying, shares if selling
    minOutput: bigint;
    orderHashes: `0x${string}`[];
    feeOrHook: bigint;
    deadline: bigint;
  }) => {
    if (!address) {
      toast.error("Please connect wallet");
      return;
    }

    try {
      // For buying, we send ETH (totalAmount is collateral)
      // For selling, we don't send ETH (totalAmount is shares)
      const value = isBuy ? totalAmount : 0n;

      writeContract({
        address: PMRouterAddress,
        abi: PMRouterAbi,
        functionName: "fillOrdersThenSwap",
        args: [marketId, isYes, isBuy, totalAmount, minOutput, orderHashes, feeOrHook, address, deadline],
        value,
      });
    } catch (err) {
      if (!isUserRejectionError(err)) {
        toast.error("Failed to execute trade");
        console.error(err);
      }
    }
  };

  return {
    execute,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  };
}

/**
 * Hook for YES<->NO swaps via ZAMM
 */
export function useSwapShares() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const swapShares = async ({
    marketId,
    yesForNo,
    amountIn,
    minOut,
    feeOrHook,
    deadline,
  }: {
    marketId: bigint;
    yesForNo: boolean; // true = YES->NO, false = NO->YES
    amountIn: bigint;
    minOut: bigint;
    feeOrHook: bigint;
    deadline: bigint;
  }) => {
    if (!address) {
      toast.error("Please connect wallet");
      return;
    }

    try {
      writeContract({
        address: PMRouterAddress,
        abi: PMRouterAbi,
        functionName: "swapShares",
        args: [marketId, yesForNo, amountIn, minOut, feeOrHook, address, deadline],
      });
    } catch (err) {
      if (!isUserRejectionError(err)) {
        toast.error("Failed to swap shares");
        console.error(err);
      }
    }
  };

  return {
    swapShares,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  };
}
