import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { ZAMMAbi, ZAMMAddress } from "@/constants/ZAAM";
import { ZChefAbi, ZChefAddress } from "@/constants/zChef";
import { CoinSource } from "@/lib/coins";
import { handleWalletError } from "@/lib/errors";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Address, formatUnits } from "viem";
import { mainnet } from "viem/chains";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";

// Retry configuration for contract operations
const RETRY_CONFIG = {
  retries: 3,
  retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 10000),
};

// Helper function to execute contract transaction with retry logic and gas estimation
async function executeWithRetry<T>(fn: () => Promise<T>, retries = RETRY_CONFIG.retries): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    console.error(`Transaction attempt failed:`, error);

    // Don't retry user rejections or certain specific errors
    if (
      error?.message?.includes("User rejected") ||
      error?.message?.includes("user rejected") ||
      error?.code === 4001 || // User rejected transaction
      error?.code === -32603 // Internal error (often means revert)
    ) {
      throw error;
    }

    // Handle out of gas errors by suggesting gas increase
    if (
      error?.message?.includes("out of gas") ||
      error?.message?.includes("gas required exceeds allowance") ||
      error?.code === -32000
    ) {
      throw new Error("Transaction failed due to insufficient gas. Please try again with higher gas limit.");
    }

    if (retries > 0) {
      const delay = RETRY_CONFIG.retryDelay(RETRY_CONFIG.retries - retries);

      await new Promise((resolve) => setTimeout(resolve, delay));
      return executeWithRetry(fn, retries - 1);
    }

    throw error;
  }
}

// Helper function to estimate gas with buffer
async function estimateGasWithBuffer(publicClient: any, contractCall: any): Promise<bigint> {
  try {
    const gasEstimate = await publicClient.estimateContractGas(contractCall);
    // Add 20% buffer to gas estimate
    return (gasEstimate * 120n) / 100n;
  } catch (error) {
    console.warn("Gas estimation failed, using default gas limit:", error);
    // Return a reasonable default gas limit if estimation fails
    return 500000n; // 500k gas
  }
}

export interface ZChefPool {
  lpToken: `0x${string}`;
  lpId: bigint;
  rewardToken: `0x${string}`;
  rewardId: bigint;
  rewardRate: bigint;
  endTime: bigint;
  lastUpdate: bigint;
  totalShares: bigint;
  accRewardPerShare: bigint;
}

export function useZChefPool(chefId: bigint | undefined) {
  return useReadContract({
    address: ZChefAddress,
    abi: ZChefAbi,
    functionName: "pools",
    args: chefId ? [chefId] : undefined,
    query: {
      enabled: !!chefId,
      staleTime: 30000,
    },
  });
}

export function useZChefPendingReward(chefId: bigint | undefined, userAddress?: `0x${string}`) {
  const { address } = useAccount();
  const targetAddress = userAddress || address;

  return useReadContract({
    address: ZChefAddress,
    abi: ZChefAbi,
    functionName: "pendingReward",
    args: chefId && targetAddress ? [chefId, targetAddress] : undefined,
    query: {
      enabled: !!chefId && !!targetAddress,
      staleTime: 30000, // Increase to 30s to reduce flicker
      gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    },
  });
}

export function useZChefUserBalance(chefId: bigint | undefined, userAddress?: `0x${string}`) {
  const { address } = useAccount();
  const targetAddress = userAddress || address;

  return useReadContract({
    address: ZChefAddress,
    abi: ZChefAbi,
    functionName: "balanceOf",
    args: chefId && targetAddress ? [targetAddress, chefId] : undefined,
    query: {
      enabled: !!chefId && !!targetAddress,
      staleTime: 30000, // Increase to 30s to reduce flicker
      gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    },
  });
}

export function useZChefRewardPerYear(chefId: bigint | undefined, userAddress?: `0x${string}`) {
  const { address } = useAccount();
  const targetAddress = userAddress || address;

  return useReadContract({
    address: ZChefAddress,
    abi: ZChefAbi,
    functionName: "rewardPerYear",
    args: chefId && targetAddress ? [chefId, targetAddress] : undefined,
    query: {
      enabled: !!chefId && !!targetAddress,
      staleTime: 60000,
    },
  });
}

export function useZChefRewardPerSharePerYear(chefId: bigint | undefined) {
  return useReadContract({
    address: ZChefAddress,
    abi: ZChefAbi,
    functionName: "rewardPerSharePerYear",
    args: chefId ? [chefId] : undefined,
    query: {
      enabled: !!chefId,
      staleTime: 60000,
    },
  });
}

