import { useAllCoins } from "@/hooks/metadata/use-all-coins";
import { useActiveIncentiveStreams } from "@/hooks/use-incentive-streams";
import { useUserIncentivePositions } from "@/hooks/use-incentive-streams";
import { useAccount } from "wagmi";
import { useMemo } from "react";
import type { TokenMeta } from "@/lib/coins";
import type { IncentiveStream } from "@/hooks/use-incentive-streams";

export interface StakeableToken {
  lpToken: TokenMeta;
  stream: IncentiveStream;
  balance: bigint;
  isStaked: boolean;
  stakedAmount: bigint;
  unstakeableAmount: bigint; // Amount that can be staked
}

/**
 * Hook to detect LP tokens in the user's wallet that could be staked in active farms
 * Also tracks which ones are already staked and provides staking suggestions
 */
export function useStakeableLpTokens() {
  const { address } = useAccount();
  const { tokens } = useAllCoins();
  const { data: activeStreams } = useActiveIncentiveStreams();
  const { data: userPositions } = useUserIncentivePositions();

  // Get all LP tokens that have active farms
  const farmableLpTokens = useMemo(() => {
    if (!activeStreams || !tokens) return [];
    
    const currentTime = BigInt(Math.floor(Date.now() / 1000));
    const activeFarms = activeStreams.filter(stream => stream.endTime > currentTime);
    
    return activeFarms.map(stream => {
      const lpToken = tokens.find(t => t.poolId === stream.lpId);
      return lpToken ? { lpToken, stream } : null;
    }).filter(Boolean) as { lpToken: TokenMeta; stream: IncentiveStream }[];
  }, [activeStreams, tokens]);

  // Calculate stakeable tokens and summary
  const stakeableTokens = useMemo(() => {
    if (!address || !farmableLpTokens.length || !userPositions) return [];

    const results: StakeableToken[] = [];

    for (const { lpToken, stream } of farmableLpTokens) {
      // Find existing staked position
      const existingPosition = userPositions.find(p => p.chefId === stream.chefId);
      const stakedAmount = existingPosition?.shares || 0n;
      const isStaked = stakedAmount > 0n;
      
      // For now, we'll assume some balance exists if the token is found
      // In a real implementation, this would use the LP balance check
      const balance = stakedAmount > 0n ? stakedAmount : 0n; // Simplified
      
      // Calculate unstakeable amount (total balance - already staked)
      const unstakeableAmount = balance > stakedAmount ? balance - stakedAmount : 0n;
      
      results.push({
        lpToken,
        stream,
        balance,
        isStaked,
        stakedAmount,
        unstakeableAmount,
      });
    }

    return results;
  }, [address, farmableLpTokens, userPositions]);

  const summary = useMemo(() => {
    if (!stakeableTokens) return {
      totalStakeableTokens: 0,
      totalUnstakeableAmount: 0n,
      tokensWithBalance: 0,
      fullyStakedTokens: 0,
      partiallyStakedTokens: 0,
      unstakedTokens: 0,
    };

    return {
      totalStakeableTokens: stakeableTokens.length,
      totalUnstakeableAmount: stakeableTokens.reduce((sum, t) => sum + t.unstakeableAmount, 0n),
      tokensWithBalance: stakeableTokens.filter(t => t.balance > 0n).length,
      fullyStakedTokens: stakeableTokens.filter(t => t.isStaked && t.unstakeableAmount === 0n).length,
      partiallyStakedTokens: stakeableTokens.filter(t => t.isStaked && t.unstakeableAmount > 0n).length,
      unstakedTokens: stakeableTokens.filter(t => !t.isStaked && t.balance > 0n).length,
    };
  }, [stakeableTokens]);

  const isLoading = !address || !farmableLpTokens || !userPositions;

  return {
    stakeableTokens: stakeableTokens || [],
    summary,
    isLoading,
    hasStakeableTokens: (stakeableTokens?.length || 0) > 0,
    hasUnstakedTokens: summary.unstakedTokens > 0,
    hasPartiallyStakedTokens: summary.partiallyStakedTokens > 0,
  };
}