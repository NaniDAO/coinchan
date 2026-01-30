import React from "react";
import { useQuery } from "@tanstack/react-query";

interface SnapshotProposal {
  id: string;
  title: string;
  body: string;
  choices: string[];
  start: number;
  end: number;
  snapshot: string;
  state: string;
  scores: number[];
  scores_total: number;
  author: string;
  space: {
    id: string;
    name: string;
  };
}

interface SnapshotResponse {
  data: {
    proposals: SnapshotProposal[];
  };
}

const SNAPSHOT_QUERY = `
  query GetProposals($space: String!, $first: Int!) {
    proposals(
      first: $first,
      where: {
        space_in: [$space]
      },
      orderBy: "created",
      orderDirection: desc
    ) {
      id
      title
      body
      choices
      start
      end
      snapshot
      state
      scores
      scores_total
      author
      space {
        id
        name
      }
    }
  }
`;

const fetchSnapshotProposals = async (space: string, first: number = 3): Promise<SnapshotProposal[]> => {
  const response = await fetch("https://hub.snapshot.org/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: SNAPSHOT_QUERY,
      variables: {
        space,
        first,
      },
    }),
  });

  if (!response.ok) {
    console.error("Failed to fetch proposals", await response.text());
    throw new Error("Failed to fetch proposals");
  }

  const data: SnapshotResponse = await response.json();
  return data.data.proposals;
};

const useSnapshotProposals = (space: string = "zamm.eth", first: number = 3) => {
  return useQuery({
    queryKey: ["snapshot-proposals", space, first],
    queryFn: () => fetchSnapshotProposals(space, first),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 30 * 60 * 1000, // 30 minutes
  });
};

const formatTimeAgo = (timestamp: number): string => {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 3600) {
    return `${Math.floor(diff / 60)}m ago`;
  } else if (diff < 86400) {
    return `${Math.floor(diff / 3600)}h ago`;
  } else {
    return `${Math.floor(diff / 86400)}d ago`;
  }
};

const getStateColor = (state: string): string => {
  switch (state.toLowerCase()) {
    case "active":
      return "text-green-400";
    case "closed":
      return "text-muted-foreground";
    case "pending":
      return "text-yellow-400";
    default:
      return "text-muted-foreground";
  }
};

const truncateTitle = (title: string, maxLength: number = 35): string => {
  if (title.length <= maxLength) return title;
  return title.substring(0, maxLength - 3) + "...";
};

export const GovernanceProposals: React.FC = () => {
  const { data: proposals, isLoading, error } = useSnapshotProposals();

  if (isLoading) {
    return (
      <div className="text-xs space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">&gt;</span>
          <span className="animate-pulse">loading proposals...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return null;
  }

  if (!proposals || proposals.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <div className="text-xs space-y-1">
        {proposals.map((proposal) => (
          <div
            key={proposal.id}
            className="max-w-fit border-2 border-border py-1 px-2 hover:scale-105 flex items-center gap-2"
          >
            <span className="text-muted-foreground">&gt;</span>
            <a
              href={`https://snapshot.org/#/${proposal.space.id}/proposal/${proposal.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors cursor-pointer flex-1 min-w-0"
            >
              <span className="font-bold">{truncateTitle(proposal.title)}</span>
            </a>
            <span className={`${getStateColor(proposal.state)} font-mono`}>[{proposal.state}]</span>
            <span className="text-muted-foreground font-mono">{formatTimeAgo(proposal.start)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
