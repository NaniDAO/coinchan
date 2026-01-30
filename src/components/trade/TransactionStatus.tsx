import { useEffect, useState } from "react";
import { useBlockNumber, useWaitForTransactionReceipt } from "wagmi";
import { ExternalLink, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TransactionStatusProps {
  hash: `0x${string}`;
  chainId?: number;
  onComplete?: () => void;
}

const REQUIRED_CONFIRMATIONS = 12; // Standard for Ethereum finality

export function TransactionStatus({ hash, chainId = 1, onComplete }: TransactionStatusProps) {
  const [confirmations, setConfirmations] = useState(0);
  const [isFinalized, setIsFinalized] = useState(false);

  // Get transaction receipt
  const {
    data: receipt,
    isLoading: isWaitingForReceipt,
    isSuccess: isReceiptSuccess,
  } = useWaitForTransactionReceipt({
    hash,
    confirmations: 1, // Wait for at least 1 confirmation
  });

  // Get current block number for confirmation tracking
  const { data: currentBlockNumber } = useBlockNumber({
    watch: true,
    chainId,
  });

  // Calculate confirmations
  useEffect(() => {
    if (receipt?.blockNumber && currentBlockNumber && receipt.status === "success") {
      const confirmedBlocks = Number(currentBlockNumber) - Number(receipt.blockNumber);
      setConfirmations(confirmedBlocks);

      // Mark as finalized when we hit required confirmations
      if (confirmedBlocks >= REQUIRED_CONFIRMATIONS && !isFinalized) {
        setIsFinalized(true);
        onComplete?.();
      }
    }
  }, [currentBlockNumber, receipt?.blockNumber, receipt?.status, isFinalized, onComplete]);

  // Build explorer URL
  const explorerUrl = getExplorerUrl(hash, chainId);

  // Calculate progress percentage
  const progressPercentage = Math.min((confirmations / REQUIRED_CONFIRMATIONS) * 100, 100);

  // Determine status
  const status = isWaitingForReceipt
    ? "submitted"
    : isReceiptSuccess && !isFinalized
      ? "confirming"
      : isFinalized
        ? "finalized"
        : "submitted";

  return (
    <div className="mt-4 p-4 rounded-lg border border-border bg-card space-y-3">
      {/* Header with status icon */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {status === "submitted" && (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              <span className="font-medium text-blue-500">Transaction Submitted</span>
            </>
          )}
          {status === "confirming" && (
            <>
              <Clock className="h-5 w-5 text-amber-500" />
              <span className="font-medium text-amber-500">Confirming Transaction</span>
            </>
          )}
          {status === "finalized" && (
            <>
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="font-medium text-green-500">Transaction Finalized</span>
            </>
          )}
        </div>
      </div>

      {/* Transaction hash with explorer link */}
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">Transaction Hash</div>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm font-mono hover:text-primary transition-colors group"
        >
          <span className="truncate">
            {hash.slice(0, 10)}...{hash.slice(-8)}
          </span>
          <ExternalLink className="h-4 w-4 flex-shrink-0 opacity-50 group-hover:opacity-100" />
        </a>
      </div>

      {/* Confirmation progress */}
      {receipt && status !== "submitted" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Block Confirmations</span>
            <span className={cn("font-medium tabular-nums", isFinalized ? "text-green-500" : "text-amber-500")}>
              {confirmations} / {REQUIRED_CONFIRMATIONS}
            </span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn("h-full transition-all duration-500", isFinalized ? "bg-green-500" : "bg-amber-500")}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          {!isFinalized && (
            <p className="text-xs text-muted-foreground">
              Waiting for network finalization (~
              {REQUIRED_CONFIRMATIONS - confirmations} blocks)
            </p>
          )}
          {isFinalized && (
            <p className="text-xs text-green-600 dark:text-green-400">
              Transaction is now finalized and cannot be reverted
            </p>
          )}
        </div>
      )}

      {/* Block info */}
      {receipt?.blockNumber !== undefined && (
        <div className="text-xs text-muted-foreground pt-1 border-t border-border">
          Block: {receipt.blockNumber.toString()}
        </div>
      )}
    </div>
  );
}

function getExplorerUrl(hash: string, chainId: number): string {
  const explorers: Record<number, string> = {
    1: "https://etherscan.io",
    11155111: "https://sepolia.etherscan.io",
    8453: "https://basescan.org",
    10: "https://optimistic.etherscan.io",
    42161: "https://arbiscan.io",
  };

  const baseUrl = explorers[chainId] || explorers[1];
  return `${baseUrl}/tx/${hash}`;
}
