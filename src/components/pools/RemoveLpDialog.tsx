import { useMemo, useState, useEffect, useCallback } from "react";
import { Address, formatUnits, parseUnits } from "viem";
import { useAccount, usePublicClient, useWalletClient, useReadContract } from "wagmi";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { getProtocol, ProtocolId } from "@/lib/protocol";
import { getRemoveLiquidityTx } from "@/lib/pools";
import { TokenMetadata, orderTokens, computePoolId, DEFAULT_FEE_TIER } from "@/lib/pools";
import { SettingsDropdown, TradeSettings } from "@/components/pools/SettingsDropdown";
import { CheckCircle2Icon, Loader2Icon, AlertCircleIcon } from "lucide-react";
import { protocols } from "@/lib/protocol";

type TxStatus = "idle" | "pending" | "confirmed" | "error";
type TxVisualStep = {
  kind: "approve" | "removeLiquidity";
  label: string;
  status: TxStatus;
  hash?: `0x${string}`;
  error?: string;
};

type RemoveLiquidityDialogProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  tokenA: TokenMetadata;
  tokenB: TokenMetadata;
  feeOrHook?: string; // defaults to DEFAULT_FEE_TIER
  protocolId: ProtocolId;
};

export function RemoveLpDialog({
  open,
  onOpenChange,
  tokenA,
  tokenB,
  protocolId,
  feeOrHook = String(DEFAULT_FEE_TIER),
}: RemoveLiquidityDialogProps) {
  const { address: owner } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  // UI state
  const [settings, setSettings] = useState<TradeSettings>({
    autoSlippage: true,
    slippagePct: 2.0,
    deadlineMin: 30,
  });
  const [amountLp, setAmountLp] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);
  const [txSteps, setTxSteps] = useState<TxVisualStep[]>([]);

  // Pool identity
  const [token0, token1] = useMemo(
    () =>
      orderTokens(
        { address: tokenA.address as Address, id: tokenA.id },
        { address: tokenB.address as Address, id: tokenB.id },
      ),
    [tokenA.address, tokenA.id, tokenB.address, tokenB.id],
  );

  const poolId = useMemo(
    () => computePoolId(token0, token1, BigInt(feeOrHook), protocolId),
    [token0, token1, feeOrHook, protocolId],
  );

  // Protocol address + ABI (to read LP balance)
  const proto = useMemo(() => getProtocol(protocolId), [protocolId]);

  // LP token balance (ERC-6909 balanceOf(owner, poolId) on protocol contract)
  const {
    data: lpBalanceRaw,
    refetch: refetchLp,
    isLoading: isLpLoading,
  } = useReadContract({
    address: proto?.address as Address | undefined,
    abi: proto?.abi as any,
    functionName: "balanceOf",
    args: owner && poolId ? [owner, poolId] : undefined,
    query: { enabled: open && !!owner && !!proto?.address && !!poolId },
  });

  const lpBalance = (lpBalanceRaw as bigint) ?? 0n;
  const lpBalanceFmt = useMemo(() => formatUnits(lpBalance, 18), [lpBalance]);

  // Reset dialog state when (re)opened
  useEffect(() => {
    if (open) {
      setAmountLp("");
      setExecError(null);
      setTxSteps([]);
      // refresh balance when opening
      setTimeout(() => refetchLp?.(), 0);
    }
  }, [open, refetchLp]);

  const setPct = (pct: number) => {
    if (!lpBalance) return;
    const portion = (lpBalance * BigInt(Math.round(pct * 100))) / 10000n; // pct as fraction of 1.00 (e.g., 0.25 -> 25%)
    setAmountLp(formatUnits(portion, 18));
  };

  const setMax = () => {
    setAmountLp(lpBalanceFmt);
  };

  const executeRemove = useCallback(async () => {
    try {
      setExecError(null);
      setIsSubmitting(true);
      setTxSteps([]);

      if (!owner) throw new Error("Connect a wallet first.");
      if (!publicClient) throw new Error("Public client unavailable.");
      if (!walletClient) throw new Error("Wallet client unavailable.");
      if (!proto?.address) throw new Error("Protocol not found.");
      if (!poolId) throw new Error("Invalid pool.");

      const liquidity = parseUnits(amountLp || "0", 18);
      if (liquidity <= 0n) throw new Error("Enter a positive LP amount.");

      const slippageBps = BigInt(Math.round((settings.slippagePct ?? 0) * 100));
      const deadline = BigInt(Math.floor(Date.now() / 1000) + Math.max(1, settings.deadlineMin ?? 0) * 60);

      // Build tx (we’re not passing expected amounts, so mins default to 0n unless you add a preview)
      const { approvals, tx } = await getRemoveLiquidityTx(publicClient, {
        owner,
        token0,
        token1,
        liquidity,
        deadline,
        feeBps: BigInt(feeOrHook),
        slippageBps,
        protocolId,
      });

      // Plan: approvals → remove
      const approvalSteps: TxVisualStep[] = (approvals ?? []).map(() => ({
        kind: "approve",
        label: "Approve LP burn",
        status: "idle",
      }));

      const plan: TxVisualStep[] = [
        ...approvalSteps,
        {
          kind: "removeLiquidity",
          label: "Remove liquidity",
          status: "idle",
        },
      ];
      setTxSteps(plan);

      const setStep = (i: number, patch: Partial<TxVisualStep>) => {
        setTxSteps((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], ...patch };
          return next;
        });
      };

      let idx = 0;

      // Approvals (sequential)
      for (let i = 0; i < (approvals?.length ?? 0); i++) {
        const a: any = approvals![i];
        const to =
          a?.kind === "erc20"
            ? (a.token as `0x${string}`)
            : a?.kind === "erc6909"
              ? (a.on as `0x${string}`)
              : undefined;
        const data = a?.callData as `0x${string}`;
        if (!to || !data) throw new Error("Malformed approval step.");

        setStep(idx, { status: "pending" });
        const hash = await walletClient.sendTransaction({
          account: owner,
          to,
          data,
          value: 0n,
        });
        setStep(idx, { hash });
        await publicClient.waitForTransactionReceipt({ hash });
        setStep(idx, { status: "confirmed" });
        idx += 1;
      }

      // Main tx
      setStep(idx, { status: "pending" });
      const mainHash = await walletClient.sendTransaction({
        account: owner,
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: (tx as any).value ?? 0n,
      });
      setStep(idx, { hash: mainHash });
      await publicClient.waitForTransactionReceipt({ hash: mainHash });
      setStep(idx, { status: "confirmed" });

      // refresh balance after success
      refetchLp?.();
    } catch (err: any) {
      const msg = err?.shortMessage ?? err?.message ?? String(err);
      setExecError(msg);
      setTxSteps((prev) => {
        const i = prev.findIndex((s) => s.status === "pending" || s.status === "idle");
        if (i >= 0) {
          const next = [...prev];
          next[i] = { ...next[i], status: "error", error: msg };
          return next;
        }
        return prev.length ? [{ ...prev[prev.length - 1], status: "error", error: msg }] : [];
      });
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    owner,
    publicClient,
    walletClient,
    proto?.address,
    poolId,
    amountLp,
    settings.slippagePct,
    settings.deadlineMin,
    token0,
    token1,
    feeOrHook,
    protocolId,
    refetchLp,
  ]);

  const AmountCard = (
    <div className={cn("border-2 border-border rounded-lg p-3", "bg-input shadow-[2px_2px_0_var(--color-border)]")}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-muted-foreground">
          LP to burn ({tokenA.symbol}/{tokenB.symbol})
        </div>
        <div className="text-xs text-muted-foreground">Balance: {isLpLoading ? "…" : lpBalanceFmt}</div>
      </div>

      <div className="flex gap-2">
        <Input
          type="number"
          inputMode="decimal"
          placeholder="0.0"
          value={amountLp}
          onChange={(e) => setAmountLp(e.target.value)}
          className="text-right text-lg"
          min={0}
          step="any"
        />
        <Button variant="secondary" onClick={setMax}>
          Max
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {[0.25, 0.5, 0.75, 1.0].map((p) => (
          <button
            key={p}
            onClick={() => setPct(p)}
            className={cn(
              "text-sm px-2 py-1 rounded-sm border-2 border-border bg-background",
              "hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0_var(--color-border)]",
              "active:translate-x-0 active:translate-y-0 active:shadow-[1px_1px_0_var(--color-border)]",
              "transition-[transform,box-shadow]",
            )}
          >
            {(p * 100).toFixed(0)}%
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Remove liquidity</DialogTitle>
          <DialogDescription>
            Burn LP tokens for <span className="font-medium">{tokenA.symbol}</span> /{" "}
            <span className="font-medium">{tokenB.symbol}</span> at{" "}
            <span className="text-muted-foreground">
              {protocols.find((p) => p.id === protocolId)?.label ?? protocolId}
            </span>
          </DialogDescription>
        </DialogHeader>

        {AmountCard}

        <div className="flex items-center justify-between mt-3">
          <div className="text-xs text-muted-foreground">Slippage &amp; deadline</div>
          <SettingsDropdown value={settings} onChange={setSettings} />
        </div>

        {(execError || txSteps.length > 0) && (
          <div className="rounded-md border mt-2 px-3 py-2">
            <div className="text-sm font-medium mb-1">Transaction progress</div>
            {txSteps.length === 0 && execError && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertCircleIcon className="w-4 h-4" />
                {execError}
              </div>
            )}
            <ul className="space-y-2">
              {txSteps.map((s, idx) => (
                <li
                  key={idx}
                  className={cn(
                    "flex items-start justify-between gap-3 rounded-md border px-3 py-2",
                    s.status === "confirmed"
                      ? "border-emerald-300 bg-emerald-50"
                      : s.status === "error"
                        ? "border-red-300 bg-red-50"
                        : "border-border bg-card",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {s.status === "pending" && <Loader2Icon className="w-4 h-4 animate-spin" />}
                    {s.status === "confirmed" && <CheckCircle2Icon className="w-4 h-4 text-emerald-600" />}
                    {s.status === "error" && <AlertCircleIcon className="w-4 h-4 text-red-600" />}
                    <div className="text-sm">
                      <div className="font-medium">{s.label}</div>
                      {s.hash && <div className="text-xs text-muted-foreground break-all">{s.hash}</div>}
                      {s.error && <div className="text-xs text-red-600">{s.error}</div>}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">{s.status}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            className="min-w-[140px]"
            onClick={executeRemove}
            disabled={isSubmitting || !amountLp || Number.isNaN(parseFloat(amountLp)) || parseFloat(amountLp) <= 0}
          >
            {isSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2Icon className="w-4 h-4 animate-spin" />
                Submitting…
              </span>
            ) : (
              "Confirm"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
