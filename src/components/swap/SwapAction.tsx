import { useState } from "react";
import { SwapModeTab } from "@/components/swap/SwapModeTab";
import type { TokenMeta } from "@/lib/coins";
import { InstantSwapAction } from "@/components/swap/InstantSwapAction";
import { LimitSwapAction } from "@/components/swap//LimitSwapAction";

interface SwapActionProps {
  lockedTokens?: {
    sellToken: TokenMeta;
    buyToken: TokenMeta;
  };
}

/** Router-only component that switches between Instant and Limit swaps */
export const SwapAction = ({ lockedTokens }: SwapActionProps = {}) => {
  const [swapMode, setSwapMode] = useState<"instant" | "limit">("instant");

  return (
    <div className="relative w-full flex flex-col">
      <SwapModeTab swapMode={swapMode} setSwapMode={setSwapMode} />

      {swapMode === "instant" ? (
        <InstantSwapAction lockedTokens={lockedTokens} />
      ) : (
        <LimitSwapAction lockedTokens={lockedTokens} />
      )}
    </div>
  );
};
