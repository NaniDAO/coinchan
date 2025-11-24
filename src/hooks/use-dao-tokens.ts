import { useReadContract, useReadContracts } from "wagmi";
import { ZORG_ADDRESS, ZORG_ABI, ZORG_SHARES_ABI } from "@/constants/ZORG";
import type { Address } from "viem";

/**
 * Hook to fetch the loot contract address from ZORG
 */
export const useDAOLootAddress = () => {
  const { data } = useReadContract({
    address: ZORG_ADDRESS,
    abi: ZORG_ABI,
    functionName: "loot",
    query: {
      staleTime: 3600_000, // 1 hour (doesn't change)
    },
  });

  return data as Address | undefined;
};

/**
 * Hook to fetch the badges contract address from ZORG
 */
export const useDAOBadgesAddress = () => {
  const { data } = useReadContract({
    address: ZORG_ADDRESS,
    abi: ZORG_ABI,
    functionName: "badges",
    query: {
      staleTime: 3600_000, // 1 hour (doesn't change)
    },
  });

  return data as Address | undefined;
};

/**
 * Hook to fetch user's loot balance
 */
export const useDAOLootBalance = ({ address }: { address?: Address }) => {
  const lootAddress = useDAOLootAddress();

  const { data, isLoading } = useReadContract({
    address: lootAddress,
    abi: ZORG_SHARES_ABI, // Loot uses same ABI as shares
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!lootAddress && !!address,
      staleTime: 10_000, // 10 seconds
    },
  });

  return {
    balance: data || 0n,
    isLoading,
  };
};

/**
 * Hook to fetch user's complete token balances (shares + loot)
 */
export const useDAOUserBalances = ({ address }: { address?: Address }) => {
  const lootAddress = useDAOLootAddress();

  const { data, isLoading } = useReadContracts({
    contracts: [
      {
        address: ZORG_ADDRESS,
        abi: ZORG_ABI,
        functionName: "shares",
      },
      {
        address: lootAddress,
        abi: ZORG_SHARES_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
      },
    ],
    query: {
      enabled: !!lootAddress && !!address,
      staleTime: 10_000,
    },
  });

  const sharesAddress = data?.[0]?.result as Address | undefined;

  // Get shares balance separately
  const { data: sharesBalance } = useReadContract({
    address: sharesAddress,
    abi: ZORG_SHARES_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!sharesAddress && !!address,
      staleTime: 10_000,
    },
  });

  return {
    shares: sharesBalance || 0n,
    loot: (data?.[1]?.result as bigint) || 0n,
    isLoading,
  };
};

/**
 * Hook to check if transfers are locked for shares/loot
 */
export const useDAOTransfersLocked = () => {
  const { data: sharesAddress } = useReadContract({
    address: ZORG_ADDRESS,
    abi: ZORG_ABI,
    functionName: "shares",
  });

  const { data: lootAddress } = useReadContract({
    address: ZORG_ADDRESS,
    abi: ZORG_ABI,
    functionName: "loot",
  });

  const { data, isLoading } = useReadContracts({
    contracts: [
      {
        address: sharesAddress,
        abi: ZORG_SHARES_ABI,
        functionName: "transfersLocked",
      },
      {
        address: lootAddress,
        abi: ZORG_SHARES_ABI,
        functionName: "transfersLocked",
      },
    ],
    query: {
      enabled: !!sharesAddress && !!lootAddress,
      staleTime: 60_000,
    },
  });

  return {
    sharesLocked: data?.[0]?.result as boolean | undefined,
    lootLocked: data?.[1]?.result as boolean | undefined,
    isLoading,
  };
};
