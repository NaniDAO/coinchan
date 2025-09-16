import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import FeeSelector from "@/components/pools/FeeSelector";
import { DEFAULT_FEE_TIER } from "@/lib/pools";
import { InfoIcon } from "lucide-react";
import { shortenUint } from "@/lib/math";
import { cn } from "@/lib/utils";
import { maxUint256 } from "viem";

interface FeeOrHookSelectorProps {
  feeOrHook: bigint;
  setFeeOrHook: (feeOrHook: bigint) => void;
  isHook: boolean;
  liquidityByFee?: Record<string, string>;
  className?: string;
}

export const FeeOrHookSelector = ({
  feeOrHook,
  setFeeOrHook,
  isHook,
  liquidityByFee,
  className,
}: FeeOrHookSelectorProps) => {
  return (
    <div className={cn("mt-4", className)}>
      <details className="">
        <summary className="text-sm font-medium">Set a Hook(Advanced)</summary>
        <div className="max-w-xl p-2 border-border bg-muted">
          <Label htmlFor="hookId" className="mb-1">
            Hook ID (address of hook encoded as a uint)
          </Label>
          <Input
            id="hookId"
            placeholder="Enter hook ID"
            value={feeOrHook.toString()}
            max={maxUint256.toString()}
            onChange={(e) => setFeeOrHook(BigInt(e.target.value))}
          />
        </div>
      </details>

      <div className="mt-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">{isHook ? "Hook" : "Fee tier"}</h3>
          {isHook && <span className="text-[10px] rounded-sm border px-1.5 py-0.5">hook active</span>}
        </div>
        <p className="text-base text-muted-foreground">
          {isHook
            ? "A hook is selected for this pool. The hook ID replaces the fee tier."
            : "This is the amount of fees charged for a trade against this position."}
        </p>

        {/* If a hook is active, show a clear readout; otherwise render FeeSelector */}
        {isHook ? (
          <div className="mt-3 rounded-md border bg-card p-3">
            <div className="flex items-start gap-2">
              <InfoIcon className="w-4 h-4 mt-0.5 text-muted-foreground" />
              <div className="text-sm">
                <div className="font-medium">Hook (uint256): {shortenUint(feeOrHook)}</div>
                <div className="text-xs text-muted-foreground break-all">Full value: {feeOrHook.toString()}</div>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setFeeOrHook(DEFAULT_FEE_TIER)}>
                Clear hook (use fee tiers)
              </Button>
            </div>
          </div>
        ) : (
          <FeeSelector fee={feeOrHook} onChange={setFeeOrHook} liquidityByFee={liquidityByFee} />
        )}
      </div>
    </div>
  );
};
