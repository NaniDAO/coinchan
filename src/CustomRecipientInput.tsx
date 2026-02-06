import { useTranslation } from "react-i18next";
import { LoadingLogo } from "./components/ui/loading-logo";
import { useState } from "react";
import { ENSResolutionResult } from "./hooks/use-ens-resolution";

interface CustomRecipientInputProps {
  customRecipient: string;
  setCustomRecipient: (value: string) => void;
  ensResolution: ENSResolutionResult;
}

export const CustomRecipientInput = ({
  customRecipient,
  setCustomRecipient,
  ensResolution,
}: CustomRecipientInputProps) => {
  const [showRecipientInput, setShowRecipientInput] = useState(false);
  const { t } = useTranslation();

  return (
    <div className="mt-3">
      <button
        onClick={() => setShowRecipientInput(!showRecipientInput)}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
      >
        <span>{showRecipientInput ? "▼" : "▶"}</span>
        {t("swap.custom_recipient") || "Custom recipient"}
      </button>

      {showRecipientInput && (
        <div className="mt-2 space-y-2">
          <input
            type="text"
            placeholder={`${t("swap.recipient_address") || "Address or name (.eth, .wei)"} (${t("common.optional") || "optional"})`}
            value={customRecipient}
            onChange={(e) => setCustomRecipient(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {customRecipient && (
            <div className="space-y-1">
              {ensResolution.isLoading && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <LoadingLogo size="sm" className="scale-50" />
                  {t("swap.resolving_name") || "Resolving name..."}
                </p>
              )}
              {ensResolution.error && <p className="text-xs text-destructive">{ensResolution.error}</p>}
              {ensResolution.address && (
                <p className="text-xs text-muted-foreground">
                  {ensResolution.isENS || ensResolution.isWei ? (
                    <>
                      <span className="text-chart-2">{ensResolution.isWei ? ".wei:" : "ENS:"}</span> {customRecipient}{" "}
                      <span className="text-muted-foreground">→</span> {ensResolution.address?.slice(0, 6)}...
                      {ensResolution.address?.slice(-4)}
                    </>
                  ) : (
                    <>
                      {t("swap.recipient_note") || "Output will be sent to"}: {ensResolution.address?.slice(0, 6)}...
                      {ensResolution.address?.slice(-4)}
                    </>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
