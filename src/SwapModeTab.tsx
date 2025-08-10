import { SetStateAction } from "react";
import { useTranslation } from "react-i18next";

interface SwapModeTabProps {
  swapMode: "instant" | "limit";
  setSwapMode: React.Dispatch<SetStateAction<"instant" | "limit">>;
}

export const SwapModeTab = ({ swapMode, setSwapMode }: SwapModeTabProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center mb-4">
      <div className="inline-flex gap-1 border-2 border-border bg-muted p-0.5">
        <button
          onClick={() => setSwapMode("instant")}
          className={`px-3 py-1.5 text-xs font-bold uppercase cursor-pointer transition-all duration-100 font-body hover:opacity-80 focus:ring-2 focus:ring-primary/50 focus:outline-none ${
            swapMode === "instant"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {t("swap.instant")}
        </button>
        <button
          onClick={() => setSwapMode("limit")}
          className={`px-3 py-1.5 text-xs font-bold uppercase cursor-pointer transition-all duration-100 font-body hover:opacity-80 focus:ring-2 focus:ring-primary/50 focus:outline-none ${
            swapMode === "limit"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {t("swap.limit_order")}
        </button>
      </div>
    </div>
  );
};
