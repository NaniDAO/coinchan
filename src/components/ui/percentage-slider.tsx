import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface PercentageSliderProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  disabled?: boolean;
}

export const PercentageSlider: React.FC<PercentageSliderProps> = ({
  value,
  onChange,
  className = "",
  disabled = false,
}) => {
  const { t } = useTranslation();
  const percentageSteps = [0, 25, 50, 75, 100];

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{t("common.amount")}</span>
        <span className="text-xs text-primary font-medium">{value}%</span>
      </div>

      <div className="relative">
        {/* Slider track */}
        <div className="h-2 bg-muted rounded-full relative">
          {/* Progress fill */}
          <div className="h-full bg-primary rounded-full transition-all duration-200" style={{ width: `${value}%` }} />

          {/* Slider thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-primary rounded-full border-2 border-background shadow-lg transition-all duration-200 hover:scale-110 cursor-pointer"
            style={{ left: `calc(${value}% - 8px)` }}
          />
        </div>

        {/* Range input overlay */}
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />
      </div>

      {/* Quick percentage buttons */}
      <div className="flex justify-between">
        {percentageSteps.map((step) => (
          <button
            key={step}
            onClick={() => onChange(step)}
            disabled={disabled}
            className={cn(
              "text-xs px-2 py-1 rounded transition-all duration-200 hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed",
              value === step ? "bg-primary/20 text-primary font-medium" : "text-muted-foreground hover:text-primary",
            )}
          >
            {step}%
          </button>
        ))}
      </div>
    </div>
  );
};
