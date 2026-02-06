import { useState, useEffect, useRef } from "react";
import {
  useAccount,
  usePublicClient,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from "wagmi";
import { ZORG_ADDRESS, ZORG_ABI, ZORG_SHARES, ZORG_SHARES_ABI } from "@/constants/ZORG";
import { parseAbiItem } from "viem";
import { Button } from "@/components/ui/button";
import { CalldataDecoder } from "@/components/CalldataDecoder";
import { Loader2, Send, ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import { toast } from "sonner";
import { useAddressZorgNFT } from "@/hooks/useAddressZorgNFT";
import { useDisplayName } from "@/hooks/use-display-name";

type Message = {
  from: `0x${string}`;
  index: bigint;
  text: string;
  blockNumber: bigint;
};

type ProposalData = {
  type: string;
  op: number;
  to: string;
  value: string;
  data: string;
  nonce: string;
  description: string;
};

const shortenAddress = (address: string) => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const etherscanUrl = (type: "address" | "tx", value: string) => {
  return `https://etherscan.io/${type}/${value}`;
};

// Component for address with ENS/Wei resolution and etherscan link
const AddressLink = ({ address, className }: { address: string; className?: string }) => {
  const { displayName } = useDisplayName(address);

  return (
    <a
      href={etherscanUrl("address", address)}
      target="_blank"
      rel="noopener noreferrer"
      className={`font-mono hover:underline inline-flex items-center gap-1 ${className ?? ""}`}
      title={address}
    >
      {displayName ?? shortenAddress(address)}
      <ExternalLink className="h-3 w-3 opacity-50" />
    </a>
  );
};

// Component for address with NFT avatar, ENS/Wei resolution and etherscan link
const AddressWithNFT = ({ address, className }: { address: string; className?: string }) => {
  const { displayName } = useDisplayName(address);
  const { nftImage, hasNFT } = useAddressZorgNFT(address);

  return (
    <a
      href={etherscanUrl("address", address)}
      target="_blank"
      rel="noopener noreferrer"
      className={`font-mono hover:underline inline-flex items-center gap-1.5 ${className ?? ""}`}
      title={address}
    >
      {hasNFT && nftImage && (
        <img src={nftImage} alt="ZORG NFT" className="h-4 w-4" style={{ imageRendering: "pixelated" }} />
      )}
      {displayName ?? shortenAddress(address)}
      <ExternalLink className="h-3 w-3 opacity-50" />
    </a>
  );
};

const OP_NAMES: Record<number, string> = {
  0: "Call",
  1: "Delegate Call",
  2: "Mint Shares",
  3: "Burn Shares",
  4: "Mint Loot",
  5: "Burn Loot",
};

const parseProposalData = (text: string): { proposal: ProposalData | null; plainText: string | null } => {
  const match = text.match(/<<<PROPOSAL_DATA\s*(\{[\s\S]*?\})\s*PROPOSAL_DATA>>>/);
  if (match) {
    try {
      const proposal = JSON.parse(match[1]) as ProposalData;
      const plainText = text.replace(/<<<PROPOSAL_DATA[\s\S]*?PROPOSAL_DATA>>>/, "").trim();
      return { proposal, plainText: plainText || null };
    } catch {
      return { proposal: null, plainText: text };
    }
  }
  return { proposal: null, plainText: text };
};

const ProposalCard = ({ proposal, from }: { proposal: ProposalData; from: string }) => {
  const opName = OP_NAMES[proposal.op] ?? `Op ${proposal.op}`;
  const hasData = proposal.data && proposal.data !== "0x";
  const hasValue = proposal.value && proposal.value !== "0" && proposal.value !== "0x0";

  return (
    <div className="border rounded-lg bg-gradient-to-br from-primary/5 to-primary/10 overflow-hidden max-w-sm">
      {/* Header */}
      <div className="px-3 py-2 bg-primary/10 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wide">Proposal</span>
        </div>
        <AddressWithNFT address={from} className="text-xs text-muted-foreground" />
      </div>

      {/* Content */}
      <div className="p-3 space-y-3">
        {/* Description */}
        {proposal.description && (
          <div>
            <p className="text-sm font-medium">{proposal.description}</p>
          </div>
        )}

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-background/50 rounded px-2 py-1.5">
            <div className="text-muted-foreground mb-0.5">Operation</div>
            <div className="font-mono font-medium">{opName}</div>
          </div>
          <div className="bg-background/50 rounded px-2 py-1.5">
            <div className="text-muted-foreground mb-0.5">Target</div>
            <AddressLink address={proposal.to} className="font-medium text-xs" />
          </div>
          {hasValue && (
            <div className="bg-background/50 rounded px-2 py-1.5">
              <div className="text-muted-foreground mb-0.5">Value</div>
              <div className="font-mono font-medium">{proposal.value} wei</div>
            </div>
          )}
          {hasData && (
            <div className="bg-background/50 rounded px-2 py-1.5 col-span-2">
              <div className="text-muted-foreground mb-1">Calldata</div>
              <CalldataDecoder calldata={proposal.data} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

type DAOChatProps = {
  isFullscreen?: boolean;
  onToggleFullscreen?: (fullscreen: boolean) => void;
};

export const DAOChat = ({ isFullscreen = false, onToggleFullscreen }: DAOChatProps) => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check if user has ZORG shares (badge holder)
  const { data: zorgBalance } = useReadContract({
    address: ZORG_SHARES,
    abi: ZORG_SHARES_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, staleTime: 30_000 },
  });

  const isBadgeHolder = zorgBalance && zorgBalance > 0n;

  // Fetch messages using event logs
  useEffect(() => {
    const fetchMessages = async () => {
      if (!publicClient) return;

      try {
        setIsLoadingMessages(true);
        const logs = await publicClient.getLogs({
          address: ZORG_ADDRESS as `0x${string}`,
          event: parseAbiItem("event Message(address indexed from, uint256 indexed index, string text)"),
          fromBlock: 21540000n, // Block when contract was deployed (approximate)
          toBlock: "latest",
        });

        const parsedMessages: Message[] = logs.map((log) => ({
          from: log.args.from as `0x${string}`,
          index: log.args.index as bigint,
          text: log.args.text as string,
          blockNumber: log.blockNumber,
        }));

        // Sort by index
        parsedMessages.sort((a, b) => Number(a.index) - Number(b.index));
        setMessages(parsedMessages);
      } catch (error) {
        console.error("Failed to fetch messages:", error);
      } finally {
        setIsLoadingMessages(false);
      }
    };

    fetchMessages();
  }, [publicClient]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send message
  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  useEffect(() => {
    if (isSuccess) {
      toast.success("Message sent!");
      setNewMessage("");
      reset();
      // Refetch messages after a short delay
      setTimeout(async () => {
        if (!publicClient) return;
        try {
          const logs = await publicClient.getLogs({
            address: ZORG_ADDRESS as `0x${string}`,
            event: parseAbiItem("event Message(address indexed from, uint256 indexed index, string text)"),
            fromBlock: 21540000n,
            toBlock: "latest",
          });
          const parsedMessages: Message[] = logs.map((log) => ({
            from: log.args.from as `0x${string}`,
            index: log.args.index as bigint,
            text: log.args.text as string,
            blockNumber: log.blockNumber,
          }));
          parsedMessages.sort((a, b) => Number(a.index) - Number(b.index));
          setMessages(parsedMessages);
        } catch (error) {
          console.error("Failed to refetch messages:", error);
        }
      }, 2000);
    }
  }, [isSuccess, publicClient, reset]);

  const handleSendMessage = () => {
    if (!newMessage.trim() || !address) return;
    writeContract({
      address: ZORG_ADDRESS as `0x${string}`,
      abi: ZORG_ABI,
      functionName: "chat",
      args: [newMessage.trim()],
    });
  };

  const isLoading = isPending || isConfirming;

  return (
    <div className={`border rounded-lg bg-card overflow-hidden ${isFullscreen ? "flex flex-col h-full" : ""}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">DAO Chat</h3>
          <p className="text-xs text-muted-foreground">Messages from badge holders (onchain)</p>
        </div>
        {onToggleFullscreen && (
          <button
            type="button"
            onClick={() => onToggleFullscreen(!isFullscreen)}
            className="p-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title={isFullscreen ? "Minimize" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Messages */}
      <div className={`overflow-y-auto p-4 space-y-3 ${isFullscreen ? "flex-1" : "h-64"}`}>
        {isLoadingMessages ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            No messages yet. Be the first to post!
          </div>
        ) : (
          messages.map((msg) => {
            const { proposal, plainText } = parseProposalData(msg.text);
            const isOwnMessage = msg.from.toLowerCase() === address?.toLowerCase();

            return (
              <div
                key={msg.index.toString()}
                className={`flex flex-col gap-1 ${isOwnMessage ? "items-end" : "items-start"}`}
              >
                {/* Show proposal card if present */}
                {proposal && <ProposalCard proposal={proposal} from={msg.from} />}

                {/* Show plain text if present (either standalone or alongside proposal) */}
                {plainText && (
                  <>
                    {!proposal && <AddressWithNFT address={msg.from} className="text-xs text-muted-foreground" />}
                    <div
                      className={`px-3 py-2 rounded-lg max-w-[80%] text-sm ${
                        isOwnMessage ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}
                    >
                      {plainText}
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t bg-muted/20">
        {!address ? (
          <p className="text-xs text-muted-foreground text-center">Connect wallet to chat</p>
        ) : !isBadgeHolder ? (
          <p className="text-xs text-muted-foreground text-center">Only badge holders can send messages</p>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Type a message..."
              className="flex-1 px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
              disabled={isLoading}
            />
            <Button size="sm" onClick={handleSendMessage} disabled={isLoading || !newMessage.trim()}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
