import { CreatePoolStep, Stepper } from "@/components/pools/CreatePoolStepper";
import { CreatePositionBreadcrumb } from "@/components/pools/CreatePositionBreadcrumb";
import { PoolHeaderCard } from "@/components/pools/PoolHeaderCard";
import { ProtocolId, protocols } from "@/lib/protocol";
import { ProtocolSelector } from "@/components/pools/ProtocolSelector";
import { SettingsDropdown, TradeSettings } from "@/components/pools/SettingsDropdown";
import { TokenAmountInput } from "@/components/pools/TokenAmountInput";
import { TokenSelector } from "@/components/pools/TokenSelector";
import { Button } from "@/components/ui/button";
import { useGetTokens } from "@/hooks/use-get-tokens";
import { useReserves } from "@/hooks/use-reserves";
import {
  computePoolId,
  DEFAULT_FEE_TIER,
  ETH_TOKEN,
  TokenMetadata,
  ZAMM_TOKEN,
  getAddLiquidityTx,
  orderTokens,
  sameToken,
  isFeeOrHook,
} from "@/lib/pools";
import { cn } from "@/lib/utils";

import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { RotateCcwIcon, SettingsIcon, Loader2Icon, CheckCircle2Icon, AlertCircleIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { parseUnits } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { encodeTokenQ, findTokenFlexible, isCanonicalTokenQ } from "@/lib/token-query";
import { FeeOrHookSelector } from "@/components/pools/FeeOrHookSelector";
import { shortenUint } from "@/lib/math";
import { getEtherscanTxUrl } from "@/lib/explorer";

export const Route = createFileRoute("/positions/create")({
  component: RouteComponent,
  validateSearch: (search: {
    tokenA?: string;
    tokenB?: string;
    fee?: string; // feeBps OR hook uint256 (big)
    hook?: string; // optional alias for hook value
    protocol?: ProtocolId;
  }) => search,
});

// Protocols where creating *new* pools is disallowed
const CREATION_BLOCKED_PROTOCOLS = new Set<ProtocolId>(["ZAMMV0"]);

type TxStatus = "idle" | "pending" | "confirmed" | "error";
type TxVisualStep = {
  kind: "approve" | "addLiquidity";
  label: string;
  status: TxStatus;
  hash?: `0x${string}`;
  error?: string;
};

function RouteComponent() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/positions/create" });

  const { address: owner } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const { data: tokens } = useGetTokens(owner);
  const [protocolId, setProtocolId] = useState<ProtocolId>(() => {
    const p = search.protocol as ProtocolId | undefined;
    return p && protocols.some((x) => x.id === p) ? p : protocols[1].id;
  });
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [fee, setFee] = useState<bigint>(DEFAULT_FEE_TIER); // this is feeBps OR hook uint256

  const [settings, setSettings] = useState<TradeSettings>({
    autoSlippage: true,
    slippagePct: 2.5,
    deadlineMin: 30,
  });

  // Selected tokens
  const [tokenA, setTokenA] = useState<TokenMetadata>(ETH_TOKEN);
  const [tokenB, setTokenB] = useState<TokenMetadata>(ZAMM_TOKEN);

  // Local deposit amounts (text to keep user’s formatting)
  const [amountA, setAmountA] = useState<string>("");
  const [amountB, setAmountB] = useState<string>("");

  // Submission states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);
  const [txSteps, setTxSteps] = useState<TxVisualStep[]>([]);

  const isHook = useMemo(() => {
    return isFeeOrHook(fee);
  }, [fee]);

  const reservesSource = protocolId === "ZAMMV0" ? "ZAMM" : "COOKBOOK";

  const creationAllowed = useMemo(() => !CREATION_BLOCKED_PROTOCOLS.has(protocolId), [protocolId]);

  const selectedPoolId = useMemo(() => {
    if (!tokenA || !tokenB || fee == null) return undefined;
    return computePoolId(
      { address: tokenA.address, id: tokenA.id },
      { address: tokenB.address, id: tokenB.id },
      fee, // fee or hook
      protocolId,
    );
  }, [tokenA, tokenB, fee, protocolId]);

  const { data: selectedReserves } = useReserves({
    poolId: selectedPoolId,
    source: reservesSource,
  });

  // ---- Fee-tier liquidity: compute poolIds and fetch reserves for each known tier ----
  // Commented out - not currently used with new FeeOrHookSelector
  // const poolId100 = useMemo(() => {
  //   if (!tokenA || !tokenB) return undefined;
  //   return computePoolId(
  //     { address: tokenA.address, id: tokenA.id },
  //     { address: tokenB.address, id: tokenB.id },
  //     100n,
  //     protocolId,
  //   );
  // }, [tokenA, tokenB, protocolId]);

  // const poolId500 = useMemo(() => {
  //   if (!tokenA || !tokenB) return undefined;
  //   return computePoolId(
  //     { address: tokenA.address, id: tokenA.id },
  //     { address: tokenB.address, id: tokenB.id },
  //     500n,
  //     protocolId,
  //   );
  // }, [tokenA, tokenB, protocolId]);

  // const poolId3000 = useMemo(() => {
  //   if (!tokenA || !tokenB) return undefined;
  //   return computePoolId(
  //     { address: tokenA.address, id: tokenA.id },
  //     { address: tokenB.address, id: tokenB.id },
  //     3000n,
  //     protocolId,
  //   );
  // }, [tokenA, tokenB, protocolId]);

  // const poolId10000 = useMemo(() => {
  //   if (!tokenA || !tokenB) return undefined;
  //   return computePoolId(
  //     { address: tokenA.address, id: tokenA.id },
  //     { address: tokenB.address, id: tokenB.id },
  //     10000n,
  //     protocolId,
  //   );
  // }, [tokenA, tokenB, protocolId]);

  // Commented out - not currently used with new FeeOrHookSelector
  // const { data: reserves100 } = useReserves({
  //   poolId: poolId100,
  //   source: reservesSource,
  // });
  // const { data: reserves500 } = useReserves({
  //   poolId: poolId500,
  //   source: reservesSource,
  // });
  // const { data: reserves3000 } = useReserves({
  //   poolId: poolId3000,
  //   source: reservesSource,
  // });
  // const { data: reserves10000 } = useReserves({
  //   poolId: poolId10000,
  //   source: reservesSource,
  // });

  useEffect(() => {
    if (!tokens?.length) return;

    // A) Resolve from flexible query (addr:id | addr | symbol | id)
    const matchA = findTokenFlexible(tokens as any, search.tokenA);
    const matchB = findTokenFlexible(tokens as any, search.tokenB);

    if (matchA) {
      setTokenA((prev) => (prev && prev.id === matchA.id && prev.address === matchA.address ? prev : matchA));
    }
    if (matchB) {
      setTokenB((prev) => (prev && prev.id === matchB.id && prev.address === matchB.address ? prev : matchB));
    }

    // B) If either query was missing or non-canonical, rewrite to canonical once
    const canonA = matchA ? encodeTokenQ(matchA) : encodeTokenQ(tokenA);
    const canonB = matchB ? encodeTokenQ(matchB) : encodeTokenQ(tokenB);

    const needsCanonA = !isCanonicalTokenQ(search.tokenA) && !!canonA;
    const needsCanonB = !isCanonicalTokenQ(search.tokenB) && !!canonB;
    const needsFill = !search.tokenA || !search.tokenB;

    if (needsCanonA || needsCanonB || needsFill) {
      navigate({
        to: "/positions/create",
        replace: true,
        search: (s: any) => ({
          ...s,
          tokenA: canonA,
          tokenB: canonB,
          // keep any existing fee/protocol/hook in place
        }),
      });
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens]);

  useEffect(() => {
    if (!tokens?.length) return;

    // Accept either ?hook=<uint256> or ?fee=<string> (used as feeBps or hook)
    const tryParseBig = (v?: string) => {
      if (!v) return undefined;
      try {
        return BigInt(v);
      } catch {
        return undefined;
      }
    };

    const hookParam = tryParseBig(search.hook as any);
    const feeParam = tryParseBig(search.fee as any);

    if (hookParam !== undefined) {
      setFee(hookParam);
    } else if (feeParam !== undefined) {
      setFee(feeParam);
    }

    if (search.protocol) {
      const exists = protocols.some((p) => p.id === search.protocol);
      if (exists) setProtocolId(search.protocol as ProtocolId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens]);

  // --- whenever these change, reflect canonical values in URL ---
  useEffect(() => {
    if (!tokenA || !tokenB) return;

    // When in hook mode, also mirror to ?hook= for clarity; otherwise omit it.
    navigate({
      to: "/positions/create",
      replace: true,
      search: (s: any) => ({
        ...s,
        tokenA: encodeTokenQ(tokenA),
        tokenB: encodeTokenQ(tokenB),
        fee: fee?.toString(),
        hook: isHook ? fee?.toString() : undefined,
        protocol: protocolId,
      }),
    });
  }, [tokenA, tokenB, fee, isHook, protocolId, navigate]);

  // When wallet tokens arrive/update, hydrate the currently selected tokens with balances
  useEffect(() => {
    if (!tokens?.length) return;

    const BALANCE_KEYS = ["balance", "rawBalance", "formattedBalance"] as const;

    const mergeBalances = <T extends Record<string, any>>(prev: T, match: any): T => {
      let changed = false;
      const next: any = { ...prev };
      for (const k of BALANCE_KEYS) {
        if (match?.[k] !== undefined && match?.[k] !== prev?.[k]) {
          next[k] = match[k];
          changed = true;
        }
      }
      return changed ? (next as T) : prev;
    };

    // Hydrate A without changing which token is selected
    setTokenA((prev) => {
      if (!prev) return prev;
      const match = tokens.find((t) => sameToken(t as any, prev));
      return match ? mergeBalances(prev, match) : prev;
    });

    // Hydrate B without changing which token is selected
    setTokenB((prev) => {
      if (!prev) return prev;
      const match = tokens.find((t) => sameToken(t as any, prev));
      return match ? mergeBalances(prev, match) : prev;
    });
  }, [tokens, setTokenA, setTokenB]);

  const onSelectTokenA = useCallback(
    (next: TokenMetadata) => {
      setTokenA(next);
      navigate({
        to: "/positions/create",
        replace: true,
        search: (s: any) => ({ ...s, tokenA: encodeTokenQ(next) }),
      });
    },
    [navigate],
  );

  const onSelectTokenB = useCallback(
    (next: TokenMetadata) => {
      setTokenB(next);
      navigate({
        to: "/positions/create",
        replace: true,
        search: (s: any) => ({ ...s, tokenB: encodeTokenQ(next) }),
      });
    },
    [navigate],
  );

  const ready = useMemo(() => Boolean(tokens?.length && tokenA && tokenB), [tokens, tokenA, tokenB]);

  const [samePair, hasBalanceA, hasBalanceB, hasBothBalances] = useMemo(() => {
    const samePair = sameToken(tokenA, tokenB);
    const hasBalanceA = (tokenA?.balance ?? 0n) > 0n;
    const hasBalanceB = (tokenB?.balance ?? 0n) > 0n;
    const hasBothBalances = hasBalanceA && hasBalanceB;
    return [samePair, hasBalanceA, hasBalanceB, hasBothBalances];
  }, [tokenA, tokenB]);

  // Detect if pool exists using reserves shape loosely
  const poolExists = useMemo(() => {
    const r: any = selectedReserves;
    if (!r) return false;
    const ra = r.reserveA ?? r.reserve0 ?? r[0];
    const rb = r.reserveB ?? r.reserve1 ?? r[1];
    const liq = r.liquidity ?? r.totalLiquidity;
    if (typeof liq === "bigint") return liq > 0n;
    if (typeof liq === "number") return liq > 0;
    return ra != null && rb != null;
  }, [selectedReserves]);

  // Explicit "not initialized" signal: we know there is zero liquidity
  const poolUninitialized = useMemo(() => {
    const r: any = selectedReserves;
    if (!r) return false; // unknown, don't warn
    const liq = r.liquidity ?? r.totalLiquidity;
    const ra = r.reserveA ?? r.reserve0 ?? r[0];
    const rb = r.reserveB ?? r.reserve1 ?? r[1];
    const isZero = (v: any) => (typeof v === "bigint" ? v === 0n : Number(v) === 0);

    if (liq != null) return isZero(liq);
    if (ra != null && rb != null) return isZero(ra) && isZero(rb);
    return false;
  }, [selectedReserves]);

  // V0 cannot be initialised: block forward nav when zero-reserve pool is selected
  const v0UninitBlocked = protocolId === "ZAMMV0" && poolUninitialized;

  // price (tokenA per 1 tokenB), with safe fallbacks
  const marketPrice = useMemo(() => {
    try {
      const r: any = selectedReserves;
      if (!r) return undefined;
      const ra = Number(r.reserveA ?? r.reserve0 ?? r[0]);
      const rb = Number(r.reserveB ?? r.reserve1 ?? r[1]);
      const da = tokenA?.decimals ?? 18;
      const db = tokenB?.decimals ?? 18;

      if (!isFinite(ra) || !isFinite(rb) || rb <= 0) return undefined;

      const a = ra / 10 ** da;
      const b = rb / 10 ** db;
      if (b <= 0) return undefined;

      return a / b; // tokenA per 1 tokenB
    } catch {
      return undefined;
    }
  }, [selectedReserves, tokenA?.decimals, tokenB?.decimals]);

  // keep amounts in pool ratio if user edits either side
  const onChangeAmountA = (v: string) => {
    setAmountA(v);
    const x = parseFloat(v);
    if (marketPrice && isFinite(x)) {
      const y = x / marketPrice; // B needed for x A
      setAmountB(Number.isFinite(y) ? String(y) : "");
    }
  };

  const onChangeAmountB = (v: string) => {
    setAmountB(v);
    const y = parseFloat(v);
    if (marketPrice && isFinite(y)) {
      const x = y * marketPrice; // A needed for y B
      setAmountA(Number.isFinite(x) ? String(x) : "");
    }
  };

  // fee/hook label
  const feeLabel = useMemo(() => {
    if (isHook) {
      return `Hook • ${shortenUint(fee)} (${fee.toString().length} digits)`;
    }
    try {
      return `${(Number(fee) / 100).toFixed(2)}%`;
    } catch {
      return "—";
    }
  }, [fee, isHook]);

  // ----- Formatting helpers for liquidity labels on fee cards -----
  // Commented out - not currently used with new FeeOrHookSelector
  // const fmtNumber = (n: number) =>
  //   Number.isFinite(n)
  //     ? n >= 1e6
  //       ? n.toExponential(2)
  //       : n.toLocaleString(undefined, { maximumFractionDigits: 4 })
  //     : "—";

  // const toNum = (v: any) => {
  //   if (typeof v === "bigint") {
  //     // best-effort; may overflow for extremely large values but fine for UI hinting
  //     return Number(v);
  //   }
  //   return Number(v);
  // };

  // Dynamic steps: show "Create new pool & seed" when relevant (Review step removed)
  const steps: CreatePoolStep[] = useMemo(() => {
    const creatingNewPool = !poolExists && creationAllowed;
    return [
      { title: "Select token pair and fee/hook" },
      {
        title: creatingNewPool ? "Create new pool & seed" : "Enter deposit amounts",
      },
    ];
  }, [poolExists, creationAllowed]);

  const resetAll = () => {
    setProtocolId(protocols[0].id);
    setCurrentStep(1);
    setTokenA(ETH_TOKEN);
    setTokenB(ZAMM_TOKEN);
    setAmountA("");
    setAmountB("");
    setExecError(null);
    setTxSteps([]);
    setIsSubmitting(false);
    setFee(DEFAULT_FEE_TIER);
  };

  // Only allow backwards navigation via Stepper. Forwards must come from explicit buttons.
  const handleStepChange = useCallback(
    (next: number) => {
      if (next < currentStep) {
        setCurrentStep(next);
      }
    },
    [currentStep],
  );

  // UI helpers
  const creatingNewPool = !poolExists && creationAllowed;
  const creationBlocked = !poolExists && !creationAllowed;

  const executeAddLiquidity = useCallback(async () => {
    try {
      setExecError(null);
      setIsSubmitting(true);
      setTxSteps([]);

      if (!owner) throw new Error("Connect a wallet first.");
      if (!publicClient) throw new Error("Public client unavailable.");
      if (!walletClient) throw new Error("Wallet client unavailable.");
      if (!tokenA || !tokenB) throw new Error("Select both tokens.");

      // Parse user amounts → raw units
      const amountARaw = parseUnits((amountA || "0").trim(), tokenA.decimals ?? 18);
      const amountBRaw = parseUnits((amountB || "0").trim(), tokenB.decimals ?? 18);
      if (amountARaw <= 0n || amountBRaw <= 0n) {
        throw new Error("Enter valid, positive deposit amounts.");
      }

      // Sort tokens into pool order & map amounts accordingly
      const [sorted0, sorted1] = orderTokens(
        { address: tokenA.address, id: tokenA.id },
        { address: tokenB.address, id: tokenB.id },
      );
      const tokenAIs0 =
        tokenA.id === sorted0.id && String(tokenA.address).toLowerCase() === String(sorted0.address).toLowerCase();
      const amount0 = tokenAIs0 ? amountARaw : amountBRaw;
      const amount1 = tokenAIs0 ? amountBRaw : amountARaw;

      // Settings → bps & deadline
      const slippageBps = BigInt(Math.round((settings.slippagePct ?? 0) * 100));
      const deadline = BigInt(Math.floor(Date.now() / 1000) + Math.max(1, settings.deadlineMin ?? 0) * 60);

      // Ask helper for approvals + addLiquidity tx
      const { approvals, tx } = await getAddLiquidityTx(publicClient, {
        owner,
        token0: sorted0,
        token1: sorted1,
        amount0,
        amount1,
        deadline,
        feeBps: fee, // NOTE: this is fee or hook; contracts accept it
        slippageBps,
        protocolId,
      });

      console.log("TX", tx);

      // Build visual plan with labels from the approval objects
      const approvalSteps: TxVisualStep[] = (approvals ?? []).map((a: any) => {
        let label = "Approve";
        if (a?.kind === "erc20") {
          const isA = String(a.token).toLowerCase() === String(tokenA.address).toLowerCase();
          const isB = String(a.token).toLowerCase() === String(tokenB.address).toLowerCase();
          label = `Approve ${isA ? tokenA.symbol ?? "TokenA" : isB ? tokenB.symbol ?? "TokenB" : "token"}`;
        } else if (a?.kind === "erc6909") {
          const isA = String(a.on).toLowerCase() === String(tokenA.address).toLowerCase();
          const isB = String(a.on).toLowerCase() === String(tokenB.address).toLowerCase();
          label = `Enable operator for ${isA ? tokenA.symbol ?? "TokenA" : isB ? tokenB.symbol ?? "TokenB" : "token"}`;
        }
        return { kind: "approve", label, status: "idle" } as TxVisualStep;
      });

      const plan: TxVisualStep[] = [
        ...approvalSteps,
        {
          kind: "addLiquidity",
          label: creatingNewPool ? "Create pool & add liquidity" : "Add liquidity",
          status: "idle",
        },
      ];

      console.log("PLAN:", plan);
      setTxSteps(plan);

      // Helper to update a single step by index
      const setStep = (i: number, patch: Partial<TxVisualStep>) => {
        setTxSteps((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], ...patch };
          return next;
        });
      };

      let sentIdx = 0;

      // 1) Approvals
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

        setStep(sentIdx, { status: "pending" });
        const hash = await walletClient.sendTransaction({
          account: owner,
          to,
          data,
          value: 0n,
        });
        setStep(sentIdx, { hash });
        await publicClient.waitForTransactionReceipt({ hash });
        setStep(sentIdx, { status: "confirmed" });
        sentIdx += 1;
      }

      // 2) Main addLiquidity tx
      setStep(sentIdx, { status: "pending" });
      const mainHash = await walletClient.sendTransaction({
        account: owner,
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        value: (tx as any).value ?? 0n,
      });
      setStep(sentIdx, { hash: mainHash });
      await publicClient.waitForTransactionReceipt({ hash: mainHash });
      setStep(sentIdx, { status: "confirmed" });

      // Optionally reset input amounts after success
      // setAmountA(""); setAmountB("");
    } catch (err: any) {
      const msg = err?.shortMessage ?? err?.message ?? String(err);
      setExecError(msg);
      // Mark the first pending/idle step (if any) as error
      setTxSteps((prev) => {
        const idx = prev.findIndex((s) => s.status === "pending" || s.status === "idle");
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], status: "error", error: msg };
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
    tokenA,
    tokenB,
    amountA,
    amountB,
    settings.slippagePct,
    settings.deadlineMin,
    fee,
    protocolId,
    creatingNewPool,
  ]);

  return (
    <div className="p-2">
      <CreatePositionBreadcrumb />
      <div className="mt-8 flex flex-row justify-between items-center">
        <h2 className="text-4xl font-semibold tracking-wide">New Position</h2>
        <div className="flex flex-row gap-2 px-8 items-center">
          <button
            className={cn(
              "h-9 inline-flex w-fit items-center justify-between gap-2 whitespace-nowrap px-3 text-sm",
              "data-[size=default]:h-9 data-[size=sm]:h-8 rounded-sm",
              "border-2 border-border bg-input text-foreground",
              "shadow-[2px_2px_0_var(--color-border)]",
              "hover:bg-accent hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_var(--color-border)]",
              "active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0_var(--color-border)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "data-[placeholder]:text-muted-foreground",
              "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
              "[&_svg:not([class*='text-'])]:text-muted-foreground",
              "*:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 *:data-[slot=select-value]:line-clamp-1",
              "transition-[transform,box-shadow,color]",
            )}
            onClick={resetAll}
          >
            <RotateCcwIcon size={10} className="mr-2" />
            <span className="font-light">Reset</span>
          </button>

          <ProtocolSelector className="h-8 font-light" protocolId={protocolId} setProtocolId={setProtocolId} />

          <SettingsDropdown value={settings} onChange={setSettings} />
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 pr-8 mt-4">
        {/* LEFT: steps */}
        <div className="col-span-2">
          <Stepper steps={steps} currentStep={currentStep} onStepChange={handleStepChange} />
        </div>

        {/* RIGHT: content */}
        <div className="col-span-3 border-border border-2 p-4 rounded-lg">
          {/* ---------- STEP 1: pair + fee/hook ---------- */}
          {currentStep === 1 && (
            <>
              <div>
                <h3 className="text-lg font-semibold">Select pair</h3>
                <p className="text-base text-muted-foreground">Choose a pair of tokens to create a new position.</p>
                <div className="flex items-center gap-3">
                  <TokenSelector
                    selectedToken={tokenA}
                    tokens={tokens ?? []}
                    onSelect={onSelectTokenA}
                    className="flex-1  min-w-0"
                  />
                  <TokenSelector
                    selectedToken={tokenB}
                    tokens={tokens ?? []}
                    onSelect={onSelectTokenB}
                    className="flex-1 min-w-0"
                  />
                </div>
                {samePair && <p className="mt-2 text-xs text-red-500">Please select two different tokens.</p>}
              </div>

              <FeeOrHookSelector feeOrHook={fee} setFeeOrHook={setFee} isHook={isHook} className="flex-1 min-w-0" />

              <Button
                variant="default"
                className="w-full rounded-lg text-xl py-6 mt-4"
                disabled={
                  !ready || samePair || (!poolExists && !creationAllowed) || v0UninitBlocked || !hasBothBalances
                }
                onClick={() => setCurrentStep(2)}
              >
                Continue
              </Button>

              {/* Not-initialized warning (zero liquidity) */}
              {ready &&
                !samePair &&
                poolUninitialized &&
                (protocolId === "ZAMMV0" ? (
                  <div className="mt-2 rounded-md border border-red-500 bg-red-50 px-3 py-2 text-red-700 text-sm">
                    This pool has zero reserves and <span className="font-medium">ZAMMV0</span> pools cannot be
                    initialised. Add liquidity to an existing V0 pool, or switch to{" "}
                    <span className="font-medium">ZAMMV1</span> to create a new pool.
                  </div>
                ) : (
                  <div className="mt-2 rounded-md border border-amber-500 bg-amber-50 px-3 py-2 text-amber-800 text-sm">
                    This pool is not initialised — no liquidity exists yet for{" "}
                    <span className="font-medium">
                      {tokenA?.symbol ?? "TokenA"}/{tokenB?.symbol ?? "TokenB"}
                    </span>{" "}
                    at <span className="font-medium">{isHook ? "Hook" : feeLabel}</span>. You’ll be the first to add
                    liquidity.
                  </div>
                ))}

              {/* Creation-blocked notice for ZAMMV0 */}
              {ready && !samePair && creationBlocked && (
                <div className="mt-2 rounded-md border border-red-500 bg-red-50 px-3 py-2 text-red-700 text-sm">
                  Creating new pools is not allowed for <span className="font-medium">ZAMMV0</span>. Add liquidity to an
                  existing V0 pool, or switch to <span className="font-medium">ZAMMV1</span> to create a new pool.
                </div>
              )}

              {ready && !samePair && !hasBothBalances && (
                <div className="mt-2 rounded-md border border-red-500 bg-red-50 px-3 py-2 text-red-700 text-sm">
                  You don’t have balance for{" "}
                  <span className="font-medium">
                    {[
                      !hasBalanceA ? tokenA?.symbol ?? "TokenA" : null,
                      !hasBalanceB ? tokenB?.symbol ?? "TokenB" : null,
                    ]
                      .filter(Boolean)
                      .join(" and ")}
                  </span>
                  , so you can’t provide liquidity for this pair. Please choose tokens you hold.
                </div>
              )}
            </>
          )}

          {/* ---------- STEP 2: deposit OR create-&-seed (direct execution) ---------- */}
          {currentStep === 2 && (
            <div className="space-y-4">
              {/* Hard guard: V0 with zero reserves cannot proceed */}
              {v0UninitBlocked && (
                <div className="rounded-lg border-2 p-4 bg-background space-y-3">
                  <div className="text-base">
                    <span className="font-semibold">Action unavailable.</span>{" "}
                    <span className="font-semibold">ZAMMV0</span> pools with zero reserves cannot be initialised.
                  </div>
                  <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                    <li>Add liquidity to an existing V0 pool (non-zero reserves).</li>
                    <li>
                      Or switch to <span className="font-medium">ZAMMV1</span> to create a new pool.
                    </li>
                  </ul>
                  <div className="flex gap-2 mt-2">
                    <Button variant="outline" className="flex-1" onClick={() => setCurrentStep(1)}>
                      Back
                    </Button>
                  </div>
                </div>
              )}

              {!v0UninitBlocked && (
                <>
                  {/* Branch: pool exists → add liquidity */}
                  {poolExists && (
                    <>
                      <PoolHeaderCard
                        tokenA={tokenA}
                        tokenB={tokenB}
                        protocolId={protocolId}
                        feeLabel={feeLabel}
                        marketPrice={marketPrice}
                      />

                      {/* Deposit card */}
                      <div>
                        <div className="mb-4">
                          <h3 className="text-lg font-semibold tracking-wide">Deposit tokens</h3>
                          <p className="text-xs text-muted-foreground">
                            {isHook
                              ? "You’re adding liquidity to a hook-enabled pool."
                              : "Specify the token amount of your liquidity contribution."}
                          </p>
                        </div>

                        <TokenAmountInput
                          amount={amountA}
                          onAmountChange={onChangeAmountA}
                          onTokenSelect={() => {}}
                          token={tokenA}
                          className="mb-1"
                          locked={true}
                        />

                        <TokenAmountInput
                          amount={amountB}
                          onAmountChange={onChangeAmountB}
                          onTokenSelect={() => {}}
                          token={tokenB}
                          locked={true}
                        />

                        <Button
                          variant="default"
                          className="w-full rounded-lg text-xl py-6 mt-4"
                          onClick={executeAddLiquidity}
                          disabled={
                            isSubmitting ||
                            !amountA ||
                            !amountB ||
                            Number.isNaN(parseFloat(amountA)) ||
                            Number.isNaN(parseFloat(amountB)) ||
                            parseFloat(amountA) <= 0 ||
                            parseFloat(amountB) <= 0
                          }
                        >
                          {isSubmitting ? "Submitting..." : "Confirm"}
                        </Button>
                      </div>
                    </>
                  )}

                  {/* Branch: pool DOES NOT exist & creation BLOCKED (ZAMMV0) */}
                  {creationBlocked && (
                    <div className="rounded-lg border-2 p-4 bg-background space-y-3">
                      <div className="text-base">
                        <span className="font-semibold">Pool unavailable.</span> Creating new pools is disabled for{" "}
                        <span className="font-semibold">ZAMMV0</span>.
                      </div>
                      <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                        <li>Try a different protocol (e.g., ZAMMV1).</li>
                        <li>
                          Or pick a {isHook ? "different hook or a" : ""} fee tier where a pool already exists (see
                          liquidity hints on the fee cards).
                        </li>
                      </ul>
                      <div className="flex gap-2 mt-2">
                        <Button variant="outline" className="flex-1" onClick={() => setCurrentStep(1)}>
                          Back
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Branch: pool DOES NOT exist & creation ALLOWED → Create & Seed */}
                  {creatingNewPool && (
                    <div className="">
                      <div className="rounded-lg border-2 p-4 bg-background mb-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="text-base font-medium">
                              {tokenA?.symbol ?? "TokenA"} / {tokenB?.symbol ?? "TokenB"}
                            </div>
                            <span className="text-xs border px-2 py-0.5 rounded-sm">v2</span>
                            <span className="text-xs border px-2 py-0.5 rounded-sm">{isHook ? "Hook" : feeLabel}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {protocols.find((p) => p.id === protocolId)?.label ?? protocolId}
                          </div>
                        </div>
                        <div className="mt-2 rounded-md border border-amber-500 bg-amber-50 px-3 py-2 text-amber-800 text-sm">
                          No pool exists at this {isHook ? "hook" : "fee"}. We’ll{" "}
                          <span className="font-medium">create a new pool and seed it</span> with your deposit.
                        </div>
                      </div>

                      <div className="mb-4">
                        <h3 className="text-lg font-semibold tracking-wide">Seed the new pool</h3>
                        <p className="text-xs text-muted-foreground">
                          Enter the initial token amounts. The deposit ratio sets the initial price.
                        </p>
                      </div>

                      <TokenAmountInput
                        amount={amountA}
                        onAmountChange={onChangeAmountA}
                        onTokenSelect={() => {}}
                        token={tokenA}
                        className="mb-1"
                        locked={true}
                      />

                      <TokenAmountInput
                        amount={amountB}
                        onAmountChange={onChangeAmountB}
                        onTokenSelect={() => {}}
                        token={tokenB}
                        locked={true}
                      />

                      <Button
                        variant="default"
                        className="w-full rounded-lg text-xl py-6 mt-4"
                        onClick={executeAddLiquidity}
                        disabled={
                          isSubmitting ||
                          !amountA ||
                          !amountB ||
                          Number.isNaN(parseFloat(amountA)) ||
                          Number.isNaN(parseFloat(amountB)) ||
                          parseFloat(amountA) <= 0 ||
                          parseFloat(amountB) <= 0
                        }
                      >
                        {isSubmitting ? "Submitting..." : "Create & Confirm"}
                      </Button>
                    </div>
                  )}
                </>
              )}

              {/* ---- Live TX progress (approvals + addLiquidity) ---- */}
              {(execError || txSteps.length > 0) && (
                <div className="rounded-md border mt-3 px-3 py-2">
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
                          {s.status === "idle" && <SettingsIcon className="w-4 h-4 text-muted-foreground" />}
                          <div className="text-sm">
                            <div className="font-medium">{s.label}</div>
                            {s.hash && (
                              <a
                                href={getEtherscanTxUrl(s.hash, 1)}
                                className="text-xs hover:underline text-muted-foreground break-all"
                              >
                                {s.hash}
                              </a>
                            )}
                            {s.error && <div className="text-xs text-red-600">{s.error}</div>}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground capitalize">{s.status}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
