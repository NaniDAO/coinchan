import { SwapModeTab } from "@/components/swap/SwapModeTab";
import type { TokenMeta } from "@/lib/coins";
import { InstantSwapAction } from "@/components/swap/InstantSwapAction";
import { LimitSwapAction } from "@/components/swap//LimitSwapAction";

interface SwapActionProps {
  lockedTokens?: {
    sellToken: TokenMeta;
    buyToken: TokenMeta;
  };
  action: "instant" | "limit";
}

/** Router-only component that switches between Instant and Limit swaps */
export const SwapAction = (
  { lockedTokens, action }: SwapActionProps = {
    action: "instant",
  },
) => {
  return (
    <div className="relative w-full flex flex-col">
      <SwapModeTab />

      {action === "instant" ? (
        <InstantSwapAction lockedTokens={lockedTokens} />
      ) : (
        <LimitSwapAction lockedTokens={lockedTokens} />
      )}
    </div>
  );
};
