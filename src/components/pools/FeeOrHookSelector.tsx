import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { DEFAULT_FEE_TIER, FEE_OPTIONS } from "@/lib/pools";
import { InfoIcon, Percent, Code2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { maxUint256 } from "viem";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface FeeOrHookSelectorProps {
  feeOrHook: bigint;
  setFeeOrHook: (feeOrHook: bigint) => void;
  isHook: boolean;
  className?: string;
}

export const FeeOrHookSelector = ({ feeOrHook, setFeeOrHook, isHook, className }: FeeOrHookSelectorProps) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"fee" | "hook">(isHook ? "hook" : "fee");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Convert bigint fee to percentage for display
  const feePercentage = !isHook ? Number(feeOrHook) / 100 : 0.3; // Default to 0.3% if hook

  const handleFeeSliderChange = (values: number[]) => {
    const bps = BigInt(Math.round(values[0] * 100));
    setFeeOrHook(bps);
  };

  const handlePresetClick = (bps: bigint) => {
    setFeeOrHook(bps);
    setActiveTab("fee");
  };

  const handleHookAddressChange = (address: string) => {
    try {
      // Clean the input - remove 0x prefix if present
      const cleaned = address.replace(/^0x/i, "");

      // If empty, clear the hook
      if (!cleaned) {
        setFeeOrHook(DEFAULT_FEE_TIER);
        setActiveTab("fee");
        return;
      }

      // Validate hex format
      if (!/^[0-9a-fA-F]*$/.test(cleaned)) {
        return; // Invalid hex, don't update
      }

      // Convert hex address to bigint
      const hookId = BigInt("0x" + cleaned);
      setFeeOrHook(hookId);
      setActiveTab("hook");
    } catch (e) {
      // Invalid input, ignore
    }
  };

  const currentHookAddress =
    isHook && feeOrHook > maxUint256 / 2n ? "0x" + feeOrHook.toString(16).padStart(40, "0") : "";

  return (
    <div className={cn("mt-4 space-y-4", className)}>
      {/* Advanced Options Section */}
      <div className="rounded-lg border bg-card">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-accent/50 transition-colors rounded-lg"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{t("pools.advanced_options")}</span>
            {isHook && (
              <span className="text-[10px] rounded-sm border border-primary bg-primary/10 px-1.5 py-0.5">
                {t("pools.hook_active")}
              </span>
            )}
          </div>
          <svg
            className={cn("h-4 w-4 transition-transform", showAdvanced && "rotate-180")}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {showAdvanced && (
          <div className="px-4 pb-4 space-y-4">
            {/* Tab Selection */}
            <div className="flex gap-2 p-1 bg-muted rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("fee");
                  if (isHook) setFeeOrHook(DEFAULT_FEE_TIER);
                }}
                className={cn(
                  "flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all",
                  activeTab === "fee" ? "bg-background shadow-sm" : "hover:bg-background/50",
                )}
              >
                <div className="flex items-center justify-center gap-2">
                  <Percent className="h-3.5 w-3.5" />
                  <span>{t("pools.swap_fee")}</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("hook")}
                className={cn(
                  "flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all",
                  activeTab === "hook" ? "bg-background shadow-sm" : "hover:bg-background/50",
                )}
              >
                <div className="flex items-center justify-center gap-2">
                  <Code2 className="h-3.5 w-3.5" />
                  <span>{t("pools.hook_address")}</span>
                </div>
              </button>
            </div>

            {/* Fee Content */}
            {activeTab === "fee" && !isHook && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="feeSlider" className="text-sm">
                      {t("pools.swap_fee_percentage")}
                    </Label>
                    <span className="text-sm font-mono font-medium">{feePercentage.toFixed(2)}%</span>
                  </div>

                  <Slider
                    id="feeSlider"
                    min={0}
                    max={100}
                    step={0.01}
                    value={[feePercentage]}
                    onValueChange={handleFeeSliderChange}
                    className="w-full"
                  />

                  <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                    <span>0%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Quick presets */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">{t("pools.common_fee_tiers")}</p>
                  <div className="flex flex-wrap gap-2">
                    {FEE_OPTIONS.map((option) => {
                      const isSelected = feeOrHook === option.value;
                      return (
                        <button
                          key={option.value.toString()}
                          type="button"
                          onClick={() => handlePresetClick(option.value)}
                          className={cn(
                            "px-3 py-1.5 rounded-md text-xs font-medium border transition-all",
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background hover:bg-accent border-border",
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">{t("pools.swap_fee_description")}</p>
              </div>
            )}

            {/* Hook Content */}
            {activeTab === "hook" && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="hookAddress" className="text-sm mb-2 block">
                    {t("pools.hook_contract_address")}
                  </Label>
                  <Input
                    id="hookAddress"
                    type="text"
                    placeholder="0x..."
                    value={currentHookAddress}
                    onChange={(e) => handleHookAddressChange(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-2">{t("pools.hook_address_description")}</p>
                </div>

                {isHook && feeOrHook > 0n && (
                  <div className="rounded-md border bg-muted/50 p-3">
                    <div className="flex items-start gap-2">
                      <InfoIcon className="w-4 h-4 mt-0.5 text-muted-foreground" />
                      <div className="text-sm space-y-1">
                        <div className="font-medium">{t("pools.hook_active")}</div>
                        <div className="text-xs text-muted-foreground font-mono break-all">
                          ID: {feeOrHook.toString()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFeeOrHook(DEFAULT_FEE_TIER);
                    setActiveTab("fee");
                  }}
                  className="w-full"
                >
                  {t("pools.clear_hook")}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary Display (always visible) */}
      {!showAdvanced && (
        <div className="text-sm text-muted-foreground">
          {isHook ? t("pools.using_custom_hook") : t("pools.swap_fee_summary", { fee: feePercentage.toFixed(2) })}
        </div>
      )}
    </div>
  );
};
