import { useReadContracts } from "wagmi";
import { ZORG_ADDRESS, ZORG_ABI } from "@/constants/ZORG";
import { useDAOSharesAddress } from "./use-dao-voting-power";

/**
 * Hook to fetch DAO statistics
 */
export const useDAOStats = () => {
  const sharesAddress = useDAOSharesAddress();

  const { data, isLoading } = useReadContracts({
    contracts: [
      {
        address: ZORG_ADDRESS,
        abi: ZORG_ABI,
        functionName: "getProposalCount",
      },
      {
        address: sharesAddress,
        abi: [{
          inputs: [],
          name: "totalSupply",
          outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        }],
        functionName: "totalSupply",
      },
      {
        address: ZORG_ADDRESS,
        abi: ZORG_ABI,
        functionName: "quorumBps",
      },
      {
        address: ZORG_ADDRESS,
        abi: ZORG_ABI,
        functionName: "proposalThreshold",
      },
    ],
    query: {
      enabled: !!sharesAddress,
      staleTime: 10_000, // 10 seconds
    },
  });

  if (!data || !data[0]?.result) {
    return {
      proposalCount: 0,
      totalSupply: 0n,
      quorumBps: 0,
      proposalThreshold: 0n,
      isLoading,
    };
  }

  return {
    proposalCount: Number(data[0].result),
    totalSupply: (data[1]?.result as bigint) || 0n,
    quorumBps: data[2]?.result ? Number(data[2].result) : 0,
    proposalThreshold: (data[3]?.result as bigint) || 0n,
    isLoading: false,
  };
};
