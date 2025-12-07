import { useAccount } from "wagmi";
import { useDAOUserBalances } from "@/hooks/use-dao-tokens";
import { useDAOUserPower } from "@/hooks/use-dao-voting-power";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { formatUnits } from "viem";

export const MembershipView = () => {
  const { address } = useAccount();
  const { shares, loot, isLoading: balancesLoading } = useDAOUserBalances({ address });
  const { votingPower, delegate, isDelegating, isLoading: powerLoading } = useDAOUserPower({ address });

  if (!address) {
    return (
      <div className="border border-border rounded-lg p-8 bg-card text-center">
        <p className="text-muted-foreground">Connect your wallet to view membership details</p>
      </div>
    );
  }

  if (balancesLoading || powerLoading) {
    return (
      <div className="flex justify-center p-8">
        <LoadingLogo size="lg" />
      </div>
    );
  }

  const isMember = shares > 0n || loot > 0n;

  if (!isMember) {
    return (
      <div className="border border-border rounded-lg p-8 bg-card text-center space-y-4">
        <p className="text-muted-foreground">You are not a member of this DAO</p>
        <p className="text-xs text-muted-foreground">Join the DAO to participate in governance and receive shares</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold border-b border-border pb-3">Your Membership</h3>

      {/* Balances Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Shares */}
        <div className="p-6 border border-border rounded-lg bg-card">
          <div className="text-xs text-muted-foreground mb-2">Voting Shares</div>
          <div className="text-3xl font-bold font-mono">{formatUnits(shares, 18)}</div>
          <div className="text-xs text-muted-foreground mt-2">Tokens with voting rights</div>
        </div>

        {/* Loot */}
        <div className="p-6 border border-border rounded-lg bg-card">
          <div className="text-xs text-muted-foreground mb-2">Loot</div>
          <div className="text-3xl font-bold font-mono">{formatUnits(loot, 18)}</div>
          <div className="text-xs text-muted-foreground mt-2">Economic shares (no voting)</div>
        </div>

        {/* Voting Power */}
        <div className="p-6 border border-border rounded-lg bg-card">
          <div className="text-xs text-muted-foreground mb-2">Voting Power</div>
          <div className="text-3xl font-bold font-mono">{formatUnits(votingPower, 18)}</div>
          <div className="text-xs text-muted-foreground mt-2">Including delegations</div>
        </div>
      </div>

      {/* Delegation Info */}
      {isDelegating && delegate && (
        <div className="p-4 border border-yellow-500/30 rounded-lg bg-yellow-500/5">
          <div className="text-sm font-semibold mb-2 text-yellow-400">Delegation Active</div>
          <div className="text-xs text-muted-foreground">You have delegated your voting power to:</div>
          <div className="font-mono text-sm mt-2 break-all text-yellow-300">{delegate}</div>
        </div>
      )}

      {/* Member Badge Section */}
      <div className="border border-border rounded-lg p-6 bg-card">
        <div className="text-sm font-semibold mb-3">Member Badge</div>
        <div className="text-xs text-muted-foreground">Your unique DAO membership NFT badge will be displayed here</div>
        {/* TODO: Add badge rendering when badges hook is implemented */}
      </div>

      {/* Info */}
      <div className="text-xs text-muted-foreground italic border-t border-border pt-4">
        Shares grant voting rights, while Loot represents economic ownership without voting power. You can delegate your
        voting power to another address while retaining your shares.
      </div>
    </div>
  );
};
