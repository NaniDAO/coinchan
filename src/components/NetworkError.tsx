import { AlertCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { useMainnetCheck } from "@/hooks/use-mainnet-check";

interface NetworkErrorProps {
  message?: string;
  autoSwitch?: boolean;
  compact?: boolean;
}

export const NetworkError = ({ message, autoSwitch = true, compact = false }: NetworkErrorProps) => {
  const { t } = useTranslation();
  const { needsNetworkSwitch, isSwitching, switchToMainnet } = useMainnetCheck({
    autoSwitch: autoSwitch && !compact,
  });

  if (!needsNetworkSwitch) return null;

  // Compact mode for inline warnings
  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs text-yellow-600 dark:text-yellow-400">
        <AlertCircle className="w-3 h-3" />
        <span>{t("errors.wrong_network_compact")}</span>
      </div>
    );
  }

  // Full mode with auto-switch UI
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
      <div className="flex items-center gap-3">
        {isSwitching ? (
          <Loader2 className="w-4 h-4 animate-spin text-yellow-600 dark:text-yellow-400" />
        ) : (
          <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
        )}
        <div className="text-sm">
          <p className="font-medium text-yellow-800 dark:text-yellow-200">{t("errors.wrong_network_title")}</p>
          <p className="text-yellow-700 dark:text-yellow-300">{message || t("errors.wrong_network_message")}</p>
        </div>
      </div>
      {!autoSwitch && (
        <Button
          size="sm"
          variant="outline"
          onClick={switchToMainnet}
          disabled={isSwitching}
          className="border-yellow-300 dark:border-yellow-700"
        >
          {isSwitching ? t("common.switching") : t("common.switch_network")}
        </Button>
      )}
    </div>
  );
};
