import * as React from "react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { FEE_OPTIONS } from "@/lib/pools";
import { Check, Minus, Plus } from "lucide-react";

export type ExtraFeeTier = {
  label?: string;
  value: bigint; // basis points
  description?: string;
};

export type FeeSelectorProps = {
  /** Selected fee in basis points (bps). */
  fee: bigint;
  /** Called when the selected fee changes. */
  onChange: (bps: bigint) => void;
  /** Optionally show extra tiers provided by the parent. */
  fees?: ExtraFeeTier[];
  /** Optional protocol label for the liquidity line, e.g. "Arbitrum". */
  protocol?: string;
  /**
   * Optional liquidity per fee (keyed by bps as string).
   * - If number: treated as an amount (e.g. TVL) and compact-formatted.
   * - If string: rendered verbatim (e.g. "12.3 WETH / 24.6 USDC").
   */
  liquidityByFee?: Record<string, number | string>;
  className?: string;
};

const BPS_MIN = 0n;
const BPS_MAX = 10000n; // 100.00%
const BPS_STEP = 5n; // 0.05%

function bpsToPercentString(bps: bigint) {
  return `${(Number(bps) / 100).toFixed(2)}%`;
}

function clampBps(v: bigint) {
  if (v < BPS_MIN) return BPS_MIN;
  if (v > BPS_MAX) return BPS_MAX;
  return v;
}

function isPreset(bps: bigint, presets: { value: bigint }[]) {
  return presets.some((o) => o.value === bps);
}

function formatCompact(n: number) {
  try {
    return new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    return String(n);
  }
}

function PresetCard({
  label,
  description,
  liquidityText,
  selected,
  onClick,
}: {
  label: string;
  description?: string;
  liquidityText?: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border-2 border-border p-4 text-left",
        "shadow-[2px_2px_0_var(--color-border)]",
        "hover:bg-accent hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_var(--color-border)]",
        "active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0_var(--color-border)]",
        selected &&
          "bg-accent/60 outline-none ring-2 ring-ring ring-offset-2 ring-offset-background",
      )}
      aria-pressed={selected}
    >
      <div className="flex items-center justify-between">
        <div className="text-lg font-medium leading-none">{label}</div>
        {selected && <Check className="size-4" />}
      </div>
      {description ? (
        <p className="mt-2 text-xs text-muted-foreground">{description}</p>
      ) : null}
      {liquidityText ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {liquidityText}
        </p>
      ) : null}
    </button>
  );
}

