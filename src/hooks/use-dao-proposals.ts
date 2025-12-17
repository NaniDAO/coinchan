import { useReadContract } from "wagmi";
import { ZORG_ADDRESS, ZORG_ABI } from "@/constants/ZORG";

/**
 * Hook to fetch total DAO proposal count
 */
export const useDAOProposalCount = () => {
  const { data, isLoading } = useReadContract({
    address: ZORG_ADDRESS,
    abi: ZORG_ABI,
    functionName: "getProposalCount",
    query: {
      staleTime: 10_000, // 10 seconds
    },
  });

  return {
    count: data ? Number(data) : 0,
    isLoading,
  };
};

/**
 * Hook to fetch a specific proposal ID from the proposalIds array
 */
export const useDAOProposalId = ({ index }: { index: number }) => {
  const { data } = useReadContract({
    address: ZORG_ADDRESS,
    abi: ZORG_ABI,
    functionName: "proposalIds",
    args: [BigInt(index)],
    query: {
      enabled: index >= 0,
      staleTime: 60_000, // 1 minute
    },
  });

  return data;
};

/**
 * Hook to fetch proposal state
 */
export const useDAOProposalState = ({ proposalId }: { proposalId?: bigint }) => {
  const { data, isLoading } = useReadContract({
    address: ZORG_ADDRESS,
    abi: ZORG_ABI,
    functionName: "state",
    args: proposalId ? [proposalId] : undefined,
    query: {
      enabled: !!proposalId,
      staleTime: 10_000, // 10 seconds
    },
  });

  return {
    state: data,
    isLoading,
  };
};

/**
 * Hook to fetch proposal tallies (votes)
 */
export const useDAOProposalTallies = ({ proposalId }: { proposalId?: bigint }) => {
  const { data, isLoading } = useReadContract({
    address: ZORG_ADDRESS,
    abi: ZORG_ABI,
    functionName: "tallies",
    args: proposalId ? [proposalId] : undefined,
    query: {
      enabled: !!proposalId,
      staleTime: 10_000, // 10 seconds
    },
  });

  return {
    tallies: data
      ? {
          forVotes: data[0],
          againstVotes: data[1],
          abstainVotes: data[2],
        }
      : undefined,
    isLoading,
  };
};

/**
 * Hook to fetch when proposal was created
 */
export const useDAOProposalCreatedAt = ({ proposalId }: { proposalId?: bigint }) => {
  const { data } = useReadContract({
    address: ZORG_ADDRESS,
    abi: ZORG_ABI,
    functionName: "createdAt",
    args: proposalId ? [proposalId] : undefined,
    query: {
      enabled: !!proposalId,
      staleTime: 60_000, // 1 minute (doesn't change)
    },
  });

  return data;
};

/**
 * Hook to fetch who proposed a proposal
 */
export const useDAOProposalProposer = ({ proposalId }: { proposalId?: bigint }) => {
  const { data } = useReadContract({
    address: ZORG_ADDRESS,
    abi: ZORG_ABI,
    functionName: "proposerOf",
    args: proposalId ? [proposalId] : undefined,
    query: {
      enabled: !!proposalId,
      staleTime: 60_000, // 1 minute (doesn't change)
    },
  });

  return data;
};

/**
 * Hook to check if user has voted on a proposal
 */
export const useDAOHasVoted = ({ proposalId, address }: { proposalId?: bigint; address?: `0x${string}` }) => {
  const { data } = useReadContract({
    address: ZORG_ADDRESS,
    abi: ZORG_ABI,
    functionName: "hasVoted",
    args: proposalId && address ? [proposalId, address] : undefined,
    query: {
      enabled: !!proposalId && !!address,
      staleTime: 10_000, // 10 seconds
    },
  });

  return data ? Number(data) : 0; // 0=not voted, 1=for, 2=against, 3=abstain
};
