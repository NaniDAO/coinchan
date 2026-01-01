import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Coins, Loader2 } from "lucide-react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { DaicoAbi, DaicoAddress } from "@/constants/DAICO";
import { formatEther, type Address } from "viem";
import { useEffect } from "react";
import { toast } from "sonner";

interface DAICOTapClaimCardProps {
  daoAddress: string;
  opsAddress: string;
  chainId: number;
}

export function DAICOTapClaimCard({ daoAddress, opsAddress, chainId }: DAICOTapClaimCardProps) {
  const { address: connectedAddress } = useAccount();

  // Only show if connected wallet is the ops beneficiary
  const isOps = connectedAddress && connectedAddress.toLowerCase() === opsAddress.toLowerCase();

  // Fetch claimable tap amount
  const { data: claimableAmount, refetch: refetchClaimable } = useReadContract({
    address: DaicoAddress,
    abi: DaicoAbi,
    functionName: "claimableTap",
    args: [daoAddress as Address],
    chainId,
    query: {
      enabled: !!isOps,
      refetchInterval: 10_000, // Refresh every 10 seconds
    },
  });

  // Claim tap mutation
  const { writeContract, data: hash, isPending: isWriting } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId });

  const handleClaim = () => {
    if (!claimableAmount || claimableAmount === 0n) {
      toast.error("No funds available to claim");
      return;
    }

    writeContract({
      address: DaicoAddress,
      abi: DaicoAbi,
      functionName: "claimTap",
      args: [daoAddress as Address],
      chainId,
    });
  };

  // Handle successful claim
  useEffect(() => {
    if (isSuccess) {
      toast.success("Tap claimed successfully!");
      refetchClaimable();
    }
  }, [isSuccess, refetchClaimable]);

  // Don't render if not ops
  if (!isOps) {
    return null;
  }

  const claimableETH = claimableAmount ? parseFloat(formatEther(claimableAmount)) : 0;
  const hasClaimable = claimableETH > 0;

  return (
    <Card className="p-6 bg-gradient-to-br from-green-500/10 via-primary/5 to-background border-green-500/20">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-full bg-green-500/10">
          <Coins className="w-6 h-6 text-green-500" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-lg mb-1">Ops Tap Claim</h3>
          <p className="text-sm text-muted-foreground mb-4">
            You are the operations beneficiary. Claim your streaming tap payments.
          </p>

          <div className="mb-4 p-4 rounded-lg bg-background/50">
            <div className="text-sm text-muted-foreground mb-1">Claimable Amount</div>
            <div className="text-2xl font-bold">
              {claimableETH > 0 ? `Ξ${claimableETH.toFixed(6)}` : "Ξ0"}
            </div>
          </div>

          <Button
            onClick={handleClaim}
            disabled={!hasClaimable || isWriting || isConfirming}
            className="w-full gap-2"
            variant={hasClaimable ? "default" : "secondary"}
          >
            {isWriting || isConfirming ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {isWriting ? "Confirming..." : "Claiming..."}
              </>
            ) : (
              <>
                <Coins className="w-4 h-4" />
                Claim Tap
              </>
            )}
          </Button>

          {!hasClaimable && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              No funds available to claim at this time
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