export function FeeSelector({
  fee,
  onChange,
  className,
  fees: extraFees,
  protocol,
  liquidityByFee,
}: FeeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [draft, setDraft] = useState<bigint>(fee ?? 0n);

  // Build the tiers list from defaults + optional extras (dedup by value)
  const presets = useMemo(() => {
    const base = [...FEE_OPTIONS.map((o) => ({ ...o })), ...(extraFees ?? [])];
    const seen = new Set<string>();
    const unique = base.filter((o) => {
      const k = String(o.value);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    // Ensure label fallback
    unique.forEach((o) => {
      // @ts-ignore allow mutation for label default
      if (!o.label) o.label = bpsToPercentString(o.value);
    });
    return unique;
  }, [extraFees]);

  const selectedLabel = useMemo(() => bpsToPercentString(fee ?? 0n), [fee]);

  const handleCreate = () => {
    onChange(clampBps(draft));
    setOpen(false);
  };

  const customSelected =
    fee !== undefined && fee !== 0n && !isPreset(fee, presets);

  // Liquidity line helper (accepts number or string)
  const liquidityTextFor = (bps: bigint) => {
    const key = String(bps);
    const liq = liquidityByFee?.[key];

    if (liq === undefined) return undefined;

    // String provided by parent (e.g., "1.2 WETH / 2.4 USDC")
    if (typeof liq === "string" && liq.trim().length > 0) {
      return liq;
    }

    // Numeric amount provided by parent (e.g., TVL or units)
    if (typeof liq === "number") {
      if (!Number.isFinite(liq)) return undefined;
      if (liq <= 0) return "No liquidity";
      const base = `${formatCompact(liq)} liquidity`;
      return protocol ? `${base} on ${protocol}` : base;
    }

    return undefined;
  };

  return (
    <div className={cn("mt-4 space-y-3", className)}>
      {/* Summary header */}
      <div className="flex items-center justify-between rounded-md border bg-muted/20 p-3">
        <div>
          <div className="text-sm font-medium">{selectedLabel} fee tier</div>
          <div className="text-xs text-muted-foreground">
            The % you will earn in fees
          </div>
        </div>
        <Button
          variant="link"
          className="h-auto px-0 text-sm"
          onClick={() => setShowMore((s) => !s)}
        >
          {showMore ? "Less" : "More"}
        </Button>
      </div>

      {/* Expanded: full grid of presets and (if selected) a custom tile */}
      {showMore && (
        <>
          <div
            role="radiogroup"
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            {presets.map((opt) => (
              <PresetCard
                key={opt.value.toString()}
                label={opt.label!}
                description={opt.description}
                selected={fee === opt.value}
                liquidityText={liquidityTextFor(opt.value)}
                onClick={() => onChange(opt.value)}
              />
            ))}

            {customSelected && (
              <PresetCard
                label={`Custom: ${bpsToPercentString(fee)}`}
                description="Click to edit"
                selected
                liquidityText={liquidityTextFor(fee)}
                onClick={() => setOpen(true)}
              />
            )}
          </div>

          {/* Advanced link */}
          <div className="pt-1">
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              onClick={() => {
                setDraft(clampBps(fee));
                setOpen(true);
              }}
            >
              Create other tiers (Advanced)
            </button>
          </div>
        </>
      )}

      {/* Custom tier dialog with direct editing */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Create fee tier</DialogTitle>
            <DialogDescription>
              Creating a new tier will initialize a new pool.
            </DialogDescription>
          </DialogHeader>

          {/* Stepper */}
          <div className="mt-4 flex items-center justify-center gap-6">
            <Button
              type="button"
              variant="secondary"
              className="h-12 w-12 rounded-full border-2 border-border"
              onClick={() => setDraft((d) => clampBps(d - BPS_STEP))}
            >
              <Minus className="size-5" />
            </Button>

            <InlinePercentEditor
              valueBps={draft}
              onChangeBps={(v) => setDraft(clampBps(v))}
              className="min-w-[180px]"
            />

            <Button
              type="button"
              variant="secondary"
              className="h-12 w-12 rounded-full border-2 border-border"
              onClick={() => setDraft((d) => clampBps(d + BPS_STEP))}
            >
              <Plus className="size-5" />
            </Button>
          </div>

          <div className="text-center text-xs text-muted-foreground">
            Range: 0.00% – 100.00% • Step {bpsToPercentString(BPS_STEP)}
          </div>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              className="w-full rounded-lg text-base py-5"
              onClick={handleCreate}
              disabled={draft < BPS_MIN || draft > BPS_MAX}
            >
              Create new fee tier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InlinePercentEditor({
  valueBps,
  onChangeBps,
  className,
}: {
  valueBps: bigint;
  onChangeBps: (bps: bigint) => void;
  className?: string;
}) {
  const [text, setText] = React.useState<string>(
    (Number(valueBps) / 100).toFixed(2),
  );
  const [focused, setFocused] = React.useState(false);

  // Keep field in sync if external buttons change it
  React.useEffect(() => {
    if (!focused) setText((Number(valueBps) / 100).toFixed(2));
  }, [valueBps, focused]);

  const clampPercentToBps = (pctStr: string) => {
    const n = Number(pctStr);
    if (!Number.isFinite(n)) return valueBps;
    const bps = BigInt(Math.round(n * 100));
    return clampBps(bps);
  };

  const commit = () => {
    // Accept "12", "12.3", "12.34", "12.34%" etc.
    const cleaned = text.replace(/[^\d.]/g, "");
    const bps = clampPercentToBps(cleaned);
    onChangeBps(bps);
    setText((Number(bps) / 100).toFixed(2)); // normalize to 2dp
  };

  const step = (mult = 1) => {
    const next = clampBps(valueBps + BPS_STEP * BigInt(mult));
    onChangeBps(next);
    setText((Number(next) / 100).toFixed(2));
  };

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center",
        className,
      )}
    >
      <input
        aria-label="Fee percentage"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          // Keep only digits and a single dot while typing; strip stray %
          const cleaned = e.target.value
            .replace(/%/g, "")
            .replace(/[^\d.]/g, "")
            .replace(/^(\d*\.\d*).*$/, "$1");
          setText(cleaned);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.currentTarget as HTMLInputElement).blur();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            step(e.shiftKey ? 5 : 1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            step(e.shiftKey ? -5 : -1);
          } else if (e.key === "Escape") {
            setText((Number(valueBps) / 100).toFixed(2));
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        className={cn(
          "w-[220px] bg-transparent text-center outline-none border-none",
          "text-5xl font-semibold tabular-nums",
          "pr-10", // make room for the % sign
          "focus-visible:ring-0 focus-visible:outline-none",
        )}
      />

      {/* Non-interactive suffix inside the input box */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none select-none",
          "absolute inset-y-0 right-0 flex items-center pr-2",
          "text-5xl font-semibold tabular-nums",
        )}
      >
        %
      </span>
    </div>
  );
}

export default FeeSelector;
