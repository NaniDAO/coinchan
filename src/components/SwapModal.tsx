import { SwapAction } from "@/SwapAction";
import { TokenSelectionProvider } from "@/contexts/TokenSelectionContext";

export const SwapModal = () => {
  return (
    <div className="flex items-center justify-center w-full">
      <div className="w-xl outline-2 outline-double outline-border p-3 overflow-visible">
        <TokenSelectionProvider>
          <SwapAction />
        </TokenSelectionProvider>
      </div>
    </div>
  );
};
