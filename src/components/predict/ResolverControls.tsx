import React, { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { PredictionMarketAbi } from "@/constants/PredictionMarket";
import { PredictionAMMAbi } from "@/constants/PredictionMarketAMM";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface ResolverControlsProps {
  marketId: bigint;
  contractAddress: string;
  marketType: "parimutuel" | "amm";
  resolver: string;
  closingTime: number;
  canAccelerateClosing: boolean;
  resolved: boolean;
  onSuccess?: () => void;
}

export const ResolverControls: React.FC<ResolverControlsProps> = ({
  marketId,
  contractAddress,
  marketType,
  resolver,
  closingTime,
  canAccelerateClosing,
  resolved,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const { address } = useAccount();
  const [resolvingTo, setResolvingTo] = useState<boolean | null>(null);

  // Check if trading is still open
  const { data: tradingOpen } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: marketType === "amm" ? PredictionAMMAbi : PredictionMarketAbi,
    functionName: "tradingOpen",
    args: [marketId],
  });

  const { writeContract, isPending, error } = useWriteContract();
  const { isLoading: isTxLoading, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({
    hash: error ? undefined : undefined,
  });

  // Don't show if not the resolver
  if (!address || address.toLowerCase() !== resolver.toLowerCase()) {
    return null;
  }

  // Don't show if already resolved
  if (resolved) {
    return (
      <Card className="p-4 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
        <div className="flex items-center gap-2">
          <Badge className="bg-green-600 hover:bg-green-700">{t("predict.resolved")}</Badge>
          <p className="text-sm text-green-800 dark:text-green-200">{t("predict.market_resolved")}</p>
        </div>
      </Card>
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const hasClosingTimePassed = now >= closingTime;
  const canClose = tradingOpen && canAccelerateClosing;
  const canResolve = !tradingOpen;

  const handleCloseMarket = () => {
    writeContract({
      address: contractAddress as `0x${string}`,
      abi: marketType === "amm" ? PredictionAMMAbi : PredictionMarketAbi,
      functionName: "closeMarket",
      args: [marketId],
    });
  };

  const handleResolve = (outcome: boolean) => {
    setResolvingTo(outcome);
    writeContract({
      address: contractAddress as `0x${string}`,
      abi: marketType === "amm" ? PredictionAMMAbi : PredictionMarketAbi,
      functionName: "resolve",
      args: [marketId, outcome],
    });
  };

  React.useEffect(() => {
    if (isTxSuccess) {
      toast.success(t("predict.transaction_confirmed"));
      setResolvingTo(null);
      if (onSuccess) onSuccess();
    }
  }, [isTxSuccess, onSuccess, t]);

  React.useEffect(() => {
    if (error) {
      // Handle wallet rejection gracefully
      if ((error as any)?.code === 4001 || (error as any)?.code === "ACTION_REJECTED") {
        toast.info("Transaction cancelled");
        setResolvingTo(null);
        return;
      }

      // Handle user rejection messages
      const errorMessage = (error as any)?.shortMessage ?? error?.message ?? "";
      if (
        errorMessage.toLowerCase().includes("user rejected") ||
        errorMessage.toLowerCase().includes("user denied") ||
        errorMessage.toLowerCase().includes("user cancelled") ||
        errorMessage.toLowerCase().includes("rejected by user")
      ) {
        toast.info("Transaction cancelled");
        setResolvingTo(null);
        return;
      }

      // Other errors
      toast.error(errorMessage || "Transaction failed");
      setResolvingTo(null);
    }
  }, [error]);

  return (
    <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-blue-500 text-blue-600 dark:text-blue-400">
            {t("predict.resolver_controls")}
          </Badge>
        </div>

        {/* Trading Status */}
        {tradingOpen && (
          <Alert className="bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800">
            <AlertTitle className="text-yellow-800 dark:text-yellow-200 text-sm">
              {t("predict.trading_active")}
            </AlertTitle>
            <AlertDescription className="text-yellow-700 dark:text-yellow-300 text-xs">
              {hasClosingTimePassed
                ? t("predict.closing_time_passed")
                : t("predict.closes_at", {
                    time: new Date(closingTime * 1000).toLocaleString(),
                  })}
            </AlertDescription>
          </Alert>
        )}

        {/* Close Market Button */}
        {canClose && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t("predict.close_market_description")}</p>
            <Button
              onClick={handleCloseMarket}
              disabled={isPending || isTxLoading}
              variant="outline"
              className="w-full"
            >
              {isPending || isTxLoading ? t("predict.closing") : t("predict.close_market")}
            </Button>
          </div>
        )}

        {/* Trading Closed - Ready to Resolve */}
        {!tradingOpen && (
          <Alert className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
            <AlertTitle className="text-green-800 dark:text-green-200 text-sm">
              {t("predict.ready_to_resolve")}
            </AlertTitle>
            <AlertDescription className="text-green-700 dark:text-green-300 text-xs">
              {t("predict.select_outcome")}
            </AlertDescription>
          </Alert>
        )}

        {/* Resolve Buttons */}
        {canResolve && (
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => handleResolve(true)}
              disabled={isPending || isTxLoading || resolvingTo !== null}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {resolvingTo === true && (isPending || isTxLoading) ? t("predict.resolving") : t("predict.resolve_yes")}
            </Button>
            <Button
              onClick={() => handleResolve(false)}
              disabled={isPending || isTxLoading || resolvingTo !== null}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {resolvingTo === false && (isPending || isTxLoading) ? t("predict.resolving") : t("predict.resolve_no")}
            </Button>
          </div>
        )}

        {/* Cannot Close Notice */}
        {tradingOpen && !canAccelerateClosing && !hasClosingTimePassed && (
          <Alert>
            <AlertTitle className="text-sm">{t("predict.waiting_for_closing")}</AlertTitle>
            <AlertDescription className="text-xs">
              {t("predict.market_closes_at", {
                time: new Date(closingTime * 1000).toLocaleString(),
              })}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </Card>
  );
};
