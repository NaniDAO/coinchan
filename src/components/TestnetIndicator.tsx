import { useTranslation } from "react-i18next";
import { useChainId } from "wagmi";
import { sepolia } from "wagmi/chains";

export function TestnetIndicator() {
  const chainId = useChainId();
  const { t } = useTranslation();

  // Only show on Sepolia testnet
  if (chainId !== sepolia.id) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-destructive text-destructive-foreground px-3 py-1.5 text-sm font-bold border-2 border-border shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.3)]">
        {t("common.testnet")}
      </div>
    </div>
  );
}
