import { useReadContracts } from "wagmi";
import { ZORG_ADDRESS, ZORG_ABI } from "@/constants/ZORG";

/**
 * Hook to fetch all governance parameters
 */
export const useDAOGovernance = () => {
  const { data, isLoading } = useReadContracts({
    contracts: [
      {
        address: ZORG_ADDRESS,
        abi: ZORG_ABI,
        functionName: "proposalTTL",
      },
      {
        address: ZORG_ADDRESS,
        abi: ZORG_ABI,
        functionName: "timelockDelay",
      },
      {
        address: ZORG_ADDRESS,
        abi: ZORG_ABI,
        functionName: "ragequittable",
      },
      {
        address: ZORG_ADDRESS,
        abi: ZORG_ABI,
        functionName: "auto FutarchyParam",
      },
      {
        address: ZORG_ADDRESS,
        abi: ZORG_ABI,
        functionName: "autoFutarchyCap",
      },
      {
        address: ZORG_ADDRESS,
        abi: ZORG_ABI,
        functionName: "config",
      },
    ],
    query: {
      staleTime: 60_000, // 1 minute
    },
  });

  return {
    proposalTTL: data?.[0]?.result as bigint | undefined,
    timelockDelay: data?.[1]?.result as bigint | undefined,
    ragequittable: data?.[2]?.result as boolean | undefined,
    autoFutarchyParam: data?.[3]?.result as bigint | undefined,
    autoFutarchyCap: data?.[4]?.result as bigint | undefined,
    config: data?.[5]?.result as bigint | undefined,
    isLoading,
  };
};

/**
 * Hook to fetch proposal TTL (time to live)
 */
export const useDAOProposalTTL = () => {
  const { proposalTTL, isLoading } = useDAOGovernance();
  return { proposalTTL, isLoading };
};

/**
 * Hook to fetch timelock delay
 */
export const useDAOTimelockDelay = () => {
  const { timelockDelay, isLoading } = useDAOGovernance();
  return { timelockDelay, isLoading };
};

/**
 * Hook to check if DAO is ragequittable
 */
export const useDAORagequittable = () => {
  const { ragequittable, isLoading } = useDAOGovernance();
  return { ragequittable, isLoading };
};
