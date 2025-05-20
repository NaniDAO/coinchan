import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";
import { MinusIcon, PlusIcon } from "lucide-react";
import { RemoveLiquidity } from "./RemoveLiquidity";
import { SingleEthLiquidity } from "./SingleEthLiquidity";
import { AddLiquidity } from "./AddLiquidity";

type LiquidityMode = "add" | "remove" | "single-eth";

export const LiquidityActions = () => {
  const [liquidityMode, setLiquidityMode] = useState<LiquidityMode>("add");

  return (
    <div>
      <Tabs value={liquidityMode} onValueChange={(value) => setLiquidityMode(value as LiquidityMode)} className="mb-2">
        <TabsList className="w-full bg-secondary dark:bg-background/80 p-1 rounded-lg border border-border">
          <TabsTrigger
            value="add"
            className="flex-1  data-[state=active]:bg-background dark:data-[state=active]:bg-card dark:data-[state=active]:shadow-[0_0_10px_rgba(0,204,255,0.15)] dark:data-[state=active]:border-primary/50 data-[state=active]:border-border data-[state=active]:shadow-sm h-10 touch-manipulation text-primary-foreground"
          >
            <PlusIcon className="h-4 w-4 mr-1" />
            <span className="text-xs sm:text-sm">Add</span>
          </TabsTrigger>
          <TabsTrigger
            value="remove"
            className="flex-1 data-[state=active]:bg-background dark:data-[state=active]:bg-card dark:data-[state=active]:shadow-[0_0_10px_rgba(0,204,255,0.15)] dark:data-[state=active]:border-primary/50 data-[state=active]:border-border data-[state=active]:shadow-sm h-10 touch-manipulation text-primary-foreground"
          >
            <MinusIcon className="h-4 w-4 mr-1" />
            <span className="text-xs sm:text-sm">Remove</span>
          </TabsTrigger>
          <TabsTrigger
            value="single-eth"
            className="flex-1 data-[state=active]:bg-background dark:data-[state=active]:bg-card dark:data-[state=active]:shadow-[0_0_10px_rgba(0,204,255,0.15)] dark:data-[state=active]:border-primary/50 data-[state=active]:border-border data-[state=active]:shadow-sm h-10 touch-manipulation text-primary-foreground"
          >
            <span className="text-xs font-medium mr-1">Ξ</span>
            <span className="text-xs sm:text-sm">Single-ETH</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {liquidityMode === "remove" && <RemoveLiquidity />}
      {liquidityMode === "add" && <AddLiquidity />}
      {liquidityMode === "single-eth" && <SingleEthLiquidity />}
    </div>
  );
};
