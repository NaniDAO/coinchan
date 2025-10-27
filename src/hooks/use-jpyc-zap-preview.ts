import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { parseEther, type Address } from "viem";
import { ZAMMZapETHJPYCAbi, ZAMMZapETHJPYCAddress } from "../constants/ZAMMZapETHJPYC";
import { JPYC_POOL_KEY } from "../lib/coins";

interface UseJpycZapPreviewParams {
  ethAmount: string;
  swapBps: bigint;
  slippageBps: bigint;
  userAddress?: Address;
  enabled?: boolean;
}

/**
 * Hook to preview the JPYC zap using the ZAMMZapETHJPYC contract.
 *
 * This calls the previewZap function which uses zQuoter internally to find
 * the best route for acquiring JPYC (could be Uniswap V2/V3, Sushiswap,
 * Curve, or ZAMM itself).
 *
 * @param ethAmount - Amount of ETH to zap (as a string)
 * @param swapBps - Percentage of ETH to swap for JPYC (in basis points, e.g., 5000 = 50%)
 * @param slippageBps - Slippage tolerance (in basis points, e.g., 50 = 0.5%)
 * @param userAddress - User's wallet address
 * @param enabled - Whether to run the query
 */
export const useJpycZapPreview = ({
  ethAmount,
  swapBps,
  slippageBps,
  userAddress,
  enabled = true,
}: UseJpycZapPreviewParams) => {
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: ["jpyc-zap-preview", ethAmount, swapBps.toString(), slippageBps.toString(), userAddress],
    queryFn: async () => {
      if (!publicClient || !ethAmount) {
        throw new Error("Missing required parameters");
      }

      const ethTotalWei = parseEther(ethAmount);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 15 * 60); // 15 minutes from now

      // Use provided address or zapper contract address as fallback for preview
      // Since this is a view function, we just need any valid address for the preview
      const previewAddress = userAddress || ZAMMZapETHJPYCAddress;

      const result = await publicClient.readContract({
        address: ZAMMZapETHJPYCAddress,
        abi: ZAMMZapETHJPYCAbi,
        functionName: "previewZap",
        args: [JPYC_POOL_KEY as any, ethTotalWei, swapBps, slippageBps, deadline, previewAddress],
      });

      const [ethSwap, ethLP, predictedJPYC, jpycForLP] = result;

      return {
        ethSwap,
        ethLP,
        predictedJPYC,
        jpycForLP,
        ethTotal: ethTotalWei,
      };
    },
    enabled: enabled && !!publicClient && !!ethAmount && parseFloat(ethAmount) > 0,
    staleTime: 10_000, // 10 seconds
    retry: 2,
  });
};
