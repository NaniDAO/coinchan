import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatImageURL } from "@/hooks/metadata";
import type { Order } from "@/components/OrdersPage";
import { isUserRejectionError } from "@/lib/errors";
import { cn, formatBalance } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatUnits, parseUnits } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { ArrowDown } from "lucide-react";
import { ZAMM_TOKEN, VEZAMM_TOKEN } from "@/lib/pools";
import { useFillOrder } from "@/hooks/use-fill-order";
import { useERC6909Balance } from "@/hooks/use-erc6909-balance";

interface RedemptionCardProps {
  order: Order;
  onOrderFilled?: () => void;
}

export function RedemptionCard({ order, onOrderFilled }: RedemptionCardProps) {
  const { t } = useTranslation();
  const publicClient = usePublicClient();
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "confirming" | "success" | "error">("idle");
  const [txError, setTxError] = useState<string | null>(null);

  const { fillOrder } = useFillOrder();

  // Use predefined ZAMM and veZAMM tokens
  const zammToken = ZAMM_TOKEN;
  const veZammToken = VEZAMM_TOKEN;

  // Get user's ZAMM balance (ERC6909 token)
  const { data: zammBalanceRaw } = useERC6909Balance({
    address: address as `0x${string}`,
    tokenAddress: ZAMM_TOKEN.address as `0x${string}`,
    tokenId: ZAMM_TOKEN.id,
    enabled: !!address,
  });

  const zammBalance = zammBalanceRaw as bigint | undefined;

  // Get user's veZAMM balance (ERC6909 token from Cookbook)
  const { data: veZammBalanceRaw } = useERC6909Balance({
    address: address as `0x${string}`,
    tokenAddress: VEZAMM_TOKEN.address as `0x${string}`,
    tokenId: VEZAMM_TOKEN.id,
    enabled: !!address,
  });

  const veZammBalance = veZammBalanceRaw as bigint | undefined;

  // Calculate maximum redeemable amount
  const remainingInOrder = order.amtIn && order.inDone
    ? BigInt(order.amtIn) - BigInt(order.inDone)
    : BigInt(order.amtIn || "0");

  const maxRedeemable = zammBalance && remainingInOrder
    ? (zammBalance < remainingInOrder ? zammBalance : remainingInOrder)
    : 0n;

  // Reset amount when max changes
  useEffect(() => {
    setAmount("");
  }, [maxRedeemable]);

  const handleRedeem = async () => {
    if (!amount) return;

    try {
      setTxStatus("pending");
      setTxError(null);

      const amountWei = parseUnits(amount, 18); // Both ZAMM and veZAMM use 18 decimals

      const hash = await fillOrder.mutateAsync({
        order,
        amount: amountWei,
      });

      if (hash) setTxHash(hash);
      setTxStatus("confirming");

      // Wait for confirmation
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({
          hash: hash as `0x${string}`,
        });
        setTxStatus("success");

        // Reset form and close after success
        setTimeout(() => {
          setAmount("");
          setTxStatus("idle");
          setTxHash(null);
          onOrderFilled?.();
        }, 3000);
      }
    } catch (error: any) {
      if (isUserRejectionError(error)) {
        // User rejected - silently reset state
        setTxStatus("idle");
        setTxHash(null);
      } else {
        console.error("Redemption failed:", error);
        setTxStatus("error");
        setTxError(error?.message || t("common.transaction_failed"));
        setTimeout(() => {
          setTxStatus("idle");
          setTxError(null);
        }, 5000);
      }
    }
  };

  const isOrderExpired = order.deadline && Number(order.deadline) * 1000 < Date.now();
  const isOrderFilled = order.status === "COMPLETED";
  const isOrderCancelled = order.status === "CANCELLED";
  const isOrderAvailable = !isOrderExpired && !isOrderFilled && !isOrderCancelled && remainingInOrder > 0n;

  return (
    <div className="bg-card border-2 border-primary/30 rounded-lg p-4 sm:p-6">
      <h3 className="font-mono font-bold text-lg text-primary mb-4">
        [{t("common.redeem_rewards")}]
      </h3>
      <p className="font-mono text-sm text-muted-foreground mb-6">
        {t("common.redeem_vezamm_for_zamm")}
      </p>

      <div className="space-y-4">
        {/* From Token - veZAMM */}
        <div className="bg-muted/20 border border-border rounded-lg p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="font-mono text-xs text-muted-foreground uppercase">From</span>
            <span className="font-mono text-xs text-muted-foreground">
              {t("common.balance")}: {formatBalance(formatUnits(veZammBalance || 0n, 18), "")}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              {veZammToken.imageUrl && (
                <img
                  src={formatImageURL(veZammToken.imageUrl)}
                  alt={veZammToken.symbol}
                  className="w-8 h-8 rounded-full border-2 border-green-500/40"
                />
              )}
              <span className="font-mono font-bold text-base sm:text-lg text-green-500">{veZammToken.symbol}</span>
            </div>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="w-24 sm:w-32 text-right font-mono font-bold text-sm sm:text-lg bg-transparent border-0 focus:ring-0"
              disabled={!isOrderAvailable || txStatus !== "idle"}
            />
          </div>
          <div className="flex justify-end mt-2 gap-2">
            <button
              onClick={() => setAmount(formatUnits(maxRedeemable, 18))}
              className="font-mono text-xs text-primary hover:text-primary/80 uppercase"
              disabled={!isOrderAvailable || txStatus !== "idle"}
            >
              [MAX]
            </button>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex justify-center">
          <ArrowDown className="w-6 h-6 text-primary" />
        </div>

        {/* To Token - ZAMM */}
        <div className="bg-muted/20 border border-border rounded-lg p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="font-mono text-xs text-muted-foreground uppercase">To</span>
            <div className="flex flex-col sm:flex-row gap-1 sm:gap-4 text-xs font-mono text-muted-foreground text-right sm:text-left">
              <span>{t("common.balance")}: {formatBalance(formatUnits(zammBalance || 0n, 18), "")}</span>
              <span>{t("common.ratio")}: 1:1</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              {zammToken.imageUrl && (
                <img
                  src={formatImageURL(zammToken.imageUrl)}
                  alt={zammToken.symbol}
                  className="w-8 h-8 rounded-full border-2 border-primary/40"
                />
              )}
              <span className="font-mono font-bold text-base sm:text-lg">{zammToken.symbol}</span>
            </div>
            <div className="text-right font-mono font-bold text-sm sm:text-lg">
              {amount || "0.0"}
            </div>
          </div>
        </div>

        {/* Order Status */}
        {!isOrderAvailable && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
            <p className="font-mono text-xs text-yellow-500 text-center">
              {isOrderExpired && t("common.order_expired")}
              {isOrderFilled && t("common.order_filled")}
              {isOrderCancelled && t("common.order_cancelled")}
              {remainingInOrder === 0n && !isOrderFilled && t("common.no_remaining_amount")}
            </p>
          </div>
        )}

        {/* Remaining Amount */}
        {isOrderAvailable && (
          <div className="flex justify-between items-center text-xs font-mono text-muted-foreground">
            <span>{t("common.remaining")}:</span>
            <span>{formatBalance(formatUnits(remainingInOrder, 18), veZammToken.symbol)}</span>
          </div>
        )}

        {/* Transaction Status */}
        {txStatus !== "idle" && (
          <div
            className={cn(
              "border rounded-lg p-4 transition-all duration-300",
              txStatus === "success"
                ? "bg-green-500/10 border-green-500/30"
                : txStatus === "error"
                  ? "bg-red-500/10 border-red-500/30"
                  : "bg-primary/10 border-primary/30",
            )}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2">
                {txStatus === "pending" && (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
                    <span className="font-mono font-bold text-primary">
                      [{t("common.status_pending")}]
                    </span>
                  </>
                )}
                {txStatus === "confirming" && (
                  <>
                    <div className="animate-pulse h-4 w-4 bg-yellow-500 rounded-full"></div>
                    <span className="font-mono font-bold text-yellow-500">
                      [{t("common.status_confirming")}]
                    </span>
                  </>
                )}
                {txStatus === "success" && (
                  <>
                    <div className="h-4 w-4 bg-green-500 rounded-full"></div>
                    <span className="font-mono font-bold text-green-500">
                      [{t("common.status_success")}]
                    </span>
                  </>
                )}
                {txStatus === "error" && (
                  <>
                    <div className="h-4 w-4 bg-red-500 rounded-full"></div>
                    <span className="font-mono font-bold text-red-500">
                      [{t("common.status_error")}]
                    </span>
                  </>
                )}
              </div>

              {txHash && (
                <div className="text-center">
                  <a
                    href={`https://etherscan.io/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-background/50 border border-primary/20 rounded font-mono text-xs hover:bg-primary/10 transition-colors duration-200"
                  >
                    <span className="text-muted-foreground">{t("common.tx_label")}:</span>
                    <span className="text-primary font-bold">
                      {txHash.slice(0, 6)}...{txHash.slice(-4)}
                    </span>
                    <span className="text-muted-foreground">{t("common.external_link")}</span>
                  </a>
                </div>
              )}

              {txError && (
                <div className="text-center">
                  <p className="text-sm text-red-400 font-mono break-words">{txError}</p>
                </div>
              )}

              {txStatus === "success" && (
                <div className="text-center">
                  <p className="text-sm text-green-400 font-mono">
                    {t("common.redemption_successful")}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Redeem Button */}
        <Button
          onClick={handleRedeem}
          disabled={
            !amount ||
            parseFloat(amount) <= 0 ||
            parseUnits(amount || "0", 18) > maxRedeemable ||
            !isOrderAvailable ||
            txStatus !== "idle" ||
            fillOrder.isPending
          }
          className={cn(
            "w-full font-mono font-bold tracking-wide text-lg py-4 hover:scale-105 transition-all duration-200",
            "bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400",
            "shadow-lg disabled:opacity-50 !text-background",
          )}
        >
          [{t("common.redeem")}]
        </Button>
      </div>
    </div>
  );
}