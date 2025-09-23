import { useQuery } from "@tanstack/react-query";
import { INDEXER_URL } from "@/lib/indexer";
import type { Order } from "@/components/OrdersPage";
import { usePublicClient } from "wagmi";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { CoinsAddress } from "@/constants/Coins";

// Try to fetch from indexer first - get all orders and filter client-side
const fetchRedemptionOrderFromIndexer = async (): Promise<Order | null> => {
  try {
    // Fetch all recent orders (same as orders page does)
    const query = `
      query GetOrders {
        orders(
          orderBy: "createdAt",
          orderDirection: "desc",
          limit: 500
        ) {
          items {
            id
            maker
            tokenIn
            idIn
            amtIn
            tokenOut
            idOut
            amtOut
            deadline
            partialFill
            inDone
            outDone
            status
            createdAt
            updatedAt
            txHash
            blockNumber
          }
        }
      }
    `;

    const response = await fetch(INDEXER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      console.warn("Indexer request failed:", response.status);
      return null;
    }

    const data = await response.json();

    if (data.errors) {
      console.warn("GraphQL errors:", data.errors);
      return null;
    }

    const orders = data.data?.orders?.items || [];

    // First check if our specific order exists
    const SPECIFIC_ORDER_ID_NO_PREFIX =
      "2602BA56DE653CE8782AD8D8AB8994FBA221605254503D4B3472BB6F492D5597";
    const specificOrder = orders.find(
      (order: Order) =>
        order.id.toLowerCase() === SPECIFIC_ORDER_ID_NO_PREFIX.toLowerCase() ||
        order.id.toLowerCase() ===
          `0x${SPECIFIC_ORDER_ID_NO_PREFIX}`.toLowerCase(),
    );

    if (specificOrder) {
      // Return it if it's ZAMM -> veZAMM
      return specificOrder;
    }

    // Filter for ZAMM -> veZAMM orders
    // ZAMM token is from Coins contract, veZAMM is Cookbook ID 87
    const redemptionOrders = orders.filter((order: Order) => {
      // Check if tokenIn is Coins contract (ZAMM)
      const isZammIn =
        order.tokenIn.toLowerCase() === CoinsAddress.toLowerCase();
      // Check if tokenOut is Cookbook contract and ID is 87 (veZAMM)
      const isVeZammOut =
        order.tokenOut.toLowerCase() === CookbookAddress.toLowerCase() &&
        order.idOut === "87";

      // Also check if order is active or has remaining amount
      const isActive = order.status === "ACTIVE";
      const hasRemaining = BigInt(order.amtIn) > BigInt(order.inDone || "0");

      return isZammIn && isVeZammOut && (isActive || hasRemaining);
    });

    // Return the most recent active order
    if (redemptionOrders.length > 0) {
      // Check deadline to ensure it's still valid
      const now = Date.now() / 1000;
      const validOrder = redemptionOrders.find((order: Order) => {
        const deadline = Number(order.deadline);
        return deadline === 0 || deadline > now;
      });

      return validOrder || redemptionOrders[0]; // Return first even if expired for display
    }

    return null;
  } catch (error) {
    console.warn("Failed to fetch from indexer:", error);
    return null;
  }
};

// Fallback: Try specific order ID from indexer
const fetchSpecificOrderFromIndexer = async (
  orderId: string,
): Promise<Order | null> => {
  try {
    const query = `
      query GetOrder($id: String!) {
        order(id: $id) {
          id
          maker
          tokenIn
          idIn
          amtIn
          tokenOut
          idOut
          amtOut
          deadline
          partialFill
          inDone
          outDone
          status
          createdAt
          updatedAt
          txHash
          blockNumber
        }
      }
    `;

    const response = await fetch(INDEXER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: { id: orderId },
      }),
    });

    if (!response.ok) {
      console.warn(
        "Indexer request failed for specific order:",
        response.status,
      );
      return null;
    }

    const data = await response.json();

    if (data.errors) {
      console.warn("GraphQL errors for specific order:", data.errors);
      return null;
    }

    return data.data?.order || null;
  } catch (error) {
    console.warn("Failed to fetch specific order from indexer:", error);
    return null;
  }
};

// Fallback: Read from onchain
const fetchOrderOnchain = async (
  publicClient: any,
  orderId: string,
): Promise<Order | null> => {
  try {
    // The order ID is a hash, we need to check if this order exists onchain
    // Cookbook has a getOrder function we can use
    // Ensure the order ID is properly formatted as 0x-prefixed bytes32
    const formattedOrderId = orderId.startsWith("0x")
      ? orderId
      : `0x${orderId}`;

    const orderData = await publicClient.readContract({
      address: CookbookAddress,
      abi: CookbookAbi,
      functionName: "orders",
      args: [formattedOrderId as `0x${string}`],
    });

    if (!orderData) return null;

    // Parse the onchain data into our Order format
    // The onchain data structure might be different, so we need to map it
    const [
      maker,
      tokenIn,
      idIn,
      amtIn,
      tokenOut,
      idOut,
      amtOut,
      deadline,
      partialFill,
      inDone,
      outDone,
    ] = orderData;

    // Check if order exists (maker should not be zero address)
    if (maker === "0x0000000000000000000000000000000000000000") {
      return null;
    }

    return {
      id: orderId,
      maker: maker.toLowerCase(),
      tokenIn: tokenIn.toLowerCase(),
      idIn: idIn.toString(),
      amtIn: amtIn.toString(),
      tokenOut: tokenOut.toLowerCase(),
      idOut: idOut.toString(),
      amtOut: amtOut.toString(),
      deadline: deadline.toString(),
      partialFill: partialFill,
      inDone: inDone.toString(),
      outDone: outDone.toString(),
      status: "ACTIVE", // We'll determine this based on deadline and amounts
      createdAt: String(Math.floor(Date.now() / 1000)), // Not available onchain
      updatedAt: String(Math.floor(Date.now() / 1000)), // Not available onchain
      txHash: "", // Not available onchain
      blockNumber: "0", // Not available onchain
    };
  } catch (error) {
    console.warn("Failed to fetch order onchain:", error);
    return null;
  }
};

export const useRedemptionOrder = () => {
  const publicClient = usePublicClient();

  // The specific order ID provided by the user (with 0x prefix for onchain calls)
  const SPECIFIC_ORDER_ID =
    "0x2602BA56DE653CE8782AD8D8AB8994FBA221605254503D4B3472BB6F492D5597";

  return useQuery({
    queryKey: ["redemption-order", SPECIFIC_ORDER_ID],
    queryFn: async () => {
      // Try multiple strategies in order

      // 1. Try to fetch ZAMM -> veZAMM orders from indexer
      let order = await fetchRedemptionOrderFromIndexer();
      if (order) {
        return order;
      }

      // 2. Try to fetch the specific order ID from indexer
      order = await fetchSpecificOrderFromIndexer(SPECIFIC_ORDER_ID);
      if (order) {
        return order;
      }

      // 3. Try to fetch from onchain as last resort
      if (publicClient) {
        order = await fetchOrderOnchain(publicClient, SPECIFIC_ORDER_ID);
        if (order) {
          return order;
        }
      }

      console.warn("No redemption order found");
      return null;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 15000,
    retry: 2,
  });
};
