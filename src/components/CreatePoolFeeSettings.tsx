import { useState } from "react";

// Fee tier options for pool creation
const FEE_OPTIONS = [
  { label: "0.05%", value: 5n }, // Ultra low fee
  { label: "0.3%", value: 30n }, // Default (Uniswap V2 style)
  { label: "1%", value: 100n }, // Current cookbook standard
  { label: "3%", value: 300n }, // High fee for exotic pairs
];

interface FeeSettingsProps {
  feeBps: bigint;
  setFeeBps: (value: bigint) => void;
  className?: string;
}

export const FeeSettings = ({ feeBps, setFeeBps, className = "" }: FeeSettingsProps) => {
  const [showFeeSettings, setShowFeeSettings] = useState(false);

  return (
    <div
      onClick={() => setShowFeeSettings(!showFeeSettings)}
      className={`text-xs mt-1 px-2 py-1 bg-primary/5 border border-primary/20 rounded text-primary cursor-pointer hover:bg-primary/10 transition-colors ${className}`}
    >
      <div className="flex justify-between items-center">
        <span>
          <strong>Pool Fee:</strong> {Number(feeBps) / 100}%
        </span>
        <span className="text-xs text-foreground-secondary">{showFeeSettings ? "▲" : "▼"}</span>
      </div>

      {showFeeSettings && (
        <div
          className="mt-2 p-2 bg-primary-background border border-accent rounded-md shadow-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2">
            <div className="flex gap-1 flex-wrap">
              {FEE_OPTIONS.map((option) => (
                <button
                  key={option.value.toString()}
                  onClick={() => setFeeBps(option.value)}
                  className={`px-2 py-1 text-xs rounded ${
                    feeBps === option.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-primary/50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
              <div className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-secondary/70 text-foreground">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="99"
                  step="0.01"
                  placeholder=""
                  className="w-12 bg-transparent outline-none text-center"
                  onChange={(e) => {
                    const value = Number.parseFloat(e.target.value);
                    if (isNaN(value) || value < 0.01 || value > 99) return;
                    const bps = BigInt(Math.floor(value * 100));
                    setFeeBps(bps);
                  }}
                />
                <span>%</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
