import { SLIPPAGE_OPTIONS } from "@/lib/swap";
import { useState } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const [showSlippageSettings, setShowSlippageSettings] = useState(false);

  return (
    <div
      onClick={() => setShowSlippageSettings(!showSlippageSettings)}
      className={`text-xs mt-1 px-2 py-1 bg-primary/5 border border-primary/20 rounded text-primary cursor-pointer hover:bg-primary/10 transition-colors ${className}`}
    >
      <div className="flex justify-between items-center">
        <span>
          <strong>{t("common.slippage_tolerance_colon")}</strong> {Number(slippageBps) / 100}%
        </span>
        <span className="text-xs text-foreground-secondary">{showSlippageSettings ? "▲" : "▼"}</span>
      </div>

      {/* Slippage Settings Panel */}
      {showSlippageSettings && (
        <div
          className="mt-2 p-2 bg-primary-background border border-accent rounded-md shadow-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2">
            <div className="flex gap-1 flex-wrap">
              {slippageOptions.map((option) => (
                <button
                  key={option.value.toString()}
                  onClick={() => setSlippageBps(option.value)}
                  className={`px-2 py-1 text-xs rounded bg-secondary text-secondary-foreground hover:bg-primary`}
                >
                  {option.label}
                </button>
              ))}
              {/* Simple custom slippage input */}
              <div className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-secondary/70 text-foreground">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.1"
                  max="50"
                  step="0.1"
                  placeholder=""
                  className="w-12 bg-transparent outline-none text-center"
                  onChange={(e) => {
                    const value = Number.parseFloat(e.target.value);
                    if (isNaN(value) || value < 0.1 || value > 50) return;

                    // Convert percentage to basis points
                    const bps = BigInt(Math.floor(value * 100));

                    setSlippageBps(bps);
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
