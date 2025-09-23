import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Order } from "@/components/OrdersPage";
import { usePublicClient } from "wagmi";
import { useSendTransaction } from "wagmi";
import { encodeFunctionData } from "viem";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { mainnet } from "viem/chains";

interface FillOrderParams {
  order: Order;
  amount: bigint;
}

export const useFillOrder = () => {
  const queryClient = useQueryClient();
  const publicClient = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();

  const fillOrder = useMutation({
    mutationFn: async ({ order, amount }: FillOrderParams) => {
      if (!publicClient) throw new Error("Public client not available");

      // For veZAMM to ZAMM redemption:
      // The order is: maker wants veZAMM (tokenOut = Cookbook, idOut = 87)
      //               and gives ZAMM (tokenIn = Coins, idIn = ZAMM token ID)
      // The user is filling with veZAMM to receive ZAMM

      // Encode fillOrder call
      const fillOrderData = encodeFunctionData({
        abi: CookbookAbi,
        functionName: "fillOrder",
        args: [
          order.maker as `0x${string}`,
          order.tokenIn as `0x${string}`,
          BigInt(order.idIn),
          BigInt(order.amtIn),
          order.tokenOut as `0x${string}`,
          BigInt(order.idOut),
          BigInt(order.amtOut),
          BigInt(order.deadline),
          order.partialFill,
          amount,
        ],
      });

      // Execute the fillOrder transaction
      const hash = await sendTransactionAsync({
        to: CookbookAddress,
        data: fillOrderData,
        value: 0n, // No ETH value needed for token-to-token fills
        chainId: mainnet.id,
      });

      // Wait for transaction to mine
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
      });

      if (receipt.status !== "success") {
        throw new Error("Transaction failed");
      }

      return hash;
    },
    onSuccess: () => {
      // Invalidate order queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ["order"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  return { fillOrder };
};
