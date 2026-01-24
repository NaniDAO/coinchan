import { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ZORG_ADDRESS, ZORG_ABI, ZORG_SHARES, ZORG_SHARES_ABI } from "@/constants/ZORG";
import { ZAMM_ERC20_TOKEN } from "@/lib/pools";
import { formatEther, parseEther, decodeEventLog } from "viem";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { handleWalletError } from "@/lib/errors";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const erc20TransferAbi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
  },
] as const;

export const RageQuit = () => {
  const { address: owner } = useAccount();
  const [amount, setAmount] = useState("");
  const [zammReceived, setZammReceived] = useState<bigint | null>(null);

  const { data: zorgSharesBalance, isLoading: isBalanceLoading, refetch: refetchBalance } = useReadContract({
    address: ZORG_SHARES,
    abi: ZORG_SHARES_ABI,
    functionName: "balanceOf",
    args: owner ? [owner] : undefined,
    query: {
      enabled: !!owner,
      staleTime: 30_000,
    },
  });

  const { data: isRagequittable, isLoading: isRagequittableLoading } = useReadContract({
    address: ZORG_ADDRESS,
    abi: ZORG_ABI,
    functionName: "ragequittable",
    query: {
      staleTime: 60_000,
    },
  });

  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess && receipt && owner) {
      // Parse logs to find ZAMM transfer amount
      const zammTransfer = receipt.logs.find((log) => {
        try {
          if (log.address.toLowerCase() !== ZAMM_ERC20_TOKEN.toLowerCase()) return false;
          const decoded = decodeEventLog({
            abi: erc20TransferAbi,
            data: log.data,
            topics: log.topics,
          });
          return decoded.eventName === "Transfer" && decoded.args.to?.toLowerCase() === owner.toLowerCase();
        } catch {
          return false;
        }
      });

      if (zammTransfer) {
        try {
          const decoded = decodeEventLog({
            abi: erc20TransferAbi,
            data: zammTransfer.data,
            topics: zammTransfer.topics,
          });
          if (decoded.eventName === "Transfer") {
            setZammReceived(decoded.args.value);
            toast.success(`Ragequit successful! Received ${formatEther(decoded.args.value)} ZAMM`);
          }
        } catch {
          toast.success("Ragequit successful!");
        }
      } else {
        toast.success("Ragequit successful!");
      }

      setAmount("");
      refetchBalance();
    }
  }, [isSuccess, receipt, owner, refetchBalance]);

  const handleRageQuit = async () => {
    if (!owner || !amount || Number(amount) <= 0) return;

    setZammReceived(null);

    try {
      const sharesToBurn = parseEther(amount);

      writeContract({
        address: ZORG_ADDRESS,
        abi: ZORG_ABI,
        functionName: "ragequit",
        args: [[ZAMM_ERC20_TOKEN], sharesToBurn, 0n],
      });
    } catch (err) {
      console.error("Ragequit error:", err);
      const msg = handleWalletError(err);
      if (msg !== null) {
        toast.error(msg);
      }
    }
  };

  const handleReset = () => {
    setZammReceived(null);
    reset();
  };

  const balance = zorgSharesBalance ?? 0n;
  const hasBalance = balance > 0n;
  const isLoading = isPending || isConfirming;
  const inputAmount = amount ? parseEther(amount) : 0n;
  const isValidAmount = inputAmount > 0n && inputAmount <= balance;

  if (isRagequittableLoading || isBalanceLoading) {
    return null;
  }

  if (!isRagequittable) {
    return null;
  }

  return (
    <ConnectButton.Custom>
      {({ openConnectModal }) => (
        <div className="border border-red-500/20 rounded-lg bg-red-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-sm font-medium text-red-500">Rage Quit</span>
          </div>

          <p className="text-xs text-muted-foreground mb-4">
            Burn your ZORG shares to reclaim your proportional ZAMM from the treasury.
          </p>

          {owner && hasBalance && (
            <div className="mb-3 text-xs text-muted-foreground">
              Available: <span className="font-mono text-foreground">{formatEther(balance)} ZORG</span>
            </div>
          )}

          <div className="flex gap-2 mb-3">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Amount to burn"
              value={amount}
              onChange={(e) => {
                const val = e.target.value;
                if (/^[0-9]*\.?[0-9]*$/.test(val)) {
                  setAmount(val);
                }
              }}
              className="flex-1 px-3 py-2 rounded-lg border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500/50"
              disabled={!owner || isLoading}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAmount(formatEther(balance))}
              disabled={!owner || !hasBalance || isLoading}
              className="text-xs"
            >
              MAX
            </Button>
          </div>

          <Button
            onClick={!owner ? openConnectModal : handleRageQuit}
            disabled={owner && (isLoading || !isValidAmount)}
            variant="destructive"
            className="w-full"
          >
            {!owner ? (
              "Connect Wallet"
            ) : isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processing...
              </>
            ) : (
              "Rage Quit"
            )}
          </Button>

          {isSuccess && txHash && (
            <div className="mt-3 p-2 border border-green-500/30 rounded-lg bg-green-500/5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-green-600 dark:text-green-400 block">
                    Ragequit successful!
                  </span>
                  {zammReceived !== null && (
                    <span className="text-sm font-mono font-semibold text-green-600 dark:text-green-400">
                      +{formatEther(zammReceived)} ZAMM
                    </span>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs">
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </ConnectButton.Custom>
  );
};
