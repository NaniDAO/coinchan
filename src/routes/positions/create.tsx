import { CreatePoolStep, Stepper } from "@/components/pools/CreatePoolStepper";
import { CreatePositionBreadcrumb } from "@/components/pools/CreatePositionBreadcrumb";
import FeeSelector from "@/components/pools/FeeSelector";
import {
  ProtocolId,
  protocols,
  ProtocolSelector,
} from "@/components/pools/ProtocolSelector";
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
import { useCallback, useMemo, useState } from "react";

export const Route = createFileRoute("/positions/create")({
  component: RouteComponent,
});

function RouteComponent() {
  const { data: tokens } = useGetTokens();
  const [protocolId, setProtocolId] = useState<ProtocolId>(protocols[0].id);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [fee, setFee] = useState<bigint>(DEFAULT_FEE_TIER);

  // Selected tokens
  const [tokenA, setTokenA] = useState<TokenMetadata>(ETH_TOKEN);
  const [tokenB, setTokenB] = useState<TokenMetadata>(ZAMM_TOKEN);

  // --- NEW: local deposit amounts (text to keep user’s formatting)
  const [amountA, setAmountA] = useState<string>("");
  const [amountB, setAmountB] = useState<string>("");

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
    source: protocolId === "ZAMMV1" ? "ZAMM" : "COOKBOOK",
  });

  // Helper to compare tokens by {address,id}
  const sameToken = useCallback(
    (x?: TokenMetadata | null, y?: TokenMetadata | null) =>
      !!x &&
      !!y &&
      x.id === y.id &&
      String(x.address).toLowerCase() === String(y.address).toLowerCase(),
    [],
  );

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
  const samePair = sameToken(tokenA, tokenB);

  const steps: CreatePoolStep[] = [
    { title: "Select token pair and fees" },
    { title: "Enter deposit amounts" },
  ];

  const resetAll = () => {
    setProtocolId(protocols[0].id);
    setCurrentStep(1);
    setTokenA(ETH_TOKEN);
    setTokenB(ZAMM_TOKEN);
    setAmountA(0);
    setAmountB(0);
  };

  // --- NEW: detect if pool exists using reserves shape loosely
  const poolExists = useMemo(() => {
    const r: any = selectedReserves;
    if (!r) return false;
    // tolerate different shapes from the hook
    const ra = r.reserveA ?? r.reserve0 ?? r[0];
    const rb = r.reserveB ?? r.reserve1 ?? r[1];
    const liq = r.liquidity ?? r.totalLiquidity;
    if (typeof liq === "bigint") return liq > 0n;
    if (typeof liq === "number") return liq > 0;
    return ra != null && rb != null;
  }, [selectedReserves]);

  // --- NEW: price (tokenB per 1 tokenA), with safe fallbacks
  const marketPrice = useMemo(() => {
    try {
      const r: any = selectedReserves;
      if (!r) return undefined;
      const ra = Number(r.reserveA ?? r.reserve0 ?? r[0]);
      const rb = Number(r.reserveB ?? r.reserve1 ?? r[1]);
      const da = tokenA?.decimals ?? 18;
      const db = tokenB?.decimals ?? 18;
      if (!isFinite(ra) || !isFinite(rb) || ra <= 0) return undefined;
      const a = ra / 10 ** da;
      const b = rb / 10 ** db;
      if (a <= 0) return undefined;
      return b / a; // tokenB per 1 tokenA
    } catch {
      return undefined;
    }
  }, [selectedReserves, tokenA?.decimals, tokenB?.decimals]);

  // --- NEW: keep amounts in pool ratio if user edits either side
  const onChangeAmountA = (v: string) => {
    setAmountA(v);
    const x = parseFloat(v);
    if (marketPrice && isFinite(x)) {
      const y = x * marketPrice;
      setAmountB(Number.isFinite(y) ? String(y) : "");
    }
  };
  const onChangeAmountB = (v: string) => {
    setAmountB(v);
    const y = parseFloat(v);
    if (marketPrice && marketPrice !== 0 && isFinite(y)) {
      const x = y / marketPrice;
      setAmountA(Number.isFinite(x) ? String(x) : "");
    }
  };

  // --- NEW: fee percent label (assumes Uniswap-style 1e4 = 1%)
  const feeLabel = useMemo(() => {
    try {
      return `${(Number(fee) / 1e4).toFixed(2)}%`;
    } catch {
      return "—";
    }
  }, [fee]);

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

          <button
            className={cn(
              "h-9 w-9 inline-flex items-center justify-center gap-2 whitespace-nowrap px-3 text-sm",
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
          >
            <SettingsIcon size={16} />
            <span className="sr-only">Settings</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 pr-8 mt-4">
        {/* LEFT: steps */}
        <div className="col-span-2">
          <Stepper
            steps={steps}
            currentStep={currentStep}
            onStepChange={setCurrentStep}
          />
        </div>

        {/* RIGHT: content */}
        <div className="col-span-3 border-border border-2 p-4 rounded-lg">
          {/* ---------- STEP 1: pair + fee ---------- */}
          {!(currentStep === 2 && poolExists) && (
            <>
              <div
                onFocus={() => setCurrentStep(1)}
                onMouseEnter={() => setCurrentStep(1)}
              >
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

              <div
                className="mt-6"
                onFocus={() => setCurrentStep(1)}
                onMouseEnter={() => setCurrentStep(1)}
              >
                <h3 className="text-lg font-semibold">Fee tier</h3>
                <p className="text-base text-muted-foreground">
                  This is the amount of fees charged for a trade against this
                  position.
                </p>
                <FeeSelector fee={fee} onChange={setFee} />
                <Button
                  variant="default"
                  className="w-full rounded-lg text-xl py-6 mt-4"
                  disabled={!ready || samePair}
                  // --- NEW: advance to Step 2
                  onClick={() => setCurrentStep(2)}
                >
                  Continue
                </Button>
              </div>

              <div
                className="mt-10 pt-6 border-t"
                onFocus={() => setCurrentStep(2)}
                onMouseEnter={() => setCurrentStep(2)}
              >
                <h3 className="text-lg font-semibold">Deposit amounts</h3>
                <p className="text-base text-muted-foreground">
                  When this section is active, the step indicator highlights
                  Step 2.
                </p>
              </div>
            </>
          )}

          {/* ---------- STEP 2 + POOL EXISTS: summary + deposit card ---------- */}
          {currentStep === 2 && poolExists && (
            <div className="space-y-4">
              {/* Pool summary header */}
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
                    {protocols.find((p) => p.id === protocolId)?.name ??
                      protocolId}
                  </div>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Market price:&nbsp;
                  {marketPrice
                    ? `${marketPrice.toPrecision(6)} ${
                        tokenB?.symbol ?? "TokenB"
                      } = 1 ${tokenA?.symbol ?? "TokenA"}`
                    : "—"}
                </div>
              </div>

              {/* Deposit card */}
              <div className="">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold tracking-wide">
                    Deposit tokens
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Specify the token amount of your liquidity contribution.
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
                  onClick={() => {
                    // TODO: navigate to review or trigger mutation
                    // router.navigate({ to: "/positions/create/review", /* state */ })
                    console.debug("Review deposit", {
                      tokenA,
                      tokenB,
                      amountA,
                      amountB,
                      fee,
                      protocolId,
                      selectedPoolId,
                    });
                  }}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
