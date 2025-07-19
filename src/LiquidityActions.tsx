import { cn } from "@/lib/utils";
import { MinusIcon, PlusIcon, Settings } from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AddLiquidity } from "./AddLiquidity";
import { CreatePool } from "./CreatePool";
import { RemoveLiquidity } from "./RemoveLiquidity";
import { SingleEthLiquidity } from "./SingleEthLiquidity";
import { useTokenSelection } from "./contexts/TokenSelectionContext";

type LiquidityMode = "add" | "remove" | "single-eth" | "create";

export const LiquidityActions = () => {
  const { t } = useTranslation();
  const [liquidityMode, setLiquidityMode] = useState<LiquidityMode>("add");
  const { sellToken, buyToken } = useTokenSelection();
  
  // Check if either token is CULT - disable single ETH for CULT pools
  const isCultPool = sellToken?.symbol === "CULT" || buyToken?.symbol === "CULT";
  
  // Auto-switch away from single-eth if CULT is selected
  useEffect(() => {
    if (isCultPool && liquidityMode === "single-eth") {
      setLiquidityMode("add");
    }
  }, [isCultPool, liquidityMode]);

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
            <span>{t("common.add")}</span>
          </button>
          <button
            className={cn(
              `!px-2 !py-1 flex flex-row items-center justify-center text-xs border-2 transition-colors hover:!text-underline`,
              liquidityMode === "remove" ? "bg-background text-foreground" : "bg-accent text-accent-foreground",
            )}
            onClick={() => setLiquidityMode("remove")}
          >
            <MinusIcon className="h-4 w-4 mr-1" />
            <span>{t("common.remove")}</span>
          </button>
          {!isCultPool && (
            <button
              className={cn(
                `!px-2 !py-1 flex flex-row items-center justify-center text-xs border-2 transition-colors hover:!text-underline`,
                liquidityMode === "single-eth" ? "bg-background text-foreground" : "bg-accent text-accent-foreground",
              )}
              onClick={() => setLiquidityMode("single-eth")}
            >
              <span className="text-xs font-medium mr-1">Ξ</span>
              <span>{t("common.single_eth")}</span>
            </button>
          )}
          <button
            className={cn(
              `!px-2 !py-1 flex flex-row items-center justify-center text-xs border-2 transition-colors hover:!text-underline`,
              liquidityMode === "create" ? "bg-background text-foreground" : "bg-accent text-accent-foreground",
            )}
            onClick={() => setLiquidityMode("create")}
          >
            <Settings className="h-4 w-4 mr-1" />
            <span>CREATE</span>
          </button>
        </div>
      </div>
      {liquidityMode === "remove" && <RemoveLiquidity />}
      {liquidityMode === "add" && <AddLiquidity />}
      {liquidityMode === "single-eth" && <SingleEthLiquidity />}
      {liquidityMode === "create" && <CreatePool />}
    </div>
  );
};
