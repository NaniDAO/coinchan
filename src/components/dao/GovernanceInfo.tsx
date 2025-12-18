import { useDAOGovernance } from "@/hooks/use-dao-governance";
import { useDAOStats } from "@/hooks/use-dao-stats";
import { useDAOTransfersLocked } from "@/hooks/use-dao-tokens";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { formatUnits } from "viem";

export const GovernanceInfo = () => {
  const {
    proposalTTL,
    timelockDelay,
    ragequittable,
    autoFutarchyParam,
    autoFutarchyCap,
    isLoading: govLoading,
  } = useDAOGovernance();

  const { quorumBps, proposalThreshold, isLoading: statsLoading } = useDAOStats();
  const { sharesLocked, lootLocked, isLoading: transfersLoading } = useDAOTransfersLocked();

  if (govLoading || statsLoading || transfersLoading) {
    return (
      <div className="flex justify-center p-8">
        <LoadingLogo size="lg" />
      </div>
    );
  }

  const formatDuration = (seconds: bigint) => {
    const secs = Number(seconds);
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
    return `${Math.floor(secs / 86400)}d`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-white/20 pb-3">
        <h3 className="text-xl font-semibold">Governance Parameters</h3>
        <a
          href="https://majeurdao.eth.limo/#/dao/1/0x5E58BA0e06ED0F5558f83bE732a4b899a674053E"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 border border-white/30 hover:border-white/60 bg-white/10 hover:bg-white/20 font-mono text-sm tracking-wider transition-all"
        >
          GOVERN →
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Quorum */}
        <div className="p-4 border border-white/20 rounded-lg bg-white/5">
          <div className="text-xs text-white/60 mb-1">Quorum Requirement</div>
          <div className="text-2xl font-bold font-mono">{quorumBps ? (quorumBps / 100).toFixed(1) : 0}%</div>
          <div className="text-xs text-white/50 mt-2">Minimum votes needed for proposals to pass</div>
        </div>

        {/* Proposal Threshold */}
        <div className="p-4 border border-white/20 rounded-lg bg-white/5">
          <div className="text-xs text-white/60 mb-1">Proposal Threshold</div>
          <div className="text-2xl font-bold font-mono">
            {proposalThreshold ? formatUnits(proposalThreshold, 18) : "0"}
          </div>
          <div className="text-xs text-white/50 mt-2">Voting power needed to create proposals</div>
        </div>

        {/* Proposal TTL */}
        <div className="p-4 border border-white/20 rounded-lg bg-white/5">
          <div className="text-xs text-white/60 mb-1">Proposal Duration (TTL)</div>
          <div className="text-2xl font-bold font-mono">{proposalTTL ? formatDuration(proposalTTL) : "N/A"}</div>
          <div className="text-xs text-white/50 mt-2">How long proposals remain active for voting</div>
        </div>

        {/* Timelock Delay */}
        <div className="p-4 border border-white/20 rounded-lg bg-white/5">
          <div className="text-xs text-white/60 mb-1">Timelock Delay</div>
          <div className="text-2xl font-bold font-mono">{timelockDelay ? formatDuration(timelockDelay) : "N/A"}</div>
          <div className="text-xs text-white/50 mt-2">Delay after proposal succeeds before execution</div>
        </div>

        {/* Ragequittable */}
        <div className="p-4 border border-white/20 rounded-lg bg-white/5">
          <div className="text-xs text-white/60 mb-1">Ragequit Status</div>
          <div className={`text-2xl font-bold font-mono ${ragequittable ? "text-green-400" : "text-red-400"}`}>
            {ragequittable ? "ENABLED" : "DISABLED"}
          </div>
          <div className="text-xs text-white/50 mt-2">
            {ragequittable ? "Members can exit with proportional assets" : "Ragequit is not allowed"}
          </div>
        </div>

        {/* Auto-Futarchy */}
        <div className="p-4 border border-white/20 rounded-lg bg-white/5">
          <div className="text-xs text-white/60 mb-1">Auto-Futarchy</div>
          <div className="text-2xl font-bold font-mono">
            {autoFutarchyParam && autoFutarchyParam > 0n ? "ENABLED" : "DISABLED"}
          </div>
          {autoFutarchyParam && autoFutarchyParam > 0n ? (
            <div className="text-xs text-white/50 mt-2">
              Cap: {autoFutarchyCap ? formatUnits(autoFutarchyCap, 18) : "N/A"}
            </div>
          ) : null}
        </div>

        {/* Transfers Locked */}
        <div className="p-4 border border-white/20 rounded-lg bg-white/5">
          <div className="text-xs text-white/60 mb-1">Token Transfers</div>
          <div className="space-y-1">
            <div className={`text-sm font-mono ${sharesLocked ? "text-red-400" : "text-green-400"}`}>
              Shares: {sharesLocked ? "LOCKED" : "UNLOCKED"}
            </div>
            <div className={`text-sm font-mono ${lootLocked ? "text-red-400" : "text-green-400"}`}>
              Loot: {lootLocked ? "LOCKED" : "UNLOCKED"}
            </div>
          </div>
        </div>
      </div>

      {/* Info Note */}
      <div className="text-xs text-white/50 italic border-t border-white/10 pt-4">
        Governance parameters can be modified through proposals voted on by members.
      </div>
    </div>
  );
};
