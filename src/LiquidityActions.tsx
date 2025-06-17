import { useState } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import { RemoveLiquidity } from "./RemoveLiquidity";
import { SingleEthLiquidity } from "./SingleEthLiquidity";
import { AddLiquidity } from "./AddLiquidity";
import { cn } from "@/lib/utils";

type LiquidityMode = "add" | "remove" | "single-eth";

export const LiquidityActions = () => {
  const [liquidityMode, setLiquidityMode] = useState<LiquidityMode>("add");

  return (
    <div>
      <div className="flex flex-row items-center justify-center mb-2">
        <div className="flex p-0.5 gap-0">
          <button
            className={cn(
              `!px-2 flex flex-row items-center justify-center !py-1 text-xs border-2 transition-colors hover:!text-underline`,
              liquidityMode === "add" ? "bg-background text-foreground" : "bg-accent text-accent-foreground",
            )}
            onClick={() => setLiquidityMode("add")}
          >
            <PlusIcon className="h-4 w-4 mr-1" />
            <span>Add</span>
          </button>
          <button
            className={cn(
              `!px-2 !py-1 flex flex-row items-center justify-center text-xs border-2 transition-colors hover:!text-underline`,
              liquidityMode === "remove" ? "bg-background text-foreground" : "bg-accent text-accent-foreground",
            )}
            onClick={() => setLiquidityMode("remove")}
          >
            <MinusIcon className="h-4 w-4 mr-1" />
            <span>Remove</span>
          </button>
          <button
            className={cn(
              `!px-2 !py-1 flex flex-row items-center justify-center text-xs border-2 transition-colors hover:!text-underline`,
              liquidityMode === "single-eth" ? "bg-background text-foreground" : "bg-accent text-accent-foreground",
            )}
            onClick={() => setLiquidityMode("single-eth")}
          >
            <span className="text-xs font-medium mr-1">Ξ</span>
            <span>Single-ETH</span>
          </button>
        </div>
      </div>
      {liquidityMode === "remove" && <RemoveLiquidity />}
      {liquidityMode === "add" && <AddLiquidity />}
      {liquidityMode === "single-eth" && <SingleEthLiquidity />}
    </div>
  );
};