export function useZChefActions() {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();

  const deposit = useMutation({
    mutationFn: async ({
      chefId,
      amount,
    }: {
      chefId: bigint;
      amount: bigint;
    }) => {
      return executeWithRetry(async () => {
        const contractCall = {
          address: ZChefAddress,
          abi: ZChefAbi,
          functionName: "deposit" as const,
          args: [chefId, amount] as const,
          chainId: mainnet.id,
        };

        // Estimate gas with buffer
        let gas: bigint | undefined;
        if (publicClient) {
          gas = await estimateGasWithBuffer(publicClient, contractCall);
        }

        const hash = await writeContractAsync({
          address: ZChefAddress,
          abi: ZChefAbi,
          functionName: "deposit",
          args: [chefId, amount],
          chainId: mainnet.id,
          gas,
        });

        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash });
        }
        return hash;
      });
    },
    onSuccess: (_, { chefId }) => {
      // More targeted cache invalidation for deposits
      queryClient.invalidateQueries({ queryKey: ["userIncentivePositions"] });
      queryClient.invalidateQueries({
        queryKey: ["userIncentivePosition", chefId.toString()],
      });
      queryClient.invalidateQueries({
        queryKey: ["incentiveStream", chefId.toString()],
      });
      queryClient.invalidateQueries({ queryKey: ["activeIncentiveStreams"] });
    },
    onError: (error) => {
      // Use handleWalletError for graceful error handling
      const errorMessage = handleWalletError(error);
      // Only log if it's not a user rejection
      if (errorMessage) {
        console.error("Deposit failed:", error);
      }
    },
  });

  const withdraw = useMutation({
    mutationFn: async ({
      chefId,
      shares,
    }: {
      chefId: bigint;
      shares: bigint;
    }) => {
      return executeWithRetry(async () => {
        const contractCall = {
          address: ZChefAddress,
          abi: ZChefAbi,
          functionName: "withdraw" as const,
          args: [chefId, shares] as const,
          chainId: mainnet.id,
        };

        // Estimate gas with buffer
        let gas: bigint | undefined;
        if (publicClient) {
          gas = await estimateGasWithBuffer(publicClient, contractCall);
        }

        const hash = await writeContractAsync({
          address: ZChefAddress,
          abi: ZChefAbi,
          functionName: "withdraw",
          args: [chefId, shares],
          chainId: mainnet.id,
          gas,
        });

        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash });
        }
        return hash;
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userIncentivePositions"] });
      queryClient.invalidateQueries({ queryKey: ["userIncentivePosition"] });
      queryClient.invalidateQueries({ queryKey: ["incentiveStream"] });
    },
    onError: (error) => {
      // Use handleWalletError for graceful error handling
      const errorMessage = handleWalletError(error);
      // Only log if it's not a user rejection
      if (errorMessage) {
        console.error("Withdraw failed:", error);
      }
    },
  });

  const harvest = useMutation({
    mutationFn: async ({ chefId }: { chefId: bigint }) => {
      return executeWithRetry(async () => {
        const contractCall = {
          address: ZChefAddress,
          abi: ZChefAbi,
          functionName: "harvest" as const,
          args: [chefId] as const,
          chainId: mainnet.id,
        };

        // Estimate gas with buffer
        let gas: bigint | undefined;
        if (publicClient) {
          gas = await estimateGasWithBuffer(publicClient, contractCall);
        }

        const hash = await writeContractAsync({
          address: ZChefAddress,
          abi: ZChefAbi,
          functionName: "harvest",
          args: [chefId],
          chainId: mainnet.id,
          gas,
        });

        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash });
        }
        return hash;
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userIncentivePositions"] });
      queryClient.invalidateQueries({ queryKey: ["userIncentivePosition"] });
    },
    onError: (error) => {
      // Use handleWalletError for graceful error handling
      const errorMessage = handleWalletError(error);
      // Only log if it's not a user rejection
      if (errorMessage) {
        console.error("Harvest failed:", error);
      }
    },
  });

  const emergencyWithdraw = useMutation({
    mutationFn: async ({ chefId }: { chefId: bigint }) => {
      return executeWithRetry(async () => {
        const contractCall = {
          address: ZChefAddress,
          abi: ZChefAbi,
          functionName: "emergencyWithdraw" as const,
          args: [chefId] as const,
          chainId: mainnet.id,
        };

        // Estimate gas with buffer
        let gas: bigint | undefined;
        if (publicClient) {
          gas = await estimateGasWithBuffer(publicClient, contractCall);
        }

        const hash = await writeContractAsync({
          address: ZChefAddress,
          abi: ZChefAbi,
          functionName: "emergencyWithdraw",
          args: [chefId],
          chainId: mainnet.id,
          gas,
        });

        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash });
        }
        return hash;
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userIncentivePositions"] });
      queryClient.invalidateQueries({ queryKey: ["userIncentivePosition"] });
      queryClient.invalidateQueries({ queryKey: ["incentiveStream"] });
    },
    onError: (error) => {
      // Use handleWalletError for graceful error handling
      const errorMessage = handleWalletError(error);
      // Only log if it's not a user rejection
      if (errorMessage) {
        console.error("Emergency withdraw failed:", error);
      }
    },
  });

  const migrate = useMutation({
    mutationFn: async ({
      fromChefId,
      toChefId,
      shares,
    }: {
      fromChefId: bigint;
      toChefId: bigint;
      shares: bigint;
    }) => {
      return executeWithRetry(async () => {
        const contractCall = {
          address: ZChefAddress,
          abi: ZChefAbi,
          functionName: "migrate" as const,
          args: [fromChefId, toChefId, shares] as const,
          chainId: mainnet.id,
        };

        // Estimate gas with buffer
        let gas: bigint | undefined;
        if (publicClient) {
          gas = await estimateGasWithBuffer(publicClient, contractCall);
        }

        const hash = await writeContractAsync({
          address: ZChefAddress,
          abi: ZChefAbi,
          functionName: "migrate",
          args: [fromChefId, toChefId, shares],
          chainId: mainnet.id,
          gas,
        });

        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash });
        }
        return hash;
      });
    },
    onSuccess: (_, { fromChefId, toChefId }) => {
      // Invalidate caches for both pools
      queryClient.invalidateQueries({ queryKey: ["userIncentivePositions"] });
      queryClient.invalidateQueries({
        queryKey: ["userIncentivePosition", fromChefId.toString()],
      });
      queryClient.invalidateQueries({
        queryKey: ["userIncentivePosition", toChefId.toString()],
      });
      queryClient.invalidateQueries({
        queryKey: ["incentiveStream", fromChefId.toString()],
      });
      queryClient.invalidateQueries({
        queryKey: ["incentiveStream", toChefId.toString()],
      });
      queryClient.invalidateQueries({ queryKey: ["activeIncentiveStreams"] });
    },
    onError: (error) => {
      // Use handleWalletError for graceful error handling
      const errorMessage = handleWalletError(error);
      // Only log if it's not a user rejection
      if (errorMessage) {
        console.error("Migrate failed:", error);
      }
    },
  });

  return {
    deposit,
    withdraw,
    harvest,
    emergencyWithdraw,
    migrate,
  };
}

