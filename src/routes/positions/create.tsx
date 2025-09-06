import { CreatePoolStep, Stepper } from "@/components/pools/CreatePoolStepper";
import { CreatePositionBreadcrumb } from "@/components/pools/CreatePositionBreadcrumb";
import FeeSelector from "@/components/pools/FeeSelector";
import { PoolHeaderCard } from "@/components/pools/PoolHeaderCard";
import { ProtocolId, protocols } from "@/lib/protocol";
import { ProtocolSelector } from "@/components/pools/ProtocolSelector";
import {
  SettingsDropdown,
  TradeSettings,
} from "@/components/pools/SettingsDropdown";
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
} from "@/lib/pools";
import { cn } from "@/lib/utils";

import { createFileRoute } from "@tanstack/react-router";
import { RotateCcwIcon, SettingsIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";

export const Route = createFileRoute("/positions/create")({
  component: RouteComponent,
});

// Protocols where creating *new* pools is disallowed
const CREATION_BLOCKED_PROTOCOLS = new Set<ProtocolId>(["ZAMMV0"]);

function RouteComponent() {
  const { address: owner } = useAccount();
  const { data: tokens } = useGetTokens(owner);
  const [protocolId, setProtocolId] = useState<ProtocolId>(protocols[0].id);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [fee, setFee] = useState<bigint>(DEFAULT_FEE_TIER);

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

  const reservesSource = protocolId === "ZAMMV0" ? "ZAMM" : "COOKBOOK";

  const creationAllowed = useMemo(
    () => !CREATION_BLOCKED_PROTOCOLS.has(protocolId),
    [protocolId],
  );

  const selectedPoolId = useMemo(() => {
    if (!tokenA || !tokenB || !fee) return undefined;
    return computePoolId(
      { address: tokenA.address, id: tokenA.id },
      { address: tokenB.address, id: tokenB.id },
      fee,
      protocolId,
    );
  }, [tokenA, tokenB, fee, protocolId]);

  const { data: selectedReserves } = useReserves({
    poolId: selectedPoolId,
    source: reservesSource,
  });

  // ---- Fee-tier liquidity: compute poolIds and fetch reserves for each known tier ----
  const poolId100 = useMemo(() => {
    if (!tokenA || !tokenB) return undefined;
    return computePoolId(
      { address: tokenA.address, id: tokenA.id },
      { address: tokenB.address, id: tokenB.id },
      100n,
      protocolId,
    );
  }, [tokenA, tokenB, protocolId]);

  const poolId500 = useMemo(() => {
    if (!tokenA || !tokenB) return undefined;
    return computePoolId(
      { address: tokenA.address, id: tokenA.id },
      { address: tokenB.address, id: tokenB.id },
      500n,
      protocolId,
    );
  }, [tokenA, tokenB, protocolId]);

  const poolId3000 = useMemo(() => {
    if (!tokenA || !tokenB) return undefined;
    return computePoolId(
      { address: tokenA.address, id: tokenA.id },
      { address: tokenB.address, id: tokenB.id },
      3000n,
      protocolId,
    );
  }, [tokenA, tokenB, protocolId]);

  const poolId10000 = useMemo(() => {
    if (!tokenA || !tokenB) return undefined;
    return computePoolId(
      { address: tokenA.address, id: tokenA.id },
      { address: tokenB.address, id: tokenB.id },
      10000n,
      protocolId,
    );
  }, [tokenA, tokenB, protocolId]);

  const { data: reserves100 } = useReserves({
    poolId: poolId100,
    source: reservesSource,
  });
  const { data: reserves500 } = useReserves({
    poolId: poolId500,
    source: reservesSource,
  });
  const { data: reserves3000 } = useReserves({
    poolId: poolId3000,
    source: reservesSource,
  });
  const { data: reserves10000 } = useReserves({
    poolId: poolId10000,
    source: reservesSource,
  });

  // Helper: compare tokens by {address,id}
  const sameToken = useCallback(
    (x?: TokenMetadata | null, y?: TokenMetadata | null) =>
      !!x &&
      !!y &&
      x.id === y.id &&
      String(x.address).toLowerCase() === String(y.address).toLowerCase(),
    [],
  );

  // When wallet tokens arrive/update, hydrate the currently selected tokens with balances
  useEffect(() => {
    if (!tokens?.length) return;

    const BALANCE_KEYS = ["balance", "rawBalance", "formattedBalance"] as const;

    const mergeBalances = <T extends Record<string, any>>(
      prev: T,
      match: any,
    ): T => {
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
  }, [tokens, sameToken, setTokenA, setTokenB]);

  const onSelectTokenA = useCallback((next: TokenMetadata) => {
    setTokenA(next);
  }, []);

  const onSelectTokenB = useCallback((next: TokenMetadata) => {
    setTokenB(next);
  }, []);

  const ready = useMemo(
    () => Boolean(tokens?.length && tokenA && tokenB),
    [tokens, tokenA, tokenB],
  );

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
    const isZero = (v: any) =>
      typeof v === "bigint" ? v === 0n : Number(v) === 0;

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

  // fee percent label (assumes Uniswap-style 1e4 = 1%)
  const feeLabel = useMemo(() => {
    try {
      return `${(Number(fee) / 1e4).toFixed(2)}%`;
    } catch {
      return "—";
    }
  }, [fee]);

  // ----- Formatting helpers for liquidity labels on fee cards -----
  const fmtNumber = (n: number) =>
    Number.isFinite(n)
      ? n >= 1e6
        ? n.toExponential(2)
        : n.toLocaleString(undefined, { maximumFractionDigits: 4 })
      : "—";

  const toNum = (v: any) => {
    if (typeof v === "bigint") {
      // best-effort; may overflow for extremely large values but fine for UI hinting
      return Number(v);
    }
    return Number(v);
  };

  const makeLiquidityLabel = (r: any | undefined) => {
    if (!r) return "—";
    const liq = r.liquidity ?? r.totalLiquidity;
    if (typeof liq === "bigint" || typeof liq === "number") {
      const n = toNum(liq);
      return n > 0 ? `Liquidity: ${fmtNumber(n)}` : "No liquidity";
    }
    const ra = r.reserveA ?? r.reserve0 ?? r[0];
    const rb = r.reserveB ?? r.reserve1 ?? r[1];
    if (ra != null && rb != null) {
      const a = Number(formatUnits(ra, tokenA?.decimals ?? 18)).toFixed(2);
      const b = Number(formatUnits(rb, tokenB?.decimals ?? 18)).toFixed(2);
      return `${a} ${tokenA?.symbol ?? "A"} / ${b} ${tokenB?.symbol ?? "B"}`;
    }
    return "—";
  };

  const liquidityByFee = useMemo(
    () => ({
      "100": makeLiquidityLabel(reserves100),
      "500": makeLiquidityLabel(reserves500),
      "3000": makeLiquidityLabel(reserves3000),
      "10000": makeLiquidityLabel(reserves10000),
    }),
    [
      reserves100,
      reserves500,
      reserves3000,
      reserves10000,
      tokenA?.decimals,
      tokenB?.decimals,
      tokenA?.symbol,
      tokenB?.symbol,
    ],
  );

  // Dynamic steps: show "Create new pool & seed" when relevant
  const steps: CreatePoolStep[] = useMemo(() => {
    const creatingNewPool = !poolExists && creationAllowed;
    return [
      { title: "Select token pair and fees" },
      {
        title: creatingNewPool
          ? "Create new pool & seed"
          : "Enter deposit amounts",
      },
      { title: "Review & confirm" },
    ];
  }, [poolExists, creationAllowed]);

  const resetAll = () => {
    setProtocolId(protocols[0].id);
    setCurrentStep(1);
    setTokenA(ETH_TOKEN);
    setTokenB(ZAMM_TOKEN);
    setAmountA("");
    setAmountB("");
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

          <ProtocolSelector
            className="h-8 font-light"
            protocolId={protocolId}
            setProtocolId={setProtocolId}
          />

          <SettingsDropdown value={settings} onChange={setSettings} />
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 pr-8 mt-4">
        {/* LEFT: steps */}
        <div className="col-span-2">
          <Stepper
            steps={steps}
            currentStep={currentStep}
            onStepChange={handleStepChange}
          />
        </div>

        {/* RIGHT: content */}
        <div className="col-span-3 border-border border-2 p-4 rounded-lg">
          {/* ---------- STEP 1: pair + fee ---------- */}
          {currentStep === 1 && (
            <>
              <div>
                <h3 className="text-lg font-semibold">Select pair</h3>
                <p className="text-base text-muted-foreground">
                  Choose a pair of tokens to create a new position.
                </p>
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
                {samePair && (
                  <p className="mt-2 text-xs text-red-500">
                    Please select two different tokens.
                  </p>
                )}
              </div>

              <div className="mt-6">
                <h3 className="text-lg font-semibold">Fee tier</h3>
                <p className="text-base text-muted-foreground">
                  This is the amount of fees charged for a trade against this
                  position.
                </p>

                {/* FeeSelector now receives liquidity labels per fee tier */}
                <FeeSelector
                  fee={fee}
                  onChange={setFee}
                  liquidityByFee={liquidityByFee}
                />

                <Button
                  variant="default"
                  className="w-full rounded-lg text-xl py-6 mt-4"
                  disabled={
                    !ready ||
                    samePair ||
                    (!poolExists && !creationAllowed) ||
                    v0UninitBlocked ||
                    !hasBothBalances
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
                      This pool has zero reserves and{" "}
                      <span className="font-medium">ZAMMV0</span> pools cannot
                      be initialised. Add liquidity to an existing V0 pool, or
                      switch to <span className="font-medium">ZAMMV1</span> to
                      create a new pool.
                    </div>
                  ) : (
                    <div className="mt-2 rounded-md border border-amber-500 bg-amber-50 px-3 py-2 text-amber-800 text-sm">
                      This pool is not initialised — no liquidity exists yet for{" "}
                      <span className="font-medium">
                        {tokenA?.symbol ?? "TokenA"}/
                        {tokenB?.symbol ?? "TokenB"}
                      </span>{" "}
                      at <span className="font-medium">{feeLabel}</span>. You’ll
                      be the first to add liquidity.
                    </div>
                  ))}

                {/* Creation-blocked notice for ZAMMV0 */}
                {ready && !samePair && creationBlocked && (
                  <div className="mt-2 rounded-md border border-red-500 bg-red-50 px-3 py-2 text-red-700 text-sm">
                    Creating new pools is not allowed for{" "}
                    <span className="font-medium">ZAMMV0</span>. Add liquidity
                    to an existing V0 pool, or switch to{" "}
                    <span className="font-medium">ZAMMV1</span> to create a new
                    pool.
                  </div>
                )}

                {ready && !samePair && !hasBothBalances && (
                  <div className="mt-2 rounded-md border border-red-500 bg-red-50 px-3 py-2 text-red-700 text-sm">
                    You don’t have balance for{" "}
                    <span className="font-medium">
                      {[
                        !hasBalanceA ? (tokenA?.symbol ?? "TokenA") : null,
                        !hasBalanceB ? (tokenB?.symbol ?? "TokenB") : null,
                      ]
                        .filter(Boolean)
                        .join(" and ")}
                    </span>
                    , so you can’t provide liquidity for this pair. Please
                    choose tokens you hold.
                  </div>
                )}
              </div>
            </>
          )}

          {/* ---------- STEP 2: deposit OR create-&-seed ---------- */}
          {currentStep === 2 && (
            <div className="space-y-4">
              {/* Hard guard: V0 with zero reserves cannot proceed */}
              {v0UninitBlocked && (
                <div className="rounded-lg border-2 p-4 bg-background space-y-3">
                  <div className="text-base">
                    <span className="font-semibold">Action unavailable.</span>{" "}
                    <span className="font-semibold">ZAMMV0</span> pools with
                    zero reserves cannot be initialised.
                  </div>
                  <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                    <li>
                      Add liquidity to an existing V0 pool (non-zero reserves).
                    </li>
                    <li>
                      Or switch to <span className="font-medium">ZAMMV1</span>{" "}
                      to create a new pool.
                    </li>
                  </ul>
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setCurrentStep(1)}
                    >
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
                          <h3 className="text-lg font-semibold tracking-wide">
                            Deposit tokens
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            Specify the token amount of your liquidity
                            contribution.
                          </p>
                        </div>

                        <TokenAmountInput
                          amount={amountA}
                          onAmountChange={onChangeAmountA}
                          token={tokenA}
                          className="mb-1"
                        />

                        <TokenAmountInput
                          amount={amountB}
                          onAmountChange={onChangeAmountB}
                          token={tokenB}
                        />

                        <Button
                          variant="default"
                          className="w-full rounded-lg text-xl py-6 mt-4"
                          onClick={() => setCurrentStep(3)}
                          disabled={
                            !amountA ||
                            !amountB ||
                            Number.isNaN(parseFloat(amountA)) ||
                            Number.isNaN(parseFloat(amountB)) ||
                            parseFloat(amountA) <= 0 ||
                            parseFloat(amountB) <= 0
                          }
                        >
                          Review
                        </Button>
                      </div>
                    </>
                  )}

                  {/* Branch: pool DOES NOT exist & creation BLOCKED (ZAMMV0) */}
                  {creationBlocked && (
                    <div className="rounded-lg border-2 p-4 bg-background space-y-3">
                      <div className="text-base">
                        <span className="font-semibold">Pool unavailable.</span>{" "}
                        Creating new pools is disabled for{" "}
                        <span className="font-semibold">ZAMMV0</span>.
                      </div>
                      <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                        <li>Try a different protocol (e.g., ZAMMV1).</li>
                        <li>
                          Or pick a fee tier where a pool already exists (see
                          liquidity hints on the fee cards).
                        </li>
                      </ul>
                      <div className="flex gap-2 mt-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => setCurrentStep(1)}
                        >
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
                              {tokenA?.symbol ?? "TokenA"} /{" "}
                              {tokenB?.symbol ?? "TokenB"}
                            </div>
                            <span className="text-xs border px-2 py-0.5 rounded-sm">
                              v2
                            </span>
                            <span className="text-xs border px-2 py-0.5 rounded-sm">
                              {feeLabel}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {protocols.find((p) => p.id === protocolId)
                              ?.label ?? protocolId}
                          </div>
                        </div>
                        <div className="mt-2 rounded-md border border-amber-500 bg-amber-50 px-3 py-2 text-amber-800 text-sm">
                          No pool exists at this fee tier. We’ll{" "}
                          <span className="font-medium">
                            create a new pool and seed it
                          </span>{" "}
                          with your deposit.
                        </div>
                      </div>

                      <div className="mb-4">
                        <h3 className="text-lg font-semibold tracking-wide">
                          Seed the new pool
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Enter the initial token amounts. The deposit ratio
                          sets the initial price.
                        </p>
                      </div>

                      <TokenAmountInput
                        amount={amountA}
                        onAmountChange={onChangeAmountA}
                        token={tokenA}
                        className="mb-1"
                      />

                      <TokenAmountInput
                        amount={amountB}
                        onAmountChange={onChangeAmountB}
                        token={tokenB}
                      />

                      <Button
                        variant="default"
                        className="w-full rounded-lg text-xl py-6 mt-4"
                        onClick={() => setCurrentStep(3)}
                        disabled={
                          !amountA ||
                          !amountB ||
                          Number.isNaN(parseFloat(amountA)) ||
                          Number.isNaN(parseFloat(amountB)) ||
                          parseFloat(amountA) <= 0 ||
                          parseFloat(amountB) <= 0
                        }
                      >
                        Review
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ---------- STEP 3: explicit review ---------- */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="rounded-lg border-2 p-4 bg-background">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="text-base font-medium">
                      {tokenA?.symbol ?? "TokenA"} /{" "}
                      {tokenB?.symbol ?? "TokenB"}
                    </div>
                    <span className="text-xs border px-2 py-0.5 rounded-sm">
                      v2
                    </span>
                    <span className="text-xs border px-2 py-0.5 rounded-sm">
                      {feeLabel}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {protocols.find((p) => p.id === protocolId)?.label ??
                      protocolId}
                  </div>
                </div>
                <div className="mt-2 text-sm">
                  <div>
                    Amount {tokenA?.symbol}:{" "}
                    <span className="font-medium">{amountA || "—"}</span>
                  </div>
                  <div>
                    Amount {tokenB?.symbol}:{" "}
                    <span className="font-medium">{amountB || "—"}</span>
                  </div>
                  <div className="text-muted-foreground mt-1">
                    {poolExists
                      ? "Action: Add liquidity to existing pool."
                      : creationAllowed
                        ? "Action: Create new pool and seed with your deposit."
                        : "Action unavailable: creation is blocked for this protocol."}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setCurrentStep(2)}
                >
                  Back
                </Button>
                <Button
                  variant="default"
                  className="flex-1"
                  disabled={creationBlocked}
                  onClick={() => {
                    // TODO: wire up actual transaction submission.
                    // - If poolExists: add liquidity
                    // - Else if creationAllowed: create pool + add liquidity
                    // - Else (creationBlocked): should never fire due to disabled button
                    console.debug(
                      poolExists
                        ? "Confirm: Add liquidity"
                        : creationAllowed
                          ? "Confirm: Create pool + seed"
                          : "Blocked: Creation disabled for protocol",
                      {
                        tokenA,
                        tokenB,
                        amountA,
                        amountB,
                        fee,
                        protocolId,
                        selectedPoolId,
                      },
                    );
                  }}
                >
                  {poolExists
                    ? "Confirm"
                    : creationAllowed
                      ? "Create & Confirm"
                      : "Unavailable"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
