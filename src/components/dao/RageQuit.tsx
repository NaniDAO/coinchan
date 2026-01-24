import { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ZORG_ADDRESS, ZORG_ABI, ZORG_SHARES, ZORG_SHARES_ABI } from "@/constants/ZORG";
import { ZAMM_ERC20_TOKEN } from "@/lib/pools";
import { formatEther, parseEther, decodeEventLog } from "viem";
import { toast } from "sonner";
import { Loader2, ChevronDown } from "lucide-react";
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [confirmStep, setConfirmStep] = useState(0);

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
      setConfirmStep(0);
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
    setConfirmStep(0);
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
        <div className="border-t border-border/40 pt-4 mt-4">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors w-full"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
            />
            <span>Other options</span>
          </button>

          {isExpanded && (
            <div className="mt-4 pt-4 border-t border-dashed border-border/30">
              <details className="group">
                <summary className="cursor-pointer text-xs text-muted-foreground/50 hover:text-muted-foreground/70 list-none flex items-center gap-1">
                  <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                  Exit DAO membership
                </summary>

                <div className="mt-4 p-3 rounded border border-border/30 bg-muted/20">
                  <p className="text-[11px] text-muted-foreground/70 mb-3">
                    Burn ZORG shares to reclaim proportional ZAMM. This action is irreversible.
                  </p>

                  {owner && hasBalance && (
                    <div className="mb-2 text-[11px] text-muted-foreground/60">
                      Balance: <span className="font-mono">{formatEther(balance)} ZORG</span>
                    </div>
                  )}

                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Amount"
                      value={amount}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^[0-9]*\.?[0-9]*$/.test(val)) {
                          setAmount(val);
                          setConfirmStep(0);
                        }
                      }}
                      className="flex-1 px-2 py-1.5 rounded border border-border/50 bg-background text-xs font-mono focus:outline-none focus:border-border"
                      disabled={!owner || isLoading}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAmount(formatEther(balance));
                        setConfirmStep(0);
                      }}
                      disabled={!owner || !hasBalance || isLoading}
                      className="text-[10px] h-7 px-2 text-muted-foreground/60"
                    >
                      MAX
                    </Button>
                  </div>

                  {confirmStep === 0 && (
                    <Button
                      onClick={!owner ? openConnectModal : () => setConfirmStep(1)}
                      disabled={owner && !isValidAmount}
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs h-8 text-muted-foreground/70 hover:text-muted-foreground"
                    >
                      {!owner ? "Connect Wallet" : "Continue"}
                    </Button>
                  )}

                  {confirmStep === 1 && (
                    <div className="space-y-2">
                      <p className="text-[10px] text-amber-600/80 dark:text-amber-500/80">
                        Are you sure? You will permanently lose your ZORG shares and DAO voting power.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => setConfirmStep(0)}
                          variant="ghost"
                          size="sm"
                          className="flex-1 text-xs h-8"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => setConfirmStep(2)}
                          variant="ghost"
                          size="sm"
                          className="flex-1 text-xs h-8 text-amber-600/80 hover:text-amber-600"
                        >
                          I understand
                        </Button>
                      </div>
                    </div>
                  )}

                  {confirmStep === 2 && (
                    <Button
                      onClick={handleRageQuit}
                      disabled={isLoading}
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs h-8 text-red-500/70 hover:text-red-500 hover:bg-red-500/10"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                          Processing...
                        </>
                      ) : (
                        "Confirm Ragequit"
                      )}
                    </Button>
                  )}

                  {isSuccess && txHash && (
                    <div className="mt-3 p-2 rounded bg-green-500/10 border border-green-500/20">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-green-600/80 dark:text-green-400/80 block">
                            Complete
                          </span>
                          {zammReceived !== null && (
                            <span className="text-xs font-mono text-green-600 dark:text-green-400">
                              +{formatEther(zammReceived)} ZAMM
                            </span>
                          )}
                        </div>
                        <Button variant="ghost" size="sm" onClick={handleReset} className="text-[10px] h-6 px-2">
                          OK
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </details>
            </div>
          )}
        </div>
      )}
    </ConnectButton.Custom>
  );
};
