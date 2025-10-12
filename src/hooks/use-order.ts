import { useQuery } from "@tanstack/react-query";
import { INDEXER_URL } from "@/lib/indexer";
import type { Order } from "@/components/OrdersPage";

const fetchOrderById = async (orderId: string): Promise<Order | null> => {
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
    const errorText = await response.text();
    throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(data.errors[0].message);
  }

  return data.data?.order || null;
};

export const useOrder = (orderId: string | undefined) => {
  return useQuery({
    queryKey: ["order", orderId],
    queryFn: () => fetchOrderById(orderId!),
    enabled: !!orderId,
    refetchInterval: 10000, // Refetch every 10 seconds to get updated status
    staleTime: 5000,
  });
};
