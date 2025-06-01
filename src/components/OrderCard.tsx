import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatUnits, parseUnits, encodeFunctionData } from "viem";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { Loader2, ExternalLink, Clock, User, ArrowRight } from "lucide-react";
import { Order } from "./OrdersPage";
import { ETH_TOKEN } from "@/lib/coins";
import { useAllCoins } from "@/hooks/metadata/use-all-coins";
import { TokenImage } from "./TokenImage";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { CoinsAbi, CoinsAddress } from "@/constants/Coins";
import { mainnet } from "viem/chains";
import { handleWalletError } from "@/lib/errors";

interface OrderCardProps {
  order: Order;
  currentUser?: string;
  onOrderFilled: () => void;
}

export const OrderCard = ({ order, currentUser, onOrderFilled }: OrderCardProps) => {
  const { t } = useTranslation();
  const { address } = useAccount();
  const { tokens } = useAllCoins();
  const [fillAmount, setFillAmount] = useState("");
  const [txError, setTxError] = useState<string | null>(null);

  const { sendTransactionAsync, isPending } = useSendTransaction();
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // Parse order data
  const tokenInId = order.idIn === "0" ? null : BigInt(order.idIn);
  const tokenOutId = order.idOut === "0" ? null : BigInt(order.idOut);

  const tokenIn = tokenInId === null ? ETH_TOKEN : tokens.find((t) => t.id === tokenInId);
  const tokenOut = tokenOutId === null ? ETH_TOKEN : tokens.find((t) => t.id === tokenOutId);

  const amtIn = BigInt(order.amtIn);
  const amtOut = BigInt(order.amtOut);
  const inDone = BigInt(order.inDone);
  const outDone = BigInt(order.outDone);

  // Calculate progress and remaining amounts
  const progress = amtOut > 0n ? Number((outDone * 100n) / amtOut) : 0;
  const remainingOut = amtOut - outDone;
  const remainingIn = amtIn - inDone;

  // Check if order is expired
  const deadline = new Date(order.deadline);
  const isExpired = deadline < new Date();
  const isOwnOrder = currentUser && order.maker.toLowerCase() === currentUser.toLowerCase();
  const canFill = !isOwnOrder && order.status === "ACTIVE" && !isExpired && remainingOut > 0n;

  // Calculate exchange rate
  const rate = useMemo(() => {
    if (amtIn === 0n || amtOut === 0n) return 0;

    const inDecimals = tokenIn?.decimals || 18;
    const outDecimals = tokenOut?.decimals || 18;

    const inAmount = Number(formatUnits(amtIn, inDecimals));
    const outAmount = Number(formatUnits(amtOut, outDecimals));

    return outAmount / inAmount;
  }, [amtIn, amtOut, tokenIn?.decimals, tokenOut?.decimals]);

  // Calculate max fillable amount
  const maxFillOut = remainingOut;

  const handleFillOrder = async () => {
    if (!address || !tokenIn || !tokenOut) return;

    try {
      setTxError(null);

      // Parse fill amount
      const outDecimals = tokenOut.decimals || 18;
      const fillAmountBigInt = parseUnits(fillAmount || "0", outDecimals);

      if (fillAmountBigInt === 0n || fillAmountBigInt > maxFillOut) {
        setTxError("Invalid fill amount");
        return;
      }

      // Calculate corresponding input amount
      const fillInAmount = (amtIn * fillAmountBigInt) / amtOut;

      const calls: Array<{
        to: `0x${string}`;
        data: `0x${string}`;
        value?: bigint;
      }> = [];

      // For ETH orders, send ETH value
      const value = tokenInId === null ? fillInAmount : 0n;

      // If filling with tokens (not ETH), may need operator approval
      if (tokenInId !== null) {
        // Check if we need to set operator approval
        // This would require checking current approval status
        // For now, we'll include it as it's safer
        const approvalData = encodeFunctionData({
          abi: CoinsAbi,
          functionName: "setOperator",
          args: [CookbookAddress, true],
        });

        calls.push({
          to: CoinsAddress,
          data: approvalData,
        });
      }

      // Encode fillOrder call
      const fillOrderData = encodeFunctionData({
        abi: CookbookAbi,
        functionName: "fillOrder",
        args: [
          order.maker as `0x${string}`,
          order.tokenIn as `0x${string}`,
          BigInt(order.idIn),
          BigInt(order.amtIn),
          order.tokenOut as `0x${string}`,
          BigInt(order.idOut),
          BigInt(order.amtOut),
          BigInt(Math.floor(new Date(order.deadline).getTime() / 1000)),
          order.partialFill,
          fillAmountBigInt,
        ],
      });

      calls.push({
        to: CookbookAddress,
        data: fillOrderData,
        value,
      });

      // Execute calls sequentially
      for (const call of calls) {
        const hash = await sendTransactionAsync({
          to: call.to,
          data: call.data,
          value: call.value,
          chainId: mainnet.id,
        });

        if (call === calls[calls.length - 1]) {
          setTxHash(hash);
        }
      }
    } catch (error) {
      console.error("Fill order error:", error);
      const errorMsg = handleWalletError(error);
      setTxError(errorMsg || "Failed to fill order");
    }
  };

  // Handle successful transaction
  if (isSuccess && txHash) {
    setTimeout(() => {
      setTxHash(undefined);
      setFillAmount("");
      onOrderFilled();
    }, 2000);
  }

  return (
    <Card className="border border-primary/20 hover:border-primary/40 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge
              variant={order.status === "ACTIVE" ? "default" : "secondary"}
              className={
                order.status === "ACTIVE"
                  ? "bg-green-500/20 text-green-600 border-green-500/30"
                  : "bg-gray-500/20 text-gray-600 border-gray-500/30"
              }
            >
              {t(`orders.${order.status.toLowerCase()}`)}
            </Badge>
            {isExpired && (
              <Badge variant="destructive" className="bg-red-500/20 text-red-600 border-red-500/30">
                {t("orders.expired")}
              </Badge>
            )}
            {order.partialFill && (
              <Badge variant="outline" className="text-xs">
                {t("orders.partial_fill")}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            <span className="font-mono">
              {order.maker.slice(0, 6)}...{order.maker.slice(-4)}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Token Swap Display */}
        <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-primary/10">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {tokenIn && <TokenImage token={tokenIn} />}
              <div>
                <div className="font-medium">
                  {formatUnits(remainingIn, tokenIn?.decimals || 18).slice(0, 10)} {tokenIn?.symbol || "ETH"}
                </div>
                <div className="text-xs text-muted-foreground">{t("orders.token_in")}</div>
              </div>
            </div>
          </div>

          <ArrowRight className="h-4 w-4 text-muted-foreground" />

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="font-medium">
                {formatUnits(remainingOut, tokenOut?.decimals || 18).slice(0, 10)} {tokenOut?.symbol || "ETH"}
              </div>
              <div className="text-xs text-muted-foreground">{t("orders.token_out")}</div>
            </div>
            {tokenOut && <TokenImage token={tokenOut} />}
          </div>
        </div>

        {/* Order Details */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">{t("orders.rate")}</div>
            <div className="font-medium">
              1 {tokenIn?.symbol || "ETH"} = {rate.toFixed(6)} {tokenOut?.symbol || "ETH"}
            </div>
          </div>

          <div>
            <div className="text-muted-foreground">{t("orders.deadline")}</div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span className={isExpired ? "text-red-500" : ""}>
                {deadline.toLocaleDateString()} {deadline.toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        {order.status === "ACTIVE" && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("orders.fill_progress")}</span>
              <span>{progress.toFixed(1)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="text-xs text-muted-foreground">
              {formatUnits(outDone, tokenOut?.decimals || 18).slice(0, 8)} /{" "}
              {formatUnits(amtOut, tokenOut?.decimals || 18).slice(0, 8)} {tokenOut?.symbol || "ETH"}{" "}
              {t("orders.filled")}
            </div>
          </div>
        )}

        {/* Fill Interface */}
        {canFill && address && (
          <div className="border-t border-primary/10 pt-4 space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("orders.fill_amount")}</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="0.0"
                  value={fillAmount}
                  onChange={(e) => setFillAmount(e.target.value)}
                  className="flex-1 px-3 py-2 bg-background border border-primary/20 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  max={formatUnits(maxFillOut, tokenOut?.decimals || 18)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFillAmount(formatUnits(maxFillOut, tokenOut?.decimals || 18))}
                >
                  {t("orders.max_fill")}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                Max: {formatUnits(maxFillOut, tokenOut?.decimals || 18).slice(0, 10)} {tokenOut?.symbol || "ETH"}
              </div>
            </div>

            <Button
              onClick={handleFillOrder}
              disabled={!fillAmount || isPending || parseFloat(fillAmount) <= 0}
              className="w-full"
            >
              {isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("orders.filling")}
                </span>
              ) : (
                t("orders.fill_order")
              )}
            </Button>

            {txError && (
              <div className="text-sm text-destructive bg-destructive/10 p-2 rounded border border-destructive/20">
                {txError}
              </div>
            )}

            {isSuccess && (
              <div className="text-sm text-green-600 bg-green-500/10 p-2 rounded border border-green-500/20">
                {t("orders.fill_success")}
              </div>
            )}
          </div>
        )}

        {/* Transaction Link */}
        <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-primary/10 pt-3">
          <span>
            {t("orders.created_at")}: {new Date(order.createdAt).toLocaleDateString()}
          </span>
          <a
            href={`https://etherscan.io/tx/${order.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-primary transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            {t("orders.view_on_explorer")}
          </a>
        </div>
      </CardContent>
    </Card>
  );
};
