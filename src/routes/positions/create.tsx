import { CreatePoolStep, Stepper } from "@/components/pools/CreatePoolStepper";
import { CreatePositionBreadcrumb } from "@/components/pools/CreatePositionBreadcrumb";
import FeeSelector from "@/components/pools/FeeSelector";
import {
  ProtocolId,
  protocols,
  ProtocolSelector,
} from "@/components/pools/ProtocolSelector";
import {
  TokenSelector,
  type TokenMetadata,
} from "@/components/pools/TokenSelector";
import { Button } from "@/components/ui/button";
import { useGetTokens } from "@/hooks/use-get-tokens";
import { DEFAULT_FEE_TIER, ETH_TOKEN, ZAMM_TOKEN } from "@/lib/pools";
import { cn } from "@/lib/utils";

import { createFileRoute } from "@tanstack/react-router";
import { RotateCcwIcon, SettingsIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { zeroAddress } from "viem";

export const Route = createFileRoute("/positions/create")({
  component: RouteComponent,
});

function RouteComponent() {
  const { data: tokens } = useGetTokens(); // expect TokenMetadata[]
  const [protocolId, setProtocolId] = useState<ProtocolId>(protocols[0].id);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [fee, setFee] = useState<bigint>(DEFAULT_FEE_TIER);

  // --- NEW: manage selected tokens for the pair
  const [tokenA, setTokenA] = useState<TokenMetadata>(ETH_TOKEN);
  const [tokenB, setTokenB] = useState<TokenMetadata>(ZAMM_TOKEN);

  // Helper to compare tokens by {address,id}
  const sameToken = useCallback(
    (x?: TokenMetadata | null, y?: TokenMetadata | null) =>
      !!x &&
      !!y &&
      x.id === y.id &&
      String(x.address).toLowerCase() === String(y.address).toLowerCase(),
    [],
  );

  const onSelectTokenA = useCallback(
    (next: TokenMetadata) => {
      setTokenA(next);
    },
    [tokens],
  );

  const onSelectTokenB = useCallback(
    (next: TokenMetadata) => {
      setTokenB(next);
    },
    [tokens],
  );

  // Easy guards for rendering
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
  };

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
              When this section is active, the step indicator highlights Step 2.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
