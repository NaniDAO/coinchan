import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowDownUp, Plus } from "lucide-react";
import { useAllCoins } from "./hooks/metadata/use-all-coins";

import SpinnerLoader from "./components/ui/spinner-loader";
import { LiquidityActions } from "./LiquidityActions";
import { SwapAction } from "./SwapAction";

/* ────────────────────────────────────────────────────────────────────────────
  Mode types and constants
──────────────────────────────────────────────────────────────────────────── */
type TileMode = "swap" | "liquidity";

/* ────────────────────────────────────────────────────────────────────────────
  Pool Actions
──────────────────────────────────────────────────────────────────────────── */
export const PoolActions = () => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<TileMode>("swap");
  const { tokenCount, loading, error: loadError } = useAllCoins();

  // Loading state
  if (loading) {
    return <SpinnerLoader />;
  }

  // Main UI
  return (
    <Card className="w-full max-w-lg p-4 sm:p-6 border-2 border-border shadow-md rounded-xl dark:bg-card/95 dark:backdrop-blur-sm dark:shadow-[0_0_20px_rgba(0,204,255,0.07)]">
      <CardContent className="p-0 sm:p-1 flex flex-col space-y-1">
        {/* Info showing token count */}
        <div className="text-xs text-muted-foreground mb-2">
          {t("common.available")} {t("common.tokens")}: {tokenCount} (ETH + {tokenCount - 1} {t("common.coins")},{" "}
          {t("common.sorted_by")} {t("common.liquidity")})
        </div>

        {/* Mode tabs */}
        <Tabs value={mode} onValueChange={(value) => setMode(value as TileMode)} className="mb-2">
          <TabsList className="w-full bg-primary dark:bg-background p-1 rounded-lg border border-border">
            <TabsTrigger
              value="swap"
              className="flex-1 data-[state=active]:bg-background dark:data-[state=active]:bg-card dark:data-[state=active]:shadow-[0_0_10px_rgba(0,204,255,0.15)] dark:data-[state=active]:border-primary data-[state=active]:border-border data-[state=active]:shadow-sm h-10 touch-manipulation text-primary-foreground"
            >
              <ArrowDownUp className="h-4 w-4 mr-1" />
              <span className="text-sm text-primary-foreground">{t("common.swap")}</span>
            </TabsTrigger>
            <TabsTrigger
              value="liquidity"
              className="flex-1 data-[state=active]:bg-background dark:data-[state=active]:bg-card dark:data-[state=active]:shadow-[0_0_10px_rgba(0,204,255,0.15)] dark:data-[state=active]:border-primary data-[state=active]:border-border data-[state=active]:shadow-sm h-10 touch-manipulation text-primary-foreground"
            >
              <Plus className="h-4 w-4 mr-1" />
              <span className="text-sm text-primary-foreground data-[state=active]:text-foreground">
                {t("common.liquidity")}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Liquidity mode tabs - only show when in liquidity mode */}
        {mode === "liquidity" && <LiquidityActions />}
        {mode === "swap" && <SwapAction />}

        {/* Load error notification */}
        {loadError && (
          <div className="p-2 mb-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
            {loadError}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PoolActions;
