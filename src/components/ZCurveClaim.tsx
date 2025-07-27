import { useTranslation } from "react-i18next";
import { formatEther } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { zCurveAbi, zCurveAddress } from "@/constants/zCurve";
import { useZCurveSale, useZCurveBalance } from "@/hooks/use-zcurve-sale";
import { handleWalletError, isUserRejectionError } from "@/lib/errors";

interface ZCurveClaimProps {
  coinId: string;
  coinSymbol?: string;
}

export function ZCurveClaim({ coinId, coinSymbol = "TOKEN" }: ZCurveClaimProps) {
  const { t } = useTranslation();
  const { address } = useAccount();

  const { data: sale } = useZCurveSale(coinId);
  const { data: userBalance, refetch: refetchBalance } = useZCurveBalance(coinId, address);

  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const { isSuccess: txSuccess } = useWaitForTransactionReceipt({
    hash,
    onReplaced: () => {
      refetchBalance();
    },
  });

  const handleClaim = async () => {
    if (!userBalance || BigInt(userBalance.balance) === BigInt(0)) return;

    try {
      writeContract({
        address: zCurveAddress,
        abi: zCurveAbi,
        functionName: "claim",
        args: [BigInt(coinId), BigInt(userBalance.balance)],
      });

      toast.info(t("claim.initiated", "Claim transaction initiated"));
    } catch (error) {
      console.error("Claim error:", error);

      if (isUserRejectionError(error)) {
        toast.error(t("claim.cancelled", "Claim cancelled"));
      } else {
        const errorMessage = handleWalletError(error, { t });
        toast.error(errorMessage || t("claim.failed", "Failed to claim tokens"));
      }
    }
  };

  // Don't show if sale isn't finalized or user has no balance
  if (sale?.status !== "FINALIZED" || !userBalance || BigInt(userBalance.balance) === BigInt(0)) {
    return null;
  }

  const claimableAmount = BigInt(userBalance.balance);
  const totalPurchased = BigInt(userBalance.totalPurchased);
  const totalClaimed = BigInt(userBalance.totalClaimed);

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-lg">🎉</span>
          {t("claim.title", "Claim Your Tokens")}
        </CardTitle>
        <CardDescription>
          {t("claim.description", "The sale has finalized. You can now claim your tokens.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("claim.claimable", "Claimable")}</span>
            <span className="font-bold text-lg">
              {formatEther(claimableAmount)} {coinSymbol}
            </span>
          </div>

          {totalClaimed > 0n && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("claim.already_claimed", "Already Claimed")}</span>
              <span>
                {formatEther(totalClaimed)} {coinSymbol}
              </span>
            </div>
          )}

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("claim.total_purchased", "Total Purchased")}</span>
            <span>
              {formatEther(totalPurchased)} {coinSymbol}
            </span>
          </div>
        </div>

        <Button
          onClick={handleClaim}
          disabled={!address || isPending || claimableAmount === BigInt(0)}
          className="w-full"
          size="lg"
        >
          {!address
            ? t("common.connect_wallet", "Connect Wallet")
            : isPending
              ? t("common.processing", "Processing...")
              : t("claim.claim_tokens", "Claim Tokens")}
        </Button>

        {/* Success Message */}
        {txSuccess && (
          <Alert className="border-green-200 bg-green-50">
            <AlertTitle className="text-green-800">{t("claim.success_title", "Success!")}</AlertTitle>
            <AlertDescription className="text-green-700">
              {t("claim.success_message", "Your tokens have been claimed successfully.")}
            </AlertDescription>
          </Alert>
        )}

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
