import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useReadContract } from "wagmi";
import { ZORG_ADDRESS, ZORG_ABI } from "@/constants/ZORG";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { parseEther, formatEther, zeroAddress } from "viem";

export const JoinDAO = () => {
  const { t } = useTranslation();
  const { address } = useAccount();
  const [shareAmount, setShareAmount] = useState("");

  // Fetch sale config for ETH (address(0))
  const { data: saleConfig } = useReadContract({
    address: ZORG_ADDRESS,
    abi: ZORG_ABI,
    functionName: "sales",
    args: [zeroAddress],
    query: {
      staleTime: 10_000,
    },
  });

  const { writeContract, data: hash } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

  const handleBuyShares = () => {
    if (!shareAmount || Number(shareAmount) <= 0) {
      toast.error(t("dao.enter_share_amount"));
      return;
    }

    if (!saleConfig || !saleConfig[3]) { // active flag
      toast.error(t("dao.sale_not_active"));
      return;
    }

    const shares = parseEther(shareAmount);
    const pricePerShare = saleConfig[0]; // pricePerShare in wei
    const cost = shares * pricePerShare / parseEther("1");
    const maxPay = cost * 11n / 10n; // 10% slippage

    writeContract({
      address: ZORG_ADDRESS,
      abi: ZORG_ABI,
      functionName: "buyShares",
      args: [zeroAddress, shares, maxPay],
      value: cost,
    }, {
      onSuccess: () => {
        toast.success(t("dao.shares_purchased"));
        setShareAmount("");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  };

  const isActive = saleConfig && saleConfig[3]; // active flag
  const pricePerShare = saleConfig ? saleConfig[0] : 0n;
  const cap = saleConfig ? saleConfig[1] : 0n;
  const estimatedCost = shareAmount && pricePerShare
    ? formatEther(parseEther(shareAmount) * pricePerShare / parseEther("1"))
    : "0";

  return (
    <div className="border border-border rounded-lg p-6 bg-card">
      <h3 className="text-lg font-semibold mb-4">{t("dao.join_dao")}</h3>

      {!isActive && (
        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-sm text-yellow-400">
          {t("dao.sale_not_active")}
        </div>
      )}

      {isActive && (
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-2">
              <span>{t("dao.price_per_share")}</span>
              <span className="font-mono">{formatEther(pricePerShare)} ETH</span>
            </div>
            {cap > 0n && (
              <div className="flex justify-between text-xs text-muted-foreground mb-2">
                <span>{t("dao.remaining_shares")}</span>
                <span className="font-mono">{formatEther(cap)}</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              {t("dao.shares_to_buy")}
            </label>
            <input
              type="text"
              value={shareAmount}
              onChange={(e) => setShareAmount(e.target.value)}
              placeholder="1.0"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono"
            />
          </div>

          {shareAmount && Number(shareAmount) > 0 && (
            <div className="p-3 bg-muted rounded text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("dao.estimated_cost")}</span>
                <span className="font-mono font-semibold">{estimatedCost} ETH</span>
              </div>
            </div>
          )}

          <Button
            onClick={handleBuyShares}
            disabled={!address || isConfirming || !shareAmount || Number(shareAmount) <= 0}
            className="w-full"
          >
            {!address ? t("common.connect_wallet") : t("dao.buy_shares")}
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-4">
        {t("dao.buy_shares_note")}
      </p>
    </div>
  );
};
