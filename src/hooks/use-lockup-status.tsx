import { useEffect, useState } from "react";
import { useReadContract } from "wagmi";
import { keccak256, encodeAbiParameters, Address } from "viem";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { LockupData } from "./use-get-lockups";
import { mainnet } from "viem/chains";

export function useLockupStatus(lockup: LockupData, userAddress?: Address) {
  const [isActuallyUnlocked, setIsActuallyUnlocked] = useState<boolean>(false);

  // Generate lockup hash from lockup data
  const generateLockupHash = (): `0x${string}` => {
    const token = lockup.token || "0x0000000000000000000000000000000000000000";
    const to = lockup.to || userAddress;
    const id =
      lockup.token === "0x0000000000000000000000000000000000000000" ? 0n : lockup.coinId ? BigInt(lockup.coinId) : 0n;
    const amount = lockup.amount ? BigInt(lockup.amount) : 0n;
    const unlockTime = BigInt(lockup.unlockTime || 0);

    return keccak256(
      encodeAbiParameters(
        [
          { name: "token", type: "address" },
          { name: "to", type: "address" },
          { name: "id", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "unlockTime", type: "uint256" },
        ],
        [token as `0x${string}`, to as `0x${string}`, id, amount, unlockTime],
      ),
    );
  };

  const lockupHash = generateLockupHash();

  // Read the lockups mapping from the contract
  const { data: unlockTimeFromContract, isLoading } = useReadContract({
    address: CookbookAddress,
    abi: CookbookAbi,
    functionName: "lockups",
    args: [lockupHash],
    chainId: mainnet.id,
    query: {
      enabled: !!lockup && !!userAddress,
      refetchInterval: 30000, // Refetch every 30 seconds
    },
  });

  useEffect(() => {
    if (unlockTimeFromContract !== undefined) {
      // If unlockTime is 0, it means the lockup has been deleted (unlocked)
      setIsActuallyUnlocked(unlockTimeFromContract === 0n);
    }
  }, [unlockTimeFromContract]);

  return {
    isActuallyUnlocked,
    isLoading,
    lockupHash,
  };
}
