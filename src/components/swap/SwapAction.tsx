import { SwapModeTab } from "@/components/swap/SwapModeTab";
import { LimitSwapAction } from "@/components/swap/LimitSwapAction";
import { InstantTradeAction } from "../trade/InstantTradeAction";
import { useLocation } from "@tanstack/react-router";
import { forwardRef } from "react";

interface SwapActionProps {
  action: "instant" | "limit";
}

/** Router-only component that switches between Instant and Limit swaps */
export const SwapAction = forwardRef<any, SwapActionProps>(({ action = "instant" }, ref) => {
  const location = useLocation();
  return (
    <div className="relative w-full flex flex-col">
      <SwapModeTab />

      {action === "instant" ? (
        <InstantTradeAction ref={ref} useSearchHook={location.pathname === "/swap" ? true : false} />
      ) : (
        <LimitSwapAction />
      )}
    </div>
  );
});

SwapAction.displayName = "SwapAction";
