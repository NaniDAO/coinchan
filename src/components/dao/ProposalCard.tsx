import { useTranslation } from "react-i18next";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ZORG_ADDRESS, ZORG_ABI } from "@/constants/ZORG";
import { useDAOProposalState, useDAOProposalTallies, useDAOProposalCreatedAt, useDAOProposalProposer, useDAOHasVoted } from "@/hooks/use-dao-proposals";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const formatTimeAgo = (timestamp: number): string => {
  const seconds = Math.floor((Date.now() - timestamp * 1000) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
};

interface ProposalCardProps {
  proposalId: bigint;
}

const PROPOSAL_STATES = ["Unopened", "Active", "Queued", "Succeeded", "Defeated", "Expired", "Executed"];

export const ProposalCard = ({ proposalId }: ProposalCardProps) => {
  const { t } = useTranslation();
  const { address } = useAccount();
  const { state } = useDAOProposalState({ proposalId });
  const { tallies } = useDAOProposalTallies({ proposalId });
  const createdAt = useDAOProposalCreatedAt({ proposalId });
  const proposer = useDAOProposalProposer({ proposalId });
  const hasVoted = useDAOHasVoted({ proposalId, address });

  const { writeContract, data: hash } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

  const handleVote = (support: number) => {
    writeContract({
      address: ZORG_ADDRESS,
      abi: ZORG_ABI,
      functionName: "castVote",
      args: [proposalId, support],
    }, {
      onSuccess: () => {
        toast.success(t("dao.vote_cast"));
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  };

  const handleQueue = () => {
    writeContract({
      address: ZORG_ADDRESS,
      abi: ZORG_ABI,
      functionName: "queue",
      args: [proposalId],
    }, {
      onSuccess: () => {
        toast.success(t("dao.proposal_queued"));
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  };

  const stateName = state !== undefined ? PROPOSAL_STATES[state] : "Unknown";
  const totalVotes = tallies ? tallies.forVotes + tallies.againstVotes + tallies.abstainVotes : 0n;
  const forPercentage = totalVotes > 0n ? Number((tallies!.forVotes * 10000n) / totalVotes) / 100 : 0;
  const againstPercentage = totalVotes > 0n ? Number((tallies!.againstVotes * 10000n) / totalVotes) / 100 : 0;

  const isActive = state === 1; // Active state
  const canQueue = state === 3; // Succeeded state
  const userHasVoted = hasVoted > 0;
  const voteTypeLabels = ["", t("dao.voted_for"), t("dao.voted_against"), t("dao.voted_abstain")];

  return (
    <div className="p-4 border border-border rounded-lg hover:border-accent transition-colors bg-card">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-sm font-mono truncate">
              {t("dao.proposal")} #{proposalId.toString().slice(0, 10)}...
            </h3>
            <span className={`text-xs px-2 py-1 rounded font-medium flex-shrink-0 ${
              state === 1 ? "bg-green-500/20 text-green-400" :
              state === 3 ? "bg-blue-500/20 text-blue-400" :
              state === 6 ? "bg-gray-500/20 text-gray-400" :
              state === 4 || state === 5 ? "bg-red-500/20 text-red-400" :
              "bg-muted text-muted-foreground"
            }`}>
              {stateName}
            </span>
          </div>

          {proposer && (
            <p className="text-xs text-muted-foreground font-mono">
              {t("dao.proposer")}: {proposer.slice(0, 6)}...{proposer.slice(-4)}
            </p>
          )}

          {createdAt !== undefined && createdAt > 0n && (
            <p className="text-xs text-muted-foreground">
              {formatTimeAgo(Number(createdAt))}
            </p>
          )}
        </div>
      </div>

      {/* Vote Tally */}
      {tallies && (
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-xs">
            <span className="text-green-400">{t("dao.for")}: {tallies.forVotes.toString()}</span>
            <span className="text-red-400">{t("dao.against")}: {tallies.againstVotes.toString()}</span>
          </div>

          <div className="h-2 bg-muted rounded-full overflow-hidden flex">
            <div
              className="bg-green-500"
              style={{ width: `${forPercentage}%` }}
            />
            <div
              className="bg-red-500"
              style={{ width: `${againstPercentage}%` }}
            />
          </div>

          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{forPercentage.toFixed(1)}%</span>
            <span>{t("dao.total_votes")}: {totalVotes.toString()}</span>
            <span>{againstPercentage.toFixed(1)}%</span>
          </div>
        </div>
      )}

      {/* User Vote Status */}
      {userHasVoted && (
        <div className="mb-3 p-2 bg-muted rounded text-xs text-center">
          {voteTypeLabels[hasVoted]}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        {isActive && !userHasVoted && address && (
          <>
            <Button
              size="sm"
              variant="default"
              onClick={() => handleVote(1)}
              disabled={isConfirming}
              className="flex-1"
            >
              {t("dao.vote_for")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleVote(0)}
              disabled={isConfirming}
              className="flex-1"
            >
              {t("dao.vote_against")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleVote(2)}
              disabled={isConfirming}
              className="flex-1"
            >
              {t("dao.abstain")}
            </Button>
          </>
        )}

        {canQueue && address && (
          <Button
            size="sm"
            onClick={handleQueue}
            disabled={isConfirming}
            className="w-full"
          >
            {t("dao.queue_proposal")}
          </Button>
        )}
      </div>
    </div>
  );
};
