import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { mainnet } from "wagmi/chains";
import { CookbookAddress } from "../constants/Cookbook";
import { CookbookAbi } from "../constants/Cookbook";

export interface CookbookCoinBalance {
  coinId: bigint;
  balance: bigint;
  symbol?: string;
  name?: string;
  isEligibleForP2P: boolean; // Has sufficient balance for trading
}

export interface CookbookP2PBalances {
  balances: CookbookCoinBalance[];
  totalCoinsWithBalance: number;
  isLoading: boolean;
  refetch: () => void;
}

/**
 * Hook to fetch cookbook coin balances specifically for P2P trading
 * Filters out zero balances and includes metadata for trading eligibility
 */
export function useCookbookP2PBalances(coinIds?: bigint[]): CookbookP2PBalances {
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const { address } = useAccount();

  const { data: balances = [], isLoading, refetch } = useQuery({
    queryKey: ["cookbookP2PBalances", address, coinIds],
    queryFn: async (): Promise<CookbookCoinBalance[]> => {
      if (!publicClient || !address || !coinIds?.length) {
        return [];
      }

      const balancePromises = coinIds.map(async (coinId): Promise<CookbookCoinBalance> => {
        try {
          const balance = await publicClient.readContract({
            address: CookbookAddress,
            abi: CookbookAbi,
            functionName: "balanceOf",
            args: [address, coinId],
          }) as bigint;

          return {
            coinId,
            balance,
            isEligibleForP2P: balance > 0n,
          };
        } catch (error) {
          console.error(`Failed to fetch balance for cookbook coin ${coinId}:`, error);
          return {
            coinId,
            balance: 0n,
            isEligibleForP2P: false,
          };
        }
      });

      const results = await Promise.all(balancePromises);
      
      // Filter out zero balances for P2P trading
      return results.filter(result => result.balance > 0n);
    },
    enabled: !!publicClient && !!address && !!coinIds?.length,
    staleTime: 30_000, // Cache for 30 seconds
    refetchInterval: 60_000, // Auto-refresh every minute
  });

  return {
    balances,
    totalCoinsWithBalance: balances.length,
    isLoading,
    refetch,
  };
}

/**
 * Hook to get P2P eligible balance for a specific cookbook coin
 */
export function useCookbookCoinP2PBalance(coinId: bigint) {
  const { balances, isLoading, refetch } = useCookbookP2PBalances([coinId]);
  
  const coinBalance = balances.find(b => b.coinId === coinId);
  
  return {
    balance: coinBalance?.balance || 0n,
    isEligibleForP2P: coinBalance?.isEligibleForP2P || false,
    isLoading,
    refetch,
  };
}