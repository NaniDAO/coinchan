import { Link } from "@tanstack/react-router";
import { CheckIcon, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { encodeFunctionData, formatEther, formatUnits, parseUnits, type Address } from "viem";
import { mainnet } from "viem/chains";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSendCalls,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useReadContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { PoolSwapChart } from "@/PoolSwapChart";
import { FlipActionButton } from "@/components/FlipActionButton";
import { NetworkError } from "@/components/NetworkError";
import { SwapPanel } from "@/components/SwapPanel";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { CoinsAbi, CoinsAddress } from "@/constants/Coins";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { useTokenSelection } from "@/contexts/TokenSelectionContext";
import { useAllCoins } from "@/hooks/metadata/use-all-coins";
import { useBatchingSupported } from "@/hooks/use-batching-supported";
import { HARDCODED_ADDR, type TokenMeta } from "@/lib/coins";
import { handleWalletError, isUserRejectionError } from "@/lib/errors";
import { cn, formatNumber } from "@/lib/utils";
import { SwapController } from "@/components/SwapController";

interface Props {
  lockedTokens?: {
    sellToken: TokenMeta;
    buyToken: TokenMeta;
  };
}

export const LimitSwapAction = ({ lockedTokens }: Props) => {
  const { t } = useTranslation();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const { tokens, isEthBalanceFetching } = useAllCoins();
  const queryClient = useQueryClient();

  // amounts
  const [sellAmt, setSellAmt] = useState("");
  const [buyAmt, setBuyAmt] = useState("");
  const [lastEditedField, setLastEditedField] = useState<"sell" | "buy">("sell");

  // selection (context unless locked)
  const tokenSelectionContext = useTokenSelection();
  const {
    sellToken: contextSellToken,
    buyToken: contextBuyToken,
    setSellToken: contextSetSellToken,
    setBuyToken: contextSetBuyToken,
    flipTokens: contextFlipTokens,
  } = tokenSelectionContext;

  const sellToken = lockedTokens?.sellToken || contextSellToken;
  const buyToken = lockedTokens?.buyToken || contextBuyToken;
  const setSellToken = lockedTokens ? () => {} : contextSetSellToken;
  const setBuyToken = lockedTokens ? () => {} : contextSetBuyToken;
  const flipTokens = lockedTokens ? () => {} : contextFlipTokens;

  // order settings
  const [partialFill, setPartialFill] = useState(false);
  const [deadline, setDeadline] = useState(2); // days

  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);
  const { sendTransactionAsync, isPending, error: writeError } = useSendTransaction();
  const { sendCalls } = useSendCalls();
  const isBatchingSupported = useBatchingSupported();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const prevPairRef = useRef<string | null>(null);
  const memoizedTokens = useMemo(() => tokens, [tokens]);

  // operator needed?
  const { data: isOperator } = useReadContract({
    address: CoinsAddress,
    abi: CoinsAbi,
    functionName: "isOperator",
    args: address ? [address, CookbookAddress] : undefined,
    chainId: mainnet.id,
    query: {
      enabled: !!address && sellToken.id !== null,
    },
  });

  // basic token/effect bootstraps
  useEffect(() => {
    setTxHash(undefined);
    setTxError(null);
    setSellAmt("");
    setBuyAmt("");
  }, [sellToken.id, buyToken?.id, sellToken?.symbol, buyToken?.symbol]);

  useEffect(() => {
    if (tokens.length && sellToken.id === null) {
      const ethToken = tokens.find((t) => t.id === null);
      if (ethToken) setSellToken(ethToken);
    }
  }, [tokens]);

  useEffect(() => {
    if (!buyToken && tokens.length > 1) setBuyToken(tokens[1]);
  }, [tokens, buyToken]);

  const syncFromBuy = (val: string) => {
    setBuyAmt(val);
    setLastEditedField("buy");
  };
  const syncFromSell = (val: string) => {
    setSellAmt(val);
    setLastEditedField("sell");
  };

  // limit order creation
  const createOrder = async () => {
    try {
      if (!isConnected || !address || !buyToken || !sellAmt || !buyAmt) {
        setTxError(t("swap.enter_amount"));
        return;
      }
      setTxError(null);
      if (chainId !== mainnet.id) {
        setTxError(t("errors.network_error"));
        return;
      }
      const deadlineSeconds = Math.floor(Date.now() / 1000) + deadline * 24 * 60 * 60;

      const CULT_ADDRESS = HARDCODED_ADDR.CULT;
      const ENS_ADDRESS = HARDCODED_ADDR.ENS;
      const isCULT = (token: TokenMeta) => token.symbol === "CULT";
      const isENS = (token: TokenMeta) => token.isCustomPool && token.symbol === "ENS";

      const tokenInAddress =
        sellToken.id === null
          ? HARDCODED_ADDR.ETH
          : isCULT(sellToken)
            ? CULT_ADDRESS
            : isENS(sellToken)
              ? ENS_ADDRESS
              : sellToken.id < 1000000n
                ? (CookbookAddress as Address)
                : (CoinsAddress as Address);

      const tokenOutAddress =
        buyToken.id === null
          ? HARDCODED_ADDR.ETH
          : isCULT(buyToken)
            ? CULT_ADDRESS
            : isENS(buyToken)
              ? ENS_ADDRESS
              : buyToken.id < 1000000n
                ? (CookbookAddress as Address)
                : (CoinsAddress as Address);

      const idIn = isCULT(sellToken) || isENS(sellToken) ? 0n : sellToken.id || 0n;
      const idOut = isCULT(buyToken) || isENS(buyToken) ? 0n : buyToken.id || 0n;

      const sellTokenDecimals = sellToken.decimals || 18;
      const buyTokenDecimals = buyToken.decimals || 18;
      const amtIn = parseUnits(sellAmt, sellTokenDecimals);
      const amtOut = parseUnits(buyAmt, buyTokenDecimals);
      const value = sellToken.id === null ? amtIn : 0n;

      const calls: Array<{
        to: `0x${string}`;
        data: `0x${string}`;
        value?: bigint;
      }> = [];

      if (sellToken.id !== null && sellToken.id >= 1000000n && !isCULT(sellToken) && !isENS(sellToken) && !isOperator) {
        const approvalData = encodeFunctionData({
          abi: CoinsAbi,
          functionName: "setOperator",
          args: [CookbookAddress, true],
        });
        calls.push({ to: CoinsAddress as `0x${string}`, data: approvalData });
      }

      const makeOrderData = encodeFunctionData({
        abi: CookbookAbi,
        functionName: "makeOrder",
        args: [tokenInAddress, idIn, amtIn, tokenOutAddress, idOut, amtOut, BigInt(deadlineSeconds), partialFill],
      });

      calls.push({
        to: CookbookAddress as `0x${string}`,
        data: makeOrderData,
        value,
      });

      if (calls.length === 1) {
        let orderHash: `0x${string}`;
        try {
          orderHash = await sendTransactionAsync({
            to: calls[0].to,
            data: calls[0].data,
            value: calls[0].value,
            account: address,
            chainId: mainnet.id,
          });
        } catch (e: any) {
          throw e;
        }
        const receipt = await publicClient!.waitForTransactionReceipt({
          hash: orderHash,
        });
        if (receipt.status === "success") {
          setTxHash(orderHash);
          // Invalidate recommendations cache after successful swap
          queryClient.invalidateQueries({ queryKey: ["recommendations"] });
        } else throw new Error("Transaction failed");
      } else {
        if (isBatchingSupported) {
          sendCalls({ calls });
        } else {
          for (const call of calls) {
            const hash = await sendTransactionAsync({
              to: call.to,
              value: call.value,
              data: call.data,
              chainId: mainnet.id,
            });
            const receipt = await publicClient!.waitForTransactionReceipt({
              hash,
            });
            if (receipt.status === "success") {
              if (call === calls[calls.length - 1]) {
                setTxHash(hash);
                // Invalidate recommendations cache after successful swap
                queryClient.invalidateQueries({ queryKey: ["recommendations"] });
              }
            } else {
              throw new Error("Transaction failed");
            }
          }
        }
      }
    } catch (err: unknown) {
      const errorMsg = handleWalletError(err);
      if (errorMsg) setTxError(errorMsg);
    }
  };

  const handleFlipTokens = () => {
    if (!buyToken) return;
    if (txError) setTxError(null);
    setSellAmt("");
    setBuyAmt("");
    setLastEditedField("sell");
    flipTokens();
    if (address && isConnected) {
      sessionStorage.setItem("lastConnectedAddress", address);
    }
  };

  const handleBuyTokenSelect = useCallback(
    (token: TokenMeta) => {
      if (txError) setTxError(null);
      setSellAmt("");
      setBuyAmt("");
      setLastEditedField("buy");
      setBuyToken(token);
    },
    [txError],
  );

  const handleSellTokenSelect = useCallback(
    (token: TokenMeta) => {
      if (txError) setTxError(null);
      setSellAmt("");
      setBuyAmt("");
      setLastEditedField("sell");
      setSellToken(token);
    },
    [txError],
  );

  return (
    <div className="relative w-full flex flex-col">
      {/* Optional controller line input */}
      <SwapController
        onAmountChange={(sellAmount) => {
          setSellAmt(sellAmount);
          setLastEditedField("sell");
        }}
        currentSellToken={sellToken}
        currentBuyToken={buyToken ?? undefined}
        currentSellAmount={sellAmt}
        className="rounded-md"
      />

      {/* SELL / FLIP / BUY */}
      <div className="relative flex flex-col">
        <SwapPanel
          title={t("common.sell")}
          selectedToken={sellToken}
          tokens={memoizedTokens}
          onSelect={handleSellTokenSelect}
          isEthBalanceFetching={isEthBalanceFetching}
          amount={sellAmt}
          onAmountChange={syncFromSell}
          showMaxButton={!!(sellToken.balance && (sellToken.balance as bigint) > 0n && lastEditedField === "sell")}
          onMax={() => {
            if (sellToken.id === null) {
              const ethAmount = ((sellToken.balance as bigint) * 99n) / 100n;
              syncFromSell(formatEther(ethAmount));
            } else {
              const decimals = sellToken.decimals || 18;
              syncFromSell(formatUnits(sellToken.balance as bigint, decimals));
            }
          }}
          showPercentageSlider={
            lastEditedField === "sell" || (!!sellToken.balance && (sellToken.balance as bigint) > 0n)
          }
          className="pb-4 rounded-t-2xl"
          readOnly={!!lockedTokens}
        />

        {!lockedTokens && (
          <div className={cn("absolute left-1/2 -translate-x-1/2 top-[50%] z-10")}>
            <FlipActionButton onClick={handleFlipTokens} />
          </div>
        )}

        {buyToken && (
          <SwapPanel
            title={t("common.buy")}
            selectedToken={buyToken}
            tokens={memoizedTokens}
            onSelect={handleBuyTokenSelect}
            isEthBalanceFetching={isEthBalanceFetching}
            amount={buyAmt}
            onAmountChange={syncFromBuy}
            readOnly={!!lockedTokens}
            className="pt-4 rounded-b-2xl"
          />
        )}
      </div>

      {/* Limit settings */}
      <div className="mt-4 p-3 bg-background/50 rounded-lg border border-primary/20">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-foreground">{t("common.order_settings")}</span>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm text-muted-foreground">{t("common.allow_partial_fill")}</label>
            <button
              onClick={() => setPartialFill(!partialFill)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${partialFill ? "bg-primary" : "bg-muted"}`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-background transition-transform ${partialFill ? "translate-x-5" : "translate-x-1"}`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm text-muted-foreground">{t("common.expires_in")}</label>
            <select
              value={deadline}
              onChange={(e) => setDeadline(Number(e.target.value))}
              className="bg-background border border-primary/20 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value={1}>{t("common.one_day")}</option>
              <option value={2}>{t("common.two_days")}</option>
              <option value={7}>{t("common.one_week")}</option>
              <option value={30}>{t("common.one_month")}</option>
            </select>
          </div>
          {sellAmt && buyAmt && buyToken && (
            <div className="pt-2 border-t border-primary/10">
              <div className="text-xs text-muted-foreground">
                Rate: 1 {sellToken.symbol} = {formatNumber(Number.parseFloat(buyAmt) / Number.parseFloat(sellAmt), 6)}{" "}
                {buyToken.symbol}
              </div>
            </div>
          )}
        </div>
      </div>

      <NetworkError message={t("swap.title")} />

      {/* Action button */}
      <button
        onClick={createOrder}
        disabled={!isConnected || !sellAmt || !buyAmt || !buyToken || isPending}
        className={`mt-2 button text-base px-8 py-4 bg-primary text-primary-foreground font-bold rounded-lg transition ${
          !isConnected || !sellAmt || !buyAmt || !buyToken || isPending
            ? "opacity-50 cursor-not-allowed"
            : "hover:scale-105"
        }`}
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <LoadingLogo className="m-0 p-0 h-6 w-6" size="sm" />
            {t("common.loading")}
          </span>
        ) : (
          t("common.create_order")
        )}
      </button>

      {/* Errors */}
      {((writeError && !isUserRejectionError(writeError)) || txError) && (
        <div className="text-sm text-destructive mt-2 bg-background/50 p-2 rounded border border-destructive/20">
          {writeError && !isUserRejectionError(writeError) ? writeError.message : txError}
        </div>
      )}

      {/* Success */}
      {isSuccess && (
        <div className="text-sm text-chart-2 mt-2 flex items-center justify-between bg-background/50 p-2 rounded border border-chart-2/20">
          <div className="flex items-center">
            <CheckIcon className="h-3 w-3 mr-2" />
            {t("swap.order_created")}
          </div>
          <Link
            to="/explore/orders"
            className="flex items-center gap-1 text-chart-2 hover:text-chart-2/80 transition-colors text-xs"
          >
            {t("swap.view_orders")}
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}

      <div className="mt-4 border-t border-primary pt-4">
        <PoolSwapChart buyToken={buyToken} sellToken={sellToken} prevPair={prevPairRef.current} priceImpact={null} />
      </div>
    </div>
  );
};
