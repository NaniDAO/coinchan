import { SwapModeTab } from "@/components/swap/SwapModeTab";
import { LimitSwapAction } from "@/components/swap//LimitSwapAction";
import { InstantTradeAction } from "../trade/InstantTradeAction";

interface SwapActionProps {
  action: "instant" | "limit";
}

/** Router-only component that switches between Instant and Limit swaps */
export const SwapAction = (
  { action }: SwapActionProps = {
    action: "instant",
  },
) => {
  return (
    <div className="relative w-full flex flex-col">
      <SwapModeTab />

      {action === "instant" ? <InstantTradeAction /> : <LimitSwapAction />}
    </div>
  );
};
