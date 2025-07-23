import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { usePublicClient, useWriteContract } from "wagmi";
import { erc20Abi, maxUint256, type Address } from "viem";
import { handleWalletError } from "@/lib/errors";
import { useErc20Allowance } from "./use-erc20-allowance";

interface UseTokenApprovalParams {
  token: Address;
  spender: Address;
  amount?: bigint;
}

export function useTokenApproval({ token, spender, amount }: UseTokenApprovalParams) {
  const { t } = useTranslation();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [isApproving, setIsApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  const { allowance, refetchAllowance } = useErc20Allowance({
    token,
    spender,
  });

  const needsApproval = useCallback(() => {
    if (!amount || !allowance) return false;
    return allowance < amount;
  }, [allowance, amount]);

  const approve = useCallback(async () => {
    if (!publicClient) {
      setApprovalError("No client available");
      return false;
    }

    setIsApproving(true);
    setApprovalError(null);

    try {
      const hash = await writeContractAsync({
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, maxUint256],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        await refetchAllowance();
        setIsApproving(false);
        return true;
      } else {
        setApprovalError("Approval transaction failed");
        setIsApproving(false);
        return false;
      }
    } catch (err) {
      const errorMsg = handleWalletError(err, {
        defaultMessage: t("errors.transaction_error"),
      });
      if (errorMsg) {
        setApprovalError(errorMsg);
      }
      setIsApproving(false);
      return false;
    }
  }, [publicClient, token, spender, writeContractAsync, refetchAllowance, t]);

  return {
    allowance,
    needsApproval,
    approve,
    isApproving,
    approvalError,
  };
}
