import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { CookbookCLOBExchange } from "./CookbookCLOBExchange";
import { useCookbookCoinP2PBalance } from "../hooks/use-cookbook-p2p-balances";
import { useTranslation } from "react-i18next";
import { formatUnits } from "viem";
import { TrendingUp, Users, Clock, AlertTriangle } from "lucide-react";

interface P2PTradingToggleProps {
  cookbookCoinId: bigint;
  cookbookSymbol: string;
  cookbookName: string;
  isLaunchpadActive: boolean;
  launchpadEndTime?: number; // Unix timestamp
  onP2PModeChange?: (enabled: boolean) => void;
}

export function P2PTradingToggle({
  cookbookCoinId,
  cookbookSymbol,
  cookbookName,
  isLaunchpadActive,
  launchpadEndTime,
  onP2PModeChange,
}: P2PTradingToggleProps) {
  const { t } = useTranslation();
  const [isP2PModeEnabled, setIsP2PModeEnabled] = useState(false);
  const [showP2PDialog, setShowP2PDialog] = useState(false);
  
  const { balance: cookbookBalance, isEligibleForP2P } = useCookbookCoinP2PBalance(cookbookCoinId);

  const timeRemaining = launchpadEndTime ? launchpadEndTime - Math.floor(Date.now() / 1000) : 0;
  const hoursRemaining = Math.max(0, Math.floor(timeRemaining / 3600));
  const minutesRemaining = Math.max(0, Math.floor((timeRemaining % 3600) / 60));

  const handleP2PModeToggle = (enabled: boolean) => {
    setIsP2PModeEnabled(enabled);
    onP2PModeChange?.(enabled);
  };

  const openP2PExchange = () => {
    setShowP2PDialog(true);
  };

  return (
    <>
      <Card className="border-dashed border-2 hover:border-solid transition-all duration-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-blue-500" />
              <CardTitle className="text-lg">{t("P2P Trading")}</CardTitle>
            </div>
            <Badge variant={isLaunchpadActive ? "destructive" : "secondary"}>
              {isLaunchpadActive ? t("Launchpad Active") : t("Post-Launch")}
            </Badge>
          </div>
          <CardDescription>
            {isLaunchpadActive 
              ? t("Trade your {{symbol}} tokens with other users during the sale period", { symbol: cookbookSymbol })
              : t("Peer-to-peer trading for {{symbol}} tokens", { symbol: cookbookSymbol })
            }
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Status indicators */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <div className="text-sm">
                <div className="font-medium">{t("Your Balance")}</div>
                <div className="text-muted-foreground">
                  {formatUnits(cookbookBalance, 18)} {cookbookSymbol}
                </div>
              </div>
            </div>
            
            {isLaunchpadActive && (
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-orange-500" />
                <div className="text-sm">
                  <div className="font-medium">{t("Time Remaining")}</div>
                  <div className="text-muted-foreground">
                    {hoursRemaining}h {minutesRemaining}m
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Badge variant={isEligibleForP2P ? "default" : "secondary"}>
                {isEligibleForP2P ? t("Eligible") : t("Not Eligible")}
              </Badge>
            </div>
          </div>

          {/* Warning for launchpad period */}
          {isLaunchpadActive && (
            <div className="flex items-start space-x-2 p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-yellow-800 dark:text-yellow-200">
                <div className="font-medium">{t("Experimental Feature")}</div>
                <div>
                  {t("P2P trading during launchpad period allows early liquidity but may have different pricing than the official sale.")}
                </div>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Switch
                  id="p2p-mode"
                  checked={isP2PModeEnabled}
                  onCheckedChange={handleP2PModeToggle}
                  disabled={!isEligibleForP2P}
                />
                <Label htmlFor="p2p-mode" className="text-sm font-medium">
                  {t("Enable P2P Trading Mode")}
                </Label>
              </div>
            </div>

            {!isEligibleForP2P && (
              <div className="text-sm text-muted-foreground">
                {t("You need to hold {{symbol}} tokens to enable P2P trading", { symbol: cookbookSymbol })}
              </div>
            )}

            {isP2PModeEnabled && isEligibleForP2P && (
              <div className="space-y-2">
                <Button onClick={openP2PExchange} className="w-full">
                  {t("Open P2P Exchange")}
                </Button>
                <div className="text-xs text-muted-foreground text-center">
                  {t("Trade directly with other {{symbol}} holders", { symbol: cookbookSymbol })}
                </div>
              </div>
            )}
          </div>

          {/* Feature highlights */}
          <div className="pt-2 border-t">
            <div className="text-xs text-muted-foreground space-y-1">
              <div>• {t("Set your own prices and trade directly with other users")}</div>
              <div>• {t("No AMM slippage - trade at exact prices you set")}</div>
              <div>• {t("Build liquidity before official launch completion")}</div>
              {isLaunchpadActive && (
                <div>• {t("Available during launchpad sale period")}</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* P2P Exchange Dialog */}
      <Dialog open={showP2PDialog} onOpenChange={setShowP2PDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t("{{symbol}} P2P Exchange", { symbol: cookbookSymbol })}
            </DialogTitle>
            <DialogDescription>
              {t("Trade {{name}} tokens directly with other users", { name: cookbookName })}
            </DialogDescription>
          </DialogHeader>
          <CookbookCLOBExchange
            cookbookCoinId={cookbookCoinId}
            cookbookSymbol={cookbookSymbol}
            cookbookName={cookbookName}
            isLaunchpadActive={isLaunchpadActive}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}