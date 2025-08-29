// PercentageBlobs.tsx
import { cn as cn2 } from "@/lib/utils";
import { useTranslation as useTranslation2 } from "react-i18next";

interface PercentageBlobsProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  disabled?: boolean;
  /** show buttons without the grouped pill container (Uniswap-like) */
  variant?: "group" | "inline";
  /** control size of the buttons */
  size?: "sm" | "md";
  /** optionally change steps */
  steps?: number[];
}

export const PercentageBlobs: React.FC<PercentageBlobsProps> = ({
  value,
  onChange,
  className = "",
  disabled = false,
  variant = "group",
  size = "sm",
  steps = [25, 50, 75, 100],
}) => {
  const { t } = useTranslation2();

  const sizeClasses = size === "sm" ? "min-w-[36px] px-2 py-1 text-[11px]" : "min-w-[44px] px-3 py-1.5 text-xs";

  // PercentageBlobs.tsx
  const container =
    variant === "group"
      ? "items-center gap-1 rounded-full border border-terminal-black bg-background px-1 py-1 shadow-[2px_2px_0_var(--terminal-black)]"
      : "items-center gap-1";

  return (
    <div className={cn2(container, className)} aria-label={t("common.amount")}>
      {steps.map((step) => (
        <button
          key={step}
          onClick={() => onChange(step)}
          disabled={disabled}
          className={cn2(
            "rounded-md transition-all duration-150 border border-border",
            "",
            sizeClasses,
            value === step ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-primary/20",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          {step === 100 ? "Max" : `${step}%`}
        </button>
      ))}
    </div>
  );
};
