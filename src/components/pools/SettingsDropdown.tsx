import * as React from "react";
import { SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

export type TradeSettings = {
  autoSlippage: boolean; // if true, ignore slippagePct and show “Auto”
  slippagePct: number; // e.g. 2.5 means 2.5%
  deadlineMin: number; // transaction deadline in minutes
};

const DEFAULTS: TradeSettings = {
  autoSlippage: true,
  slippagePct: 2.5,
  deadlineMin: 30,
};

type Props = {
  value?: TradeSettings;
  onChange?: (next: TradeSettings) => void;
  className?: string;
  buttonClassName?: string;
};

export function SettingsDropdown({
  value,
  onChange,
  className,
  buttonClassName,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [local, setLocal] = React.useState<TradeSettings>(value ?? DEFAULTS);

  // keep local UI in sync if parent updates
  React.useEffect(() => {
    if (value) setLocal(value);
  }, [value]);

  const commit = (next: Partial<TradeSettings>) => {
    const merged = { ...local, ...next };
    setLocal(merged);
    onChange?.(merged);
  };

  const reset = () => {
    setLocal(DEFAULTS);
    onChange?.(DEFAULTS);
  };

  const clamp = (n: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            // keep your bento/retro button styling
            "h-9 w-9 inline-flex items-center justify-center gap-2 whitespace-nowrap px-3 text-sm",
            "data-[size=default]:h-9 data-[size=sm]:h-8 rounded-sm",
            "border-2 border-border bg-input text-foreground",
            "shadow-[2px_2px_0_var(--color-border)]",
            "hover:bg-accent hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_var(--color-border)]",
            "active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0_var(--color-border)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "transition-[transform,box-shadow,color]",
            buttonClassName,
          )}
          aria-label="Settings"
        >
          <SettingsIcon size={16} />
          <span className="sr-only">Settings</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="end"
        className={cn(
          "w-[360px] p-0 rounded-md",
          "border-2 border-border bg-background",
          "shadow-[6px_6px_0_var(--color-border)]",
          className,
        )}
      >
        <div className="p-4">
          {/* Max slippage */}
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Max slippage</Label>
            <div className="text-xs text-muted-foreground">
              {local.autoSlippage ? "Auto" : `${local.slippagePct}%`}
            </div>
          </div>

          <div className="mt-2 flex bg-accent p-1 rounded-2xl items-center w-fit gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="auto-slippage"
                checked={local.autoSlippage}
                onCheckedChange={(v) => commit({ autoSlippage: v })}
              />
              <Label htmlFor="auto-slippage" className="text-sm">
                Auto
              </Label>
            </div>

            <div className="relative w-[140px]">
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                placeholder="2.50"
                disabled={local.autoSlippage}
                value={local.slippagePct}
                onChange={(e) =>
                  commit({
                    slippagePct: clamp(parseFloat(e.target.value), 0, 50),
                  })
                }
                className={cn(
                  "pr-8 text-right rounded-3xl border-accent",
                  local.autoSlippage && "opacity-60",
                )}
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                %
              </span>
            </div>
          </div>

          {/* Tx Deadline */}
          <div className="mt-5 flex items-center justify-between">
            <Label className="text-sm font-medium">Tx. deadline</Label>
            <div className="text-xs text-muted-foreground">
              {local.deadlineMin} minutes
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <div className="relative w-[140px]">
              <Input
                type="number"
                inputMode="numeric"
                step={1}
                min={1}
                value={local.deadlineMin}
                max={60}
                onChange={(e) =>
                  commit({
                    deadlineMin: clamp(parseInt(e.target.value, 10), 1, 10_000),
                  })
                }
                className="rounded-3xl border-accent text-right pr-14"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                minutes
              </span>
            </div>
          </div>
        </div>

        <div className="border-t border-border p-3 flex items-center justify-end gap-2 bg-muted/30">
          <Button variant="outline" size="sm" onClick={reset}>
            Reset
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
