import { Button } from "@/components/ui/button";
import { ZORG_ABI, ZORG_ADDRESS } from "@/constants/ZORG";
import { useProposalDescription } from "@/hooks/use-dao-messages";
import {
  useDAOHasVoted,
  useDAOProposalCreatedAt,
  useDAOProposalProposer,
  useDAOProposalState,
  useDAOProposalTallies,
} from "@/hooks/use-dao-proposals";
import { useProposalCalldata } from "@/hooks/use-proposal-calldata";
import { useDAOStats } from "@/hooks/use-dao-stats";
import { AlertTriangle, CheckCircle, ExternalLink, FileCode, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatEther } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

// Vote support values for castVote function
const VOTE_FOR = 1;
const VOTE_AGAINST = 0;
const VOTE_ABSTAIN = 2;

// Format vote amount from 18 decimals to human readable
const formatVoteAmount = (amount: bigint): string => {
  const value = Number(formatEther(amount));
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}K`;
  }
  if (value >= 1) {
    return value.toFixed(2);
  }
  if (value > 0) {
    return value.toFixed(4);
  }
  return "0";
};

// Build Swiss Knife calldata decoder URL
const buildSwissKnifeUrl = (calldata?: string, targetAddress?: string): string => {
  const baseUrl = "https://calldata.swiss-knife.xyz/decoder";
  const params = new URLSearchParams({
    chainId: "1",
    address: targetAddress || ZORG_ADDRESS,
  });
  if (calldata) {
    params.set("calldata", calldata);
  }
  return `${baseUrl}?${params.toString()}`;
};

// Truncate address for display
const truncateAddress = (address: string): string => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

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
  const { description, image } = useProposalDescription({ proposalId });
  const { proposalData, isVerified, hasMessages } = useProposalCalldata({ proposalId });

  const { writeContract, data: hash } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

  const handleVote = (support: number) => {
    writeContract(
      {
        address: ZORG_ADDRESS,
        abi: ZORG_ABI,
        functionName: "castVote",
        args: [proposalId, support],
      },
      {
        onSuccess: () => {
          toast.success(t("dao.vote_cast"));
        },
        onError: (error) => {
          toast.error(error.message);
        },
      },
    );
  };

  const handleQueue = () => {
    writeContract(
      {
        address: ZORG_ADDRESS,
        abi: ZORG_ABI,
        functionName: "queue",
        args: [proposalId],
      },
      {
        onSuccess: () => {
          toast.success(t("dao.proposal_queued"));
        },
        onError: (error) => {
          toast.error(error.message);
        },
      },
    );
  };

  const stateName = state !== undefined ? PROPOSAL_STATES[state] : "Unknown";
  const totalVotes = tallies ? tallies.forVotes + tallies.againstVotes + tallies.abstainVotes : 0n;
  const forPercentage = totalVotes > 0n ? Number((tallies!.forVotes * 10000n) / totalVotes) / 100 : 0;
  const againstPercentage = totalVotes > 0n ? Number((tallies!.againstVotes * 10000n) / totalVotes) / 100 : 0;

  const isActive = state === 1; // Active state
  const canQueue = state === 3; // Succeeded state
  const userHasVoted = hasVoted > 0;
  // hasVoted returns (support + 1): 0=not voted, 1=against, 2=for, 3=abstain
  const voteTypeLabels = ["", t("dao.voted_against"), t("dao.voted_for"), t("dao.voted_abstain")];

  return (
    <div className="p-4 border border-border rounded-lg hover:border-accent transition-colors bg-card">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-sm font-mono truncate">
              {t("dao.proposal")} #{proposalId.toString().slice(0, 10)}...
            </h3>
            <span
              className={`text-xs px-2 py-1 rounded font-medium flex-shrink-0 ${
                state === 1
                  ? "bg-green-500/20 text-green-400"
                  : state === 3
                    ? "bg-blue-500/20 text-blue-400"
                    : state === 6
                      ? "bg-gray-500/20 text-gray-400"
                      : state === 4 || state === 5
                        ? "bg-red-500/20 text-red-400"
                        : "bg-muted text-muted-foreground"
              }`}
            >
              {stateName}
            </span>
          </div>

          {proposer && (
            <p className="text-xs text-muted-foreground font-mono">
              {t("dao.proposer")}: {proposer.slice(0, 6)}...
              {proposer.slice(-4)}
            </p>
          )}

          {createdAt !== undefined && createdAt > 0n && (
            <p className="text-xs text-muted-foreground">{formatTimeAgo(Number(createdAt))}</p>
          )}
        </div>
      </div>

      <div className="flex flex-row space-x-3">
        {/* Proposal Description and Image */}
        {image && (
          <div className="">{image && <img src={image} alt="Proposal visualization" className="h-24 w-20" />}</div>
        )}

        <div className="w-full">
          {description && <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{description}</p>}

          {/* Verification Badge */}
          {hasMessages && (
            <div className="mt-2 flex items-center gap-1">
              {isVerified ? (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <CheckCircle className="h-3 w-3" />
                  {t("dao.verified") || "Verified"}
                </span>
              ) : (
                <span
                  className="flex items-center gap-1 text-xs text-amber-400"
                  title="Proposal data not found in messages - cannot verify integrity"
                >
                  <AlertTriangle className="h-3 w-3" />
                  {t("dao.unverified") || "Unverified"}
                </span>
              )}
            </div>
          )}

          {/* Proposal Action Details from verified chat data */}
          {proposalData && (
            <div className="mt-3 p-3 bg-muted/50 rounded-lg border border-border">
              {/* ETH Transfer: data is empty ("0x") and value > 0 */}
              {proposalData.data.toLowerCase() === "0x" && BigInt(proposalData.value) > 0n ? (
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-primary" />
                  <div className="text-sm">
                    <span className="font-medium text-primary">{t("dao.eth_transfer") || "ETH Transfer"}</span>
                    <span className="ml-2 font-mono">{formatEther(BigInt(proposalData.value))} ETH</span>
                    <span className="ml-2 text-muted-foreground">
                      →{" "}
                      <a
                        href={`https://etherscan.io/address/${proposalData.to}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-primary hover:underline"
                      >
                        {truncateAddress(proposalData.to)}
                      </a>
                    </span>
                  </div>
                </div>
              ) : proposalData.data && proposalData.data.length > 2 ? (
                /* Contract Call: has calldata */
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <FileCode className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-medium text-amber-500">
                      {t("dao.contract_call") || "Contract Call"}
                    </span>
                    <a
                      href={`https://etherscan.io/address/${proposalData.to}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-primary hover:underline"
                    >
                      {truncateAddress(proposalData.to)}
                    </a>
                  </div>
                  {BigInt(proposalData.value) > 0n && (
                    <div className="text-xs text-muted-foreground">+ {formatEther(BigInt(proposalData.value))} ETH</div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-mono bg-background p-1 rounded max-w-[200px] truncate">
                      {proposalData.data.slice(0, 20)}...
                    </code>
                    <a
                      href={buildSwissKnifeUrl(proposalData.data, proposalData.to)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {t("dao.verify_calldata") || "Decode on Swiss Knife"}
                    </a>
                  </div>
                </div>
              ) : (
                /* Unknown action type */
                <div className="text-xs text-muted-foreground">Target: {truncateAddress(proposalData.to)}</div>
              )}
            </div>
          )}

          {/* Fallback Swiss Knife Link when no verified data */}
          {!proposalData && (
            <div className="mt-3">
              <a
                href={buildSwissKnifeUrl(undefined, ZORG_ADDRESS)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                {t("dao.decode_calldata") || "Decode calldata on Swiss Knife"}
              </a>
            </div>
          )}

          {/* Vote Tally */}
          {tallies && (
            <div className="mt-2 space-y-2 mb-4">
              <div className="flex justify-between text-xs">
                <span className="text-green-400">
                  {t("dao.for")}: {formatVoteAmount(tallies.forVotes)}
                </span>
                <span className="text-muted-foreground">
                  {t("dao.abstain")}: {formatVoteAmount(tallies.abstainVotes)}
                </span>
                <span className="text-red-400">
                  {t("dao.against")}: {formatVoteAmount(tallies.againstVotes)}
                </span>
              </div>

              <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                <div className="bg-green-500" style={{ width: `${forPercentage}%` }} />
                <div className="bg-red-500" style={{ width: `${againstPercentage}%` }} />
              </div>

              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{forPercentage.toFixed(1)}%</span>
                <span>
                  {t("dao.total_votes")}: {formatVoteAmount(totalVotes)}
                </span>
                <span>{againstPercentage.toFixed(1)}%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* User Vote Status */}
      {userHasVoted && <div className="mb-3 p-2 bg-muted rounded text-xs text-center">{voteTypeLabels[hasVoted]}</div>}

      {/* Action Buttons */}
      <div className="flex gap-2">
        {isActive && !userHasVoted && address && (
          <>
            <Button
              size="sm"
              variant="default"
              onClick={() => handleVote(VOTE_FOR)}
              disabled={isConfirming}
              className="flex-1"
            >
              {t("dao.vote_for")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleVote(VOTE_AGAINST)}
              disabled={isConfirming}
              className="flex-1"
            >
              {t("dao.vote_against")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleVote(VOTE_ABSTAIN)}
              disabled={isConfirming}
              className="flex-1"
            >
              {t("dao.abstain")}
            </Button>
          </>
        )}

        {canQueue && address && (
          <Button size="sm" onClick={handleQueue} disabled={isConfirming} className="w-full">
            {t("dao.queue_proposal")}
          </Button>
        )}
      </div>
    </div>
  );
};
