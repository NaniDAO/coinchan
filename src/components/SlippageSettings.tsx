import { SLIPPAGE_OPTIONS } from "@/lib/swap";
import { cn } from "@/lib/utils";

interface SlippageOption {
  label: string;
  value: bigint;
}

interface SlippageSettingsProps {
  slippageBps: bigint;
  setSlippageBps: (value: bigint) => void;
  slippageOptions?: SlippageOption[];
  className?: string;
}

export const SlippageSettings = ({
  slippageBps,
  setSlippageBps,
  slippageOptions = SLIPPAGE_OPTIONS,
  className = "",
}: SlippageSettingsProps) => {
  return (
    <div
      className={cn(
        "mt-2 p-2 bg-background border border-border rounded-md shadow-sm space-y-2",
        className,
      )}
    >
      <div className="flex gap-2 flex-wrap">
        {slippageOptions.map((option) => (
          <button
            key={option.value.toString()}
            onClick={() => setSlippageBps(option.value)}
            className={`px-2 py-1 text-xs rounded border ${
              slippageBps === option.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted text-muted-foreground hover:bg-primary/10"
            }`}
          >
            {option.label}
          </button>
        ))}
        <div className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-muted border border-border">
          <input
            type="number"
            min="0.1"
            max="50"
            step="0.1"
            className="w-12 bg-transparent outline-none text-center"
            onChange={(e) => {
              const value = Number.parseFloat(e.target.value);
              if (!isNaN(value) && value >= 0.1 && value <= 50) {
                setSlippageBps(BigInt(Math.floor(value * 100)));
              }
            }}
          />
          <span>%</span>
        </div>
      </div>
    </div>
  );
};
