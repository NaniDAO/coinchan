import { useReadContract } from "wagmi";
import { ZORG_ADDRESS, ZORG_ABI } from "@/constants/ZORG";
import type { Address } from "viem";

/**
 * Hook to fetch the shares contract address from ZORG
 */
export const useDAOSharesAddress = () => {
  const { data } = useReadContract({
    address: ZORG_ADDRESS,
    abi: ZORG_ABI,
    functionName: "shares",
    query: {
      staleTime: 3600_000, // 1 hour (doesn't change)
    },
  });

  return data as Address | undefined;
};

/**
 * Hook to fetch user's voting power (delegated votes)
 */
export const useDAOVotingPower = ({ address }: { address?: Address }) => {
  const sharesAddress = useDAOSharesAddress();

  const { data, isLoading } = useReadContract({
    address: sharesAddress,
    abi: [
      {
        inputs: [{ internalType: "address", name: "account", type: "address" }],
        name: "getVotes",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
    ],
    functionName: "getVotes",
    args: address ? [address] : undefined,
    query: {
      enabled: !!sharesAddress && !!address,
      staleTime: 10_000, // 10 seconds
    },
  });

  return {
    votingPower: data || 0n,
    isLoading,
  };
};

/**
 * Hook to fetch user's share balance
 */
export const useDAOShareBalance = ({ address }: { address?: Address }) => {
  const sharesAddress = useDAOSharesAddress();

  const { data, isLoading } = useReadContract({
    address: sharesAddress,
    abi: [
      {
        inputs: [{ internalType: "address", name: "", type: "address" }],
        name: "balanceOf",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
    ],
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!sharesAddress && !!address,
      staleTime: 10_000, // 10 seconds
    },
  });

  return {
    balance: data || 0n,
    isLoading,
  };
};

/**
 * Hook to fetch user's delegate address
 */
export const useDAODelegate = ({ address }: { address?: Address }) => {
  const sharesAddress = useDAOSharesAddress();

  const { data } = useReadContract({
    address: sharesAddress,
    abi: [
      {
        inputs: [{ internalType: "address", name: "account", type: "address" }],
        name: "delegates",
        outputs: [{ internalType: "address", name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
      },
    ],
    functionName: "delegates",
    args: address ? [address] : undefined,
    query: {
      enabled: !!sharesAddress && !!address,
      staleTime: 10_000, // 10 seconds
    },
  });

  return data as Address | undefined;
};

/**
 * Hook to fetch both user's share balance and voting power
 */
export const useDAOUserPower = ({ address }: { address?: Address }) => {
  const { balance, isLoading: balanceLoading } = useDAOShareBalance({ address });
  const { votingPower, isLoading: votingLoading } = useDAOVotingPower({ address });
  const delegate = useDAODelegate({ address });

  return {
    balance,
    votingPower,
    delegate,
    isDelegating: delegate && address && delegate.toLowerCase() !== address.toLowerCase(),
    isLoading: balanceLoading || votingLoading,
  };
};
