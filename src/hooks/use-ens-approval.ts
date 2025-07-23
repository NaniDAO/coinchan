import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { usePublicClient, useWriteContract } from "wagmi";
import { erc20Abi, maxUint256 } from "viem";
import { handleWalletError } from "@/lib/errors";
import { useErc20Allowance } from "./use-erc20-allowance";
import { ENS_ADDRESS } from "@/lib/coins";
import { CookbookAddress } from "@/constants/Cookbook";

export function useEnsApproval() {
  const { t } = useTranslation();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const { allowance: ensAllowance, refetchAllowance } = useErc20Allowance({
    token: ENS_ADDRESS,
    spender: CookbookAddress,
  });

  const approveEnsIfNeeded = useCallback(
    async (amount: bigint) => {
      if (!ensAllowance || ensAllowance < amount) {
        try {
          const approveHash = await writeContractAsync({
            address: ENS_ADDRESS,
            abi: erc20Abi,
            functionName: "approve",
            args: [CookbookAddress, maxUint256],
          });

          if (publicClient) {
            await publicClient.waitForTransactionReceipt({ hash: approveHash });
            await refetchAllowance();
          }

          return { success: true, hash: approveHash };
        } catch (err) {
          const errorMsg = handleWalletError(err, {
            defaultMessage: t("errors.transaction_error"),
          });
          return { success: false, error: errorMsg };
        }
      }
      return { success: true };
    },
    [ensAllowance, writeContractAsync, publicClient, refetchAllowance, t],
  );

  return {
    ensAllowance,
    approveEnsIfNeeded,
  };
}
