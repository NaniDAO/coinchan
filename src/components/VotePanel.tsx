import { useQuery } from "@tanstack/react-query";
import { ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import { toast } from "sonner";
import { type Address, formatEther } from "viem";
import { useAccount, useSignTypedData } from "wagmi";

interface VotePanelProps {
  coinId: bigint;
}

const VITE_ZAMMHUB_URL = import.meta.env.VITE_ZAMMHUB_URL;

if (!VITE_ZAMMHUB_URL) {
  throw new Error("VITE_ZAMMHUB_URL is not defined");
}

interface VoteCastResponse {
  user: Address;
  choice: boolean;
  weight: string;
}

const useCurrentVotes = ({ coinId }: { coinId: bigint }) => {
  return useQuery({
    queryKey: ["votes", coinId.toString()],
    queryFn: async () => {
      const result = await fetch(`${VITE_ZAMMHUB_URL}/api/votes/summary?coinId=${coinId.toString()}`).then((res) =>
        res.json(),
      );

      return {
        upVotes: Number(formatEther(result.upvotes)).toFixed(2),
        downVotes: Number(formatEther(result.downvotes)).toFixed(2),
      };
    },
  });
};

export const VotePanel = ({ coinId }: VotePanelProps) => {
  const { data, refetch } = useCurrentVotes({ coinId });
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const handleVote = async (choice: boolean) => {
    try {
      if (!address) return;
      const timestamp = BigInt(Math.floor(Date.now() / 1000));
      const signature = await signTypedDataAsync({
        types: {
          Vote: [
            { name: "coinId", type: "uint256" },
            { name: "choice", type: "bool" },
            { name: "timestamp", type: "uint256" },
          ],
        },
        primaryType: "Vote",
        message: {
          coinId,
          choice,
          timestamp,
        },
      });

      const response = await fetch(`${VITE_ZAMMHUB_URL}/api/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          coinId: coinId.toString(),
          address,
          timestamp: timestamp.toString(),
          choice,
          signature,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Vote failed with status ${response.status}: ${error.error}`);
      }

      const data = (await response.json()) as VoteCastResponse;

      await refetch();
      toast.success(
        `${Boolean(data.choice) === true ? "Upvoted" : "Downvoted"} with ${Number(formatEther(BigInt(data.weight))).toFixed(2)} ZAMM`,
      );
    } catch (error) {
      // Handle wallet rejection gracefully - don't show error toast for user rejection
      if (
        error instanceof Error &&
        (error.message.includes("User rejected") ||
          error.message.includes("User denied") ||
          error.message.includes("rejected the request") ||
          error.message.includes("User cancelled"))
      ) {
        // User rejected the signature request - fail silently
        return;
      }

      console.error(error);
      toast.error(error instanceof Error ? error.message || "Failed to submit vote" : "Failed to submit vote");
    }
  };

  return (
    <div className="flex items-center text-foreground justify-start gap-2 mt-2">
      <button
        onClick={() => handleVote(true)}
        className="flex items-center gap-1 text-sm font-mono border border-green-500 px-3 py-1 rounded-md hover:bg-green-500 hover:text-white dark:hover:text-black transition-all duration-150 shadow-sm active:scale-[0.98]"
      >
        <ThumbsUpIcon size={16} />
        <span>{data?.upVotes ?? "-"}</span>
      </button>
      <button
        onClick={() => handleVote(false)}
        className="flex items-center gap-1 text-sm font-mono border border-red-500 px-3 py-1 rounded-md hover:bg-red-500 hover:text-white dark:hover:text-black transition-all duration-150 shadow-sm active:scale-[0.98]"
      >
        <ThumbsDownIcon size={16} />
        <span>{data?.downVotes ?? "-"}</span>
      </button>
    </div>
  );
};
