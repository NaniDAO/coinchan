import { useReadContract } from "wagmi";
import { ZORG_ADDRESS, ZORG_ABI } from "@/constants/ZORG";
import type { Address } from "viem";

/**
 * Hook to fetch sale configuration for a specific payment token
 */
export const useDAOSale = ({ payToken }: { payToken?: Address }) => {
  const { data, isLoading } = useReadContract({
    address: ZORG_ADDRESS,
    abi: ZORG_ABI,
    functionName: "sales",
    args: payToken ? [payToken] : undefined,
    query: {
      enabled: !!payToken,
      staleTime: 30_000, // 30 seconds
    },
  });

  if (!data) {
    return {
      pricePerShare: 0n,
      cap: 0n,
      minting: false,
      active: false,
      isLoot: false,
      isLoading,
    };
  }

  return {
    pricePerShare: data[0],
    cap: data[1],
    minting: data[2],
    active: data[3],
    isLoot: data[4],
    isLoading: false,
  };
};

/**
 * Hook to fetch sales for multiple payment tokens
 */
export const useDAOSales = ({ payTokens }: { payTokens: Address[] }) => {
  const salesData = payTokens.map((payToken) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const sale = useDAOSale({ payToken });
    return { payToken, ...sale };
  });

  const isLoading = salesData.some((s) => s.isLoading);
  const activeSales = salesData.filter((s) => s.active);

  return {
    sales: salesData,
    activeSales,
    isLoading,
  };
};
