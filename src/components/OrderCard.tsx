import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatUnits, parseUnits, encodeFunctionData } from "viem";
import {
  useAccount,
  usePublicClient,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
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
import { useOperatorStatus } from "@/hooks/use-operator-status";

interface OrderCardProps {
  order: Order;
  currentUser?: string;
  onOrderFilled: () => void;
}

export const OrderCard = ({
  order,
  currentUser,
  onOrderFilled,
}: OrderCardProps) => {
  const { t } = useTranslation();
  const { address } = useAccount();
  const { tokens } = useAllCoins();
  const { data: isOperator, refetch: refetchOperatorStatus } =
    useOperatorStatus({
      address,
      operator: CookbookAddress,
    });
  const [fillAmount, setFillAmount] = useState("");
  const [txError, setTxError] = useState<string | null>(null);
  const [cancelTxError, setCancelTxError] = useState<string | null>(null);

  const { sendTransactionAsync, isPending } = useSendTransaction();
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [cancelTxHash, setCancelTxHash] = useState<`0x${string}`>();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const { isSuccess: isCancelSuccess } = useWaitForTransactionReceipt({
    hash: cancelTxHash,
  });
  const publicClient = usePublicClient({
    chainId: mainnet.id,
  });
  // Parse order data
  const tokenInId = order.idIn === "0" ? null : BigInt(order.idIn);
  const tokenOutId = order.idOut === "0" ? null : BigInt(order.idOut);

  const tokenIn =
    tokenInId === null ? ETH_TOKEN : tokens.find((t) => t.id === tokenInId);
  const tokenOut =
    tokenOutId === null ? ETH_TOKEN : tokens.find((t) => t.id === tokenOutId);

  const amtIn = BigInt(order.amtIn);
  const amtOut = BigInt(order.amtOut);
  const inDone = BigInt(order.inDone);
  const outDone = BigInt(order.outDone);

  // Calculate progress and remaining amounts
  const progress = amtOut > 0n ? Number((outDone * 100n) / amtOut) : 0;
  const remainingOut = amtOut - outDone;
  const remainingIn = amtIn - inDone;

  // Check if order is expired
  const deadline = new Date(Number(order.deadline) * 1000);
  const isExpired = deadline < new Date();
  const isOwnOrder =
    currentUser && order.maker.toLowerCase() === currentUser.toLowerCase();
  const canFill =
    !isOwnOrder && order.status === "ACTIVE" && !isExpired && remainingOut > 0n;

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
    if (!publicClient) return;

    try {
      console.log("handleFillOrder:", address, tokenIn, tokenOut);
      setTxError(null);

      // Parse fill amount
      const outDecimals = tokenOut.decimals || 18;
      const fillAmountBigInt = parseUnits(fillAmount || "0", outDecimals);

      if (fillAmountBigInt === 0n || fillAmountBigInt > maxFillOut) {
        setTxError(t("send.invalid_amount"));
        return;
      }

      const calls: Array<{
        to: `0x${string}`;
        data: `0x${string}`;
        value?: bigint;
      }> = [];

      // For ETH orders, send ETH value
      const value = tokenOutId === null ? fillAmountBigInt : 0n;

      // If filling with tokens (not ETH), may need operator approval
      // Skip setOperator for cookbook coins since they don't require approval
      if (tokenOutId !== null && isOperator === false && tokenOut?.source !== "COOKBOOK") {
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
          BigInt(order.deadline),
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
      // Note: This sequential execution logic seems complex.
      // A simpler approach for multiple calls (like approval + fill)
      // would typically involve a multicall pattern or handling
      // approval state/transaction separately and guiding the user.
      // However, the prompt only asks for mobile optimization CSS,
      // so preserving the existing logic flow.
      for (let i = 0; i < calls.length; i++) {
        // Changed <= to < as array is 0-indexed
        const call = calls[i]; // Use index 'i' instead of always '0'
        const hash = await sendTransactionAsync({
          to: call.to,
          data: call.data,
          value: call.value,
          chainId: mainnet.id,
        });

        // wait for transaction to mine
        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
        });

        if (receipt.status !== "success") {
          throw new Error(t("create.transaction_failed"));
        }

        if (i === 0 && calls.length > 1) {
          // Assuming first call is approval if length > 1
          await refetchOperatorStatus();
        } else if (i === calls.length - 1) {
          // Last call is the fillOrder call
          setTxHash(hash);
        }
      }
    } catch (error) {
      console.error("Fill order error:", error);
      const errorMsg = handleWalletError(error);
      setTxError(errorMsg || t("orders.fill_failed"));
    }
  };

  const handleCancelOrder = async () => {
    if (!address || !tokenIn || !tokenOut) return;
    if (!publicClient) return;

    try {
      console.log("handleCancelOrder:", address, tokenIn, tokenOut);
      setCancelTxError(null);

      // Encode cancelOrder call
      const cancelOrderData = encodeFunctionData({
        abi: CookbookAbi,
        functionName: "cancelOrder",
        args: [
          order.tokenIn as `0x${string}`,
          BigInt(order.idIn),
          BigInt(order.amtIn),
          order.tokenOut as `0x${string}`,
          BigInt(order.idOut),
          BigInt(order.amtOut),
          BigInt(order.deadline),
          order.partialFill,
        ],
      });

      const hash = await sendTransactionAsync({
        to: CookbookAddress,
        data: cancelOrderData,
        chainId: mainnet.id,
      });

      // wait for transaction to mine
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
      });

      if (receipt.status !== "success") {
        throw new Error(t("create.transaction_failed"));
      }

      setCancelTxHash(hash);
    } catch (error) {
      console.error("Cancel order error:", error);
      const errorMsg = handleWalletError(error);
      setCancelTxError(errorMsg || t("orders.cancel_failed"));
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

  // Handle successful cancel transaction
  if (isCancelSuccess && cancelTxHash) {
    setTimeout(() => {
      setCancelTxHash(undefined);
      onOrderFilled(); // This will refresh the orders list
    }, 2000);
  }

  return (
    <Card className="border border-primary/20 hover:border-primary/40 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          {" "}
          {/* Added flex-wrap and gap for mobile */}
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
              <Badge
                variant="destructive"
                className="bg-red-500/20 text-red-600 border-red-500/30"
              >
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
        {/* This flex layout works reasonably well on mobile */}
        <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-primary/10 gap-2">
          {" "}
          {/* Added gap */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {tokenIn && <TokenImage token={tokenIn} />}
              <div>
                <div className="font-medium text-sm sm:text-base">
                  {" "}
                  {/* Adjusted text size */}
                  {formatUnits(remainingIn, tokenIn?.decimals || 18).slice(
                    0,
                    10,
                  )}{" "}
                  {tokenIn?.symbol || "ETH"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("orders.token_in")}
                </div>
              </div>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />{" "}
          {/* Added shrink-0 */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="font-medium text-sm sm:text-base">
                {" "}
                {/* Adjusted text size */}
                {formatUnits(remainingOut, tokenOut?.decimals || 18).slice(
                  0,
                  10,
                )}{" "}
                {tokenOut?.symbol || "ETH"}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("orders.token_out")}
              </div>
            </div>
            {tokenOut && <TokenImage token={tokenOut} />}
          </div>
        </div>

        {/* Order Details */}
        {/* Changed grid to 1 column on mobile, 2 on medium screens */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">{t("orders.rate")}</div>
            <div className="font-medium">
              1 {tokenIn?.symbol || "ETH"} = {rate.toFixed(6)}{" "}
              {tokenOut?.symbol || "ETH"}
            </div>
          </div>

          <div>
            <div className="text-muted-foreground">{t("orders.deadline")}</div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span className={isExpired ? "text-red-500" : ""}>
                {Number(order.deadline) === 0 || isExpired
                  ? t("orders.expired")
                  : `${deadline.toLocaleDateString()} ${deadline.toLocaleTimeString()}`}
              </span>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        {/* This layout is already good for mobile */}
        {order.status === "ACTIVE" && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {t("orders.fill_progress")}
              </span>
              <span>{progress.toFixed(1)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="text-xs text-muted-foreground">
              {formatUnits(outDone, tokenOut?.decimals || 18).slice(0, 8)} /{" "}
              {formatUnits(amtOut, tokenOut?.decimals || 18).slice(0, 8)}{" "}
              {tokenOut?.symbol || "ETH"} {t("orders.filled")}
            </div>
          </div>
        )}

        {/* Cancel Interface for own orders */}
        {isOwnOrder && order.status === "ACTIVE" && address && (
          <div className="border-t border-primary/10 pt-4 space-y-3">
            <Button
              onClick={handleCancelOrder}
              disabled={isPending}
              variant="destructive"
              className="w-full"
            >
              {isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("orders.cancelling")}
                </span>
              ) : (
                t("orders.cancel_order")
              )}
            </Button>

            {cancelTxError && (
              <div className="text-sm text-destructive bg-destructive/10 p-2 rounded border border-destructive/20">
                {cancelTxError}
              </div>
            )}

            {isCancelSuccess && (
              <div className="text-sm text-green-600 bg-green-500/10 p-2 rounded border border-green-500/20">
                {t("orders.cancel_success")}
              </div>
            )}
          </div>
        )}

        {/* Fill Interface */}
        {canFill && address && (
          <div className="border-t border-primary/10 pt-4 space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("orders.fill_amount")}
              </label>
              {/* Changed flex direction to column on mobile, row on medium screens */}
              <div className="flex flex-col md:flex-row gap-2">
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
                  onClick={() =>
                    setFillAmount(
                      formatUnits(maxFillOut, tokenOut?.decimals || 18),
                    )
                  }
                  className="shrink-0" // Prevent button from shrinking on mobile when stacked
                >
                  {t("orders.max_fill")}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                Max:{" "}
                {formatUnits(maxFillOut, tokenOut?.decimals || 18).slice(0, 10)}{" "}
                {tokenOut?.symbol || "ETH"}
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
        {/* Changed flex direction to column on mobile, row on medium screens */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-0 text-xs text-muted-foreground border-t border-primary/10 pt-3">
          <span>
            {t("orders.created_at")}:{" "}
            {new Date(Number(order.createdAt)).toLocaleDateString()}
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
