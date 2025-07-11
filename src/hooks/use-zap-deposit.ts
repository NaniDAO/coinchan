import { ZChefAbi, ZChefAddress } from "@/constants/zChef";
import type { ZapCalculation } from "@/hooks/use-zap-calculations";
import { handleWalletError } from "@/lib/errors";
import { DEADLINE_SEC } from "@/lib/swap";
import { nowSec } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { mainnet } from "viem/chains";
import { usePublicClient, useWriteContract } from "wagmi";

export interface ZapDepositParams {
  chefId: bigint;
  ethAmount: bigint;
  zapCalculation: ZapCalculation;
}

export function useZapDeposit() {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();

  const zapDeposit = useMutation({
    mutationFn: async ({ chefId, ethAmount, zapCalculation }: ZapDepositParams) => {
      if (!zapCalculation.isValid) {
        throw new Error(zapCalculation.error || "Invalid zap calculation");
      }

      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      const hash = await writeContractAsync({
        address: ZChefAddress,
        abi: ZChefAbi,
        functionName: "zapDeposit",
        args: [
          zapCalculation.lpSrc, // lpSrc (ZAMM or Cookbook address)
          chefId, // chefId
          zapCalculation.poolKey, // poolKey
          zapCalculation.amountOutMin, // amountOutMin (minimum tokens from swap)
          zapCalculation.amount0Min, // amount0Min (minimum ETH for liquidity)
          zapCalculation.amount1Min, // amount1Min (minimum tokens for liquidity)
          deadline, // deadline
        ],
        value: ethAmount, // msg.value (full ETH amount)
        chainId: mainnet.id,
      });

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      return hash;
    },
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["userIncentivePositions"] });
      queryClient.invalidateQueries({ queryKey: ["userIncentivePosition"] });
      queryClient.invalidateQueries({ queryKey: ["incentiveStream"] });
      queryClient.invalidateQueries({ queryKey: ["activeIncentiveStreams"] });
    },
    onError: (error) => {
      // Use handleWalletError for graceful error handling
      const errorMessage = handleWalletError(error);
      // Only log if it's not a user rejection
      if (errorMessage) {
        console.error("Zap deposit failed:", error);
      }
    },
  });

  return zapDeposit;
}