export function useSetOperatorApproval() {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const { address } = useAccount();

  const setOperatorApproval = useMutation({
    mutationFn: async ({
      source,
      operator,
      approved,
    }: {
      source: CoinSource;
      operator: Address;
      approved: boolean;
    }) => {
      return executeWithRetry(async () => {
        let contractAddress: `0x${string}`;
        let contractAbi: any;

        if (source === "ZAMM") {
          // ZAMM coins
          contractAddress = ZAMMAddress;
          contractAbi = ZAMMAbi;
        } else {
          // Cookbook coins
          contractAddress = CookbookAddress;
          contractAbi = CookbookAbi;
        }

        const hash = await writeContractAsync({
          address: contractAddress,
          abi: contractAbi,
          functionName: "setOperator",
          args: [operator, approved],
          chainId: mainnet.id,
        });

        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash });
        }
        return hash;
      });
    },
    onSuccess: (_, variables) => {
      // Invalidate operator status queries to refetch the updated approval state
      // This ensures the UI accurately reflects the on-chain operator approval status

      // First, directly update the cache for immediate UI response
      queryClient.setQueriesData(
        {
          queryKey: ["readContract"],
          predicate: (query) => {
            // Update all isOperator queries for the current user
            return (
              query.queryKey[0] === "readContract" &&
              typeof query.queryKey[1] === "object" &&
              query.queryKey[1] !== null &&
              "functionName" in query.queryKey[1] &&
              query.queryKey[1].functionName === "isOperator" &&
              "args" in query.queryKey[1] &&
              Array.isArray(query.queryKey[1].args) &&
              query.queryKey[1].args[0] === address &&
              query.queryKey[1].args[1] === variables.operator
            );
          },
        },
        variables.approved
      );

      // Then invalidate to trigger background refetch for confirmation
      queryClient.invalidateQueries({
        queryKey: ["readContract"],
        predicate: (query) => {
          return (
            query.queryKey[0] === "readContract" &&
            typeof query.queryKey[1] === "object" &&
            query.queryKey[1] !== null &&
            "functionName" in query.queryKey[1] &&
            query.queryKey[1].functionName === "isOperator" &&
            "args" in query.queryKey[1] &&
            Array.isArray(query.queryKey[1].args) &&
            query.queryKey[1].args[0] === address
          );
        },
      });
    },
    onError: (error) => {
      // Use handleWalletError for graceful error handling
      const errorMessage = handleWalletError(error);
      // Only log if it's not a user rejection
      if (errorMessage) {
        console.error("Set operator approval failed:", error);
      }
    },
  });

  return setOperatorApproval;
}

export function useZChefUtilities() {
  const calculateTimeRemaining = (endTime: bigint) => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const remaining = BigInt(endTime) - now;

    if (remaining <= 0n) return { days: 0, hours: 0, minutes: 0, seconds: 0 };

    const days = Number(remaining / 86400n);
    const hours = Number((remaining % 86400n) / 3600n);
    const minutes = Number((remaining % 3600n) / 60n);
    const seconds = Number(remaining % 60n);

    return { days, hours, minutes, seconds };
  };

  const formatRewardRate = (rewardRate: bigint) => {
    rewardRate = BigInt(rewardRate);
    // Note: rewardRate has scaling of (18 + 12 = 30 decimals)
    const perSecond = formatUnits(rewardRate, 30);
    const perDay = formatUnits(rewardRate * 86400n, 30);
    const perYear = formatUnits(rewardRate * 86400n * 365n, 30);

    return { perSecond, perDay, perYear };
  };

  return {
    calculateTimeRemaining,
    formatRewardRate,
  };
}
