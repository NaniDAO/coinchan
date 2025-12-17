import { useReadContracts, useBalance } from "wagmi";
import { TREASURY_ASSETS, ERC20_ABI } from "@/constants/ZammDAO";
import { ZORG_ADDRESS } from "@/constants/ZORG";
import type { Address } from "viem";

/**
 * Hook to fetch treasury balances for all standard assets
 */
export const useDAOTreasuryBalances = () => {
  // ETH balance
  const { data: ethBalance } = useBalance({
    address: ZORG_ADDRESS,
  });

  // ERC20 balances
  const { data: tokenBalances, isLoading } = useReadContracts({
    contracts: [
      {
        address: TREASURY_ASSETS.USDC.address as Address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [ZORG_ADDRESS],
      },
      {
        address: TREASURY_ASSETS.USDT.address as Address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [ZORG_ADDRESS],
      },
      {
        address: TREASURY_ASSETS.DAI.address as Address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [ZORG_ADDRESS],
      },
      {
        address: TREASURY_ASSETS.WSTETH.address as Address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [ZORG_ADDRESS],
      },
      {
        address: TREASURY_ASSETS.RETH.address as Address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [ZORG_ADDRESS],
      },
    ],
    query: {
      staleTime: 30_000, // 30 seconds
    },
  });

  return {
    balances: {
      ETH: ethBalance?.value || 0n,
      USDC: (tokenBalances?.[0]?.result as bigint) || 0n,
      USDT: (tokenBalances?.[1]?.result as bigint) || 0n,
      DAI: (tokenBalances?.[2]?.result as bigint) || 0n,
      WSTETH: (tokenBalances?.[3]?.result as bigint) || 0n,
      RETH: (tokenBalances?.[4]?.result as bigint) || 0n,
    },
    isLoading,
  };
};

/**
 * Hook to fetch balance of a specific token in treasury
 */
export const useDAOTreasuryTokenBalance = ({ tokenAddress }: { tokenAddress?: Address }) => {
  // Handle ETH separately
  const { data: ethBalance } = useBalance({
    address: ZORG_ADDRESS,
    query: {
      enabled: tokenAddress === "0x0000000000000000000000000000000000000000" || !tokenAddress,
    },
  });

  // ERC20 balance
  const { data: tokenBalance, isLoading } = useReadContracts({
    contracts: [
      {
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [ZORG_ADDRESS],
      },
    ],
    query: {
      enabled: !!tokenAddress && tokenAddress !== "0x0000000000000000000000000000000000000000",
      staleTime: 30_000,
    },
  });

  if (!tokenAddress || tokenAddress === "0x0000000000000000000000000000000000000000") {
    return {
      balance: ethBalance?.value || 0n,
      isLoading: false,
    };
  }

  return {
    balance: (tokenBalance?.[0]?.result as bigint) || 0n,
    isLoading,
  };
};
