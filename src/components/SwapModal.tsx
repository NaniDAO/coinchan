import { SwapAction } from "@/SwapAction";

export const SwapModal = () => {
  return (
    <div className="flex items-center justify-center w-full">
      <div className="w-xl outline-2 outline-double outline-border p-3 overflow-clip">
        <SwapAction />
      </div>
    </div>
  );
};
