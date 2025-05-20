import { useCallback, useState } from "react";
import { Address, erc20Abi, maxUint256 } from "viem";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWatchBlockNumber,
  useWaitForTransactionReceipt,
} from "wagmi";

interface UseErc20AllowanceArgs {
  /** ERC-20 token address */
  token: Address;
  /** who will be allowed to spend */
  spender: Address;
}

/**
 * Tracks and (optionally) approves an ERC-20 allowance.
 */
export function useErc20Allowance({ token, spender }: UseErc20AllowanceArgs) {
  // get connected wallet
  const { address: owner } = useAccount();
  const [blockNumber, setBlockNumber] = useState<bigint>();
  useWatchBlockNumber({
    onBlockNumber(blockNumber) {
      setBlockNumber(blockNumber);
    },
  });

  // 1️⃣ Read current allowance(owner→spender), auto-refetch on new block
  const {
    data: allowance,
    isLoading: isAllowanceLoading,
    refetch: refetchAllowance,
  } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: owner ? [owner, spender] : undefined,
    blockNumber,
  });

  // 3️⃣ Send approval when requested
  const { writeContractAsync, data: approveTxHash, isPending: isApproveTxSending } = useWriteContract();

  // 4️⃣ Track mining status
  const { isLoading: isApproveTxMining, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  });

  // wrapped callback so consumers just call `approve()` without args
  const approveMax = useCallback(async () => {
    if (!writeContractAsync) throw new Error("approve() not ready");
    return await writeContractAsync({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, maxUint256],
    });
  }, [writeContractAsync]);

  return {
    /** current allowance (bigint) or undefined while loading */
    allowance,
    /** true while the read call is in flight */
    isAllowanceLoading,
    /** force a fresh `allowance` read immediately */
    refetchAllowance,

    /** call this to prompt the wallet for infinite approval */
    approveMax,
    /** true while the tx is being sent or is pending on‐chain */
    isApproving: isApproveTxSending || isApproveTxMining,
    /** true once the approval has successfully mined */
    isApproveSuccess,
  };
}
