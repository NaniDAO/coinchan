import { Link } from "@tanstack/react-router";
import { CheckIcon, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  encodeFunctionData,
  formatEther,
  formatUnits,
  parseUnits,
  type Address,
} from "viem";
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
import { PoolSwapChart } from "./PoolSwapChart";
import { FlipActionButton } from "./components/FlipActionButton";
import { NetworkError } from "./components/NetworkError";
import { SlippageSettings } from "./components/SlippageSettings";
import { SwapPanel } from "./components/SwapPanel";
import { LoadingLogo } from "./components/ui/loading-logo";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "./components/ui/hover-card";
import { CoinsAbi, CoinsAddress } from "./constants/Coins";
import { CookbookAbi, CookbookAddress } from "./constants/Cookbook";
import { useTokenSelection } from "./contexts/TokenSelectionContext";
import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { useBatchingSupported } from "./hooks/use-batching-supported";
import { useReserves } from "./hooks/use-reserves";
import { useENSResolution } from "./hooks/use-ens-resolution";
import { useETHPrice } from "./hooks/use-eth-price";
import type { TokenMeta } from "./lib/coins";
import { handleWalletError, isUserRejectionError } from "./lib/errors";
import {
  SLIPPAGE_BPS,
  SWAP_FEE,
  analyzeTokens,
  getPoolIds,
  getSwapFee,
} from "./lib/swap";
import { cn, formatNumber } from "./lib/utils";
import { SwapController } from "./components/SwapController";
import {
  buildRoutePlan,
  mainnetConfig,
  findRoute,
  quote,
  simulateRoute,
  erc20Abi,
  zRouterAbi,
} from "zrouter-sdk";

interface SwapActionProps {
  lockedTokens?: {
    sellToken: TokenMeta;
    buyToken: TokenMeta;
  };
}

// Known ERC20 token addresses used by the router
const ADDR: Record<string, Address> = {
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  CULT: "0x0000000000c5dc95539589fbD24BE07c6C14eCa4",
  ENS: "0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72",
  ETH: "0x0000000000000000000000000000000000000000", // Native ETH sentinel
};

function toZRouterToken(token?: TokenMeta) {
  if (!token) return undefined;
  // Native ETH
  if (token.id === null) return { address: ADDR.ETH } as const;

  // Special ERC20s by symbol
  if (token.symbol === "USDT") return { address: ADDR.USDT } as const;
  if (token.symbol === "CULT") return { address: ADDR.CULT } as const;
  if (token.symbol === "ENS") return { address: ADDR.ENS } as const;

  // ERC6909 routing via Cookbook / Coins depending on id range (matches legacy logic)
  if (token.id < 1000000n) {
    return { address: CookbookAddress as Address, id: token.id } as const;
  }
  return { address: CoinsAddress as Address, id: token.id } as const;
}

export const SwapAction = ({ lockedTokens }: SwapActionProps = {}) => {
  const { t } = useTranslation();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const { tokens, isEthBalanceFetching } = useAllCoins();
  const { data: ethPrice } = useETHPrice();

  /* State */
  const [sellAmt, setSellAmt] = useState("");
  const [buyAmt, setBuyAmt] = useState("");
  const [customRecipient, setCustomRecipient] = useState<string>("");
  const [showRecipientInput, setShowRecipientInput] = useState(false);

  // Use shared token selection context, but override with locked tokens if provided
  const tokenSelectionContext = useTokenSelection();
  const {
    sellToken: contextSellToken,
    buyToken: contextBuyToken,
    setSellToken: contextSetSellToken,
    setBuyToken: contextSetBuyToken,
    flipTokens: contextFlipTokens,
  } = tokenSelectionContext;

  // Use locked tokens if provided, otherwise use context
  const sellToken = lockedTokens?.sellToken || contextSellToken;
  const buyToken = lockedTokens?.buyToken || contextBuyToken;
  const setSellToken = lockedTokens ? () => {} : contextSetSellToken;
  const setBuyToken = lockedTokens ? () => {} : contextSetBuyToken;
  const flipTokens = lockedTokens ? () => {} : contextFlipTokens;

  /* Limit order specific state */
  const [swapMode, setSwapMode] = useState<"instant" | "limit">("instant");
  const [partialFill, setPartialFill] = useState(false);
  const [deadline, setDeadline] = useState(2); // days

  /* Track which field was last edited to determine swap intent */
  const [lastEditedField, setLastEditedField] = useState<"sell" | "buy">(
    "sell",
  );

  // ENS resolution for custom recipient
  const ensResolution = useENSResolution(customRecipient);

  const {
    isSellETH,
    isCustom: isCustomPool,
    isCoinToCoin,
    coinId,
    isDirectUsdtEth: isDirectUsdtEthSwap,
    canSwap,
  } = useMemo(() => analyzeTokens(sellToken, buyToken), [sellToken, buyToken]);

  /* Calculate pool reserves (kept for UI stats only) */
  const { mainPoolId } = getPoolIds(sellToken, buyToken, {
    isCustomPool: isCustomPool,
    isCoinToCoin: isCoinToCoin,
  });

  // ENS pool override (legacy UI bits still reference this for info panels)
  const isENSPool = sellToken?.symbol === "ENS" || buyToken?.symbol === "ENS";
  const ensPoolId = isENSPool
    ? 107895081322979037665933919470752294545033231002190305779392467929211865476585n
    : undefined;

  const { data: reserves } = useReserves({
    poolId: isENSPool ? ensPoolId : mainPoolId,
    source: isENSPool
      ? "COOKBOOK"
      : sellToken?.id === null
        ? buyToken?.source
        : sellToken.source,
  });

  const [slippageBps, setSlippageBps] = useState<bigint>(SLIPPAGE_BPS);
  const [priceImpact, setPriceImpact] = useState<{
    currentPrice: number;
    projectedPrice: number;
    impactPercent: number;
    action: "buy" | "sell";
  } | null>(null);

  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);
  const {
    sendTransactionAsync,
    isPending,
    error: writeError,
  } = useSendTransaction();
  const { sendCalls } = useSendCalls();
  const isBatchingSupported = useBatchingSupported();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const prevPairRef = useRef<string | null>(null);

  const memoizedTokens = useMemo(() => tokens, [tokens]);

  // Check operator status for limit orders (needed for non-ETH token sales)
  const { data: isOperator } = useReadContract({
    address: CoinsAddress,
    abi: CoinsAbi,
    functionName: "isOperator",
    args: address ? [address, CookbookAddress] : undefined,
    chainId: mainnet.id,
    query: {
      enabled: !!address && swapMode === "limit" && sellToken.id !== null,
    },
  });

  // Reset UI state when tokens change
  useEffect(() => {
    setTxHash(undefined);
    setTxError(null);
    setSellAmt("");
    setBuyAmt("");
    setCustomRecipient("");
    setShowRecipientInput(false);

    // Keep ENS higher slippage default for safety
    if (sellToken?.symbol === "ENS" || buyToken?.symbol === "ENS") {
      setSlippageBps(1000n); // 10%
    } else {
      setSlippageBps(SLIPPAGE_BPS); // Default 5%
    }
  }, [sellToken.id, buyToken?.id, sellToken?.symbol, buyToken?.symbol]);

  useEffect(() => {
    if (tokens.length && sellToken.id === null /* ETH */) {
      const ethToken = tokens.find((t) => t.id === null);
      if (ethToken) setSellToken(ethToken);
    }
  }, [tokens]);

  useEffect(() => {
    if (!buyToken && tokens.length > 1) {
      setBuyToken(tokens[1]);
    }
  }, [tokens, buyToken]);

  // Reset amounts when switching between instant and limit modes
  useEffect(() => {
    setSellAmt("");
    setBuyAmt("");
    setTxHash(undefined);
    setTxError(null);
    setCustomRecipient("");
    setShowRecipientInput(false);
    setLastEditedField("sell");
  }, [swapMode]);

  // === NEW: quoting via zrouter-sdk ===
  const doQuote = useCallback(
    async (
      params:
        | { side: "EXACT_IN"; raw: string }
        | { side: "EXACT_OUT"; raw: string },
    ) => {
      if (!publicClient || !sellToken || !buyToken)
        return { ok: false as const };
      if (!params.raw || Number.isNaN(Number(params.raw)))
        return { ok: false as const };

      const tokenIn = toZRouterToken(sellToken);
      const tokenOut = toZRouterToken(buyToken);
      if (!tokenIn || !tokenOut) return { ok: false as const };

      try {
        if (params.side === "EXACT_IN") {
          const amountIn = parseUnits(params.raw, sellToken.decimals || 18);
          const res = await quote(publicClient, {
            tokenIn,
            tokenOut,
            amount: amountIn,
            side: "EXACT_IN",
          });
          console.log("Quote", res);
          const out = formatUnits(res.amount, buyToken.decimals || 18);
          return { ok: true as const, amountOut: out, amountIn: params.raw };
        } else {
          const amountOutWanted = parseUnits(
            params.raw,
            buyToken.decimals || 18,
          );
          const res = await quote(publicClient, {
            tokenIn,
            tokenOut,
            amount: amountOutWanted,
            side: "EXACT_OUT",
          });
          const inp = formatUnits(res.amount, sellToken.decimals || 18);
          return { ok: true as const, amountOut: params.raw, amountIn: inp };
        }
      } catch (e) {
        console.error("quote() failed", e);
        return { ok: false as const };
      }
    },
    [publicClient, sellToken, buyToken],
  );

  const syncFromBuy = async (val: string) => {
    setBuyAmt(val);
    setLastEditedField("buy");
    if (swapMode === "limit") return; // instant-only syncing
    const q = await doQuote({ side: "EXACT_OUT", raw: val || "0" });
    if (q.ok) setSellAmt(q.amountIn);
  };

  const syncFromSell = async (val: string) => {
    setSellAmt(val);
    setLastEditedField("sell");
    if (swapMode === "limit") return; // instant-only syncing
    const q = await doQuote({ side: "EXACT_IN", raw: val || "0" });
    if (q.ok) setBuyAmt(q.amountOut);
  };

  // Basic, lightweight price impact estimation using current quote deltas
  useEffect(() => {
    let canceled = false;
    const run = async () => {
      try {
        if (!sellAmt || !Number(sellAmt) || swapMode !== "instant") {
          if (!canceled) setPriceImpact(null);
          return;
        }
        const q = await doQuote({ side: "EXACT_IN", raw: sellAmt });
        if (!q.ok) return;
        const inN = Number(sellAmt);
        const outN = Number(q.amountOut || 0);
        if (!inN || !outN) return;
        // Very rough estimate: assume linear price around the quote
        const unitPriceBefore = outN / inN; // buyToken per sellToken
        const unitPriceAfter = unitPriceBefore * 0.999; // placeholder small slippage visualization
        const impact =
          ((unitPriceAfter - unitPriceBefore) / unitPriceBefore) * 100;
        if (!canceled)
          setPriceImpact({
            currentPrice: unitPriceBefore,
            projectedPrice: unitPriceAfter,
            impactPercent: impact,
            action: isSellETH ? "buy" : "sell",
          });
      } catch (e) {
        if (!canceled) setPriceImpact(null);
      }
    };
    const id = setTimeout(run, 400);
    return () => {
      canceled = true;
      clearTimeout(id);
    };
  }, [sellAmt, swapMode, isSellETH, doQuote]);

  const executeSwap = async () => {
    try {
      if (!isConnected || !address) {
        setTxError(t("errors.wallet_connection"));
        return;
      }
      if (!sellToken || !buyToken || !publicClient) {
        setTxError(t("swap.enter_amount"));
        return;
      }
      if (!sellAmt || (lastEditedField === "buy" && !buyAmt)) {
        setTxError(t("swap.enter_amount"));
        return;
      }
      if (chainId !== mainnet.id) {
        setTxError(t("errors.network_error"));
        return;
      }
      let finalRecipient: Address | undefined;
      if (customRecipient && customRecipient.trim() !== "") {
        if (ensResolution.isLoading) {
          setTxError(t("swap.resolving_ens") || "Resolving ENS name...");
          return;
        }
        if (ensResolution.error) {
          setTxError(ensResolution.error);
          return;
        }
        if (!ensResolution.address) {
          setTxError(
            t("errors.invalid_address") || "Invalid recipient address",
          );
          return;
        }
        finalRecipient = ensResolution.address as Address;
      }

      setTxError(null);

      const tokenIn = toZRouterToken(sellToken);
      const tokenOut = toZRouterToken(buyToken);
      if (!tokenIn || !tokenOut) {
        setTxError(t("errors.unexpected"));
        return;
      }

      const side = lastEditedField === "sell" ? "EXACT_IN" : "EXACT_OUT";
      const raw = lastEditedField === "sell" ? sellAmt : buyAmt;
      const decimals =
        lastEditedField === "sell"
          ? sellToken.decimals || 18
          : buyToken.decimals || 18;
      const amount = parseUnits(raw!, decimals);

      // findRoute now returns Promise<RouteStep[]>
      const steps = await findRoute(publicClient, {
        tokenIn,
        tokenOut,
        side,
        amount,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 10),
        owner: address,
      }).catch((e) => {
        console.error(e);
        return [];
      });

      if (!steps.length) {
        setTxError(t("errors.unexpected") || "No route found");
        return;
      }

      // buildRoutePlan now returns Promise<RoutePlan>
      const plan = await buildRoutePlan(publicClient, {
        owner: address,
        router: mainnetConfig.router,
        steps,
        finalTo: (finalRecipient || (address as Address)) as Address,
      }).catch((e) => {
        console.error(e);
        return undefined;
      });

      if (!plan) {
        setTxError("Failed to build route plan");
        return;
      }

      const { calls, value, approvals } = plan;

      const sim = await simulateRoute(publicClient, {
        router: mainnetConfig.router,
        account: address,
        calls,
        value,
        approvals,
      }).catch((e) => {
        console.error(e);
        return undefined;
      });

      if (!sim) {
        setTxError("Failed to simulate route");
        return;
      }

      // Handle approvals
      for (const approval of approvals ?? []) {
        try {
          const hash = await sendTransactionAsync({
            to:
              approval.kind === "ERC20_APPROVAL"
                ? approval.token.address
                : approval.token.address,
            data:
              approval.kind === "ERC20_APPROVAL"
                ? encodeFunctionData({
                    abi: erc20Abi,
                    functionName: "approve",
                    args: [approval.spender, approval.amount],
                  })
                : encodeFunctionData({
                    abi: CoinsAbi,
                    functionName: "setOperator",
                    args: [approval.operator, approval.approved],
                  }),
            value: 0n,
            chainId: mainnet.id,
            account: address,
          });
          await publicClient.waitForTransactionReceipt({ hash });
        } catch (error: any) {
          if (error?.message?.includes("getChainId is not a function")) {
            console.error("Connector compatibility issue:", error);
            setTxError(t("errors.wallet_connection_refresh"));
            setTimeout(() => window.location.reload(), 2000);
            return;
          }
          throw error;
        }
      }

      let hash: `0x${string}`;
      try {
        hash = await sendTransactionAsync({
          to: mainnetConfig.router,
          data: encodeFunctionData({
            abi: zRouterAbi,
            functionName: "multicall",
            args: [calls],
          }),
          value: value,
          chainId: mainnet.id,
          account: address,
        });
      } catch (error: any) {
        if (error?.message?.includes("getChainId is not a function")) {
          console.error("Connector compatibility issue:", error);
          setTxError(t("errors.wallet_connection_refresh"));
          setTimeout(() => window.location.reload(), 2000);
          return;
        }
        throw error;
      }
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
      });
      if (receipt.status !== "success") {
        throw new Error("Transaction failed");
      }
      setTxHash(hash);
    } catch (err: unknown) {
      console.error("Swap execution error:", err);
      if (
        err &&
        typeof err === "object" &&
        "message" in err &&
        typeof (err as any).message === "string"
      ) {
        const msg = (err as any).message as string;
        if (
          msg.includes("getChainId") ||
          msg.includes("connector") ||
          msg.includes("connection")
        ) {
          setTxError(t("errors.wallet_connection_refresh"));
        } else {
          const m = handleWalletError(err);
          if (m) setTxError(m);
        }
      } else {
        setTxError(t("errors.unexpected"));
      }
    }
  };

  // Limit orders remain as before (Cookbook.makeOrder)
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
      const deadlineSeconds =
        Math.floor(Date.now() / 1000) + deadline * 24 * 60 * 60;

      const CULT_ADDRESS = ADDR.CULT;
      const ENS_ADDRESS = ADDR.ENS;
      const isCULT = (token: TokenMeta) => token.symbol === "CULT";
      const isENS = (token: TokenMeta) =>
        token.isCustomPool && token.symbol === "ENS";

      const tokenInAddress =
        sellToken.id === null
          ? ADDR.ETH
          : isCULT(sellToken)
            ? CULT_ADDRESS
            : isENS(sellToken)
              ? ENS_ADDRESS
              : sellToken.id < 1000000n
                ? (CookbookAddress as Address)
                : (CoinsAddress as Address);
      const tokenOutAddress =
        buyToken.id === null
          ? ADDR.ETH
          : isCULT(buyToken)
            ? CULT_ADDRESS
            : isENS(buyToken)
              ? ENS_ADDRESS
              : buyToken.id < 1000000n
                ? (CookbookAddress as Address)
                : (CoinsAddress as Address);

      const idIn =
        isCULT(sellToken) || isENS(sellToken) ? 0n : sellToken.id || 0n;
      const idOut =
        isCULT(buyToken) || isENS(buyToken) ? 0n : buyToken.id || 0n;

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

      if (
        sellToken.id !== null &&
        sellToken.id >= 1000000n &&
        !isCULT(sellToken) &&
        !isENS(sellToken) &&
        !isOperator
      ) {
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
        args: [
          tokenInAddress,
          idIn,
          amtIn,
          tokenOutAddress,
          idOut,
          amtOut,
          BigInt(deadlineSeconds),
          partialFill,
        ],
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
        } catch (error: any) {
          if (error?.message?.includes("getChainId is not a function")) {
            console.error("Connector compatibility issue:", error);
            setTxError(t("errors.wallet_connection_refresh"));
            setTimeout(() => window.location.reload(), 2000);
            return;
          }
          throw error;
        }
        const receipt = await publicClient!.waitForTransactionReceipt({
          hash: orderHash,
        });
        if (receipt.status === "success") setTxHash(orderHash);
        else throw new Error("Transaction failed");
      } else {
        if (isBatchingSupported) {
          sendCalls({ calls });
        } else {
          for (const call of calls) {
            let hash: `0x${string}`;
            try {
              hash = await sendTransactionAsync({
                to: call.to,
                value: call.value,
                data: call.data,
                chainId: mainnet.id,
              });
            } catch (error: any) {
              if (error?.message?.includes("getChainId is not a function")) {
                console.error("Connector compatibility issue:", error);
                setTxError(t("errors.wallet_connection_refresh"));
                setTimeout(() => window.location.reload(), 2000);
                return;
              }
              throw error;
            }
            const receipt = await publicClient!.waitForTransactionReceipt({
              hash,
            });
            if (receipt.status === "success") {
              if (call === calls[calls.length - 1]) setTxHash(hash);
            } else {
              throw new Error("Transaction failed");
            }
          }
        }
      }
    } catch (err: unknown) {
      console.error("Order creation error:", err);
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
      setLastEditedField("sell");
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
      {/* Terminal Mode Toggle */}
      <div className="flex items-center justify-center mb-4">
        <div className="inline-flex gap-1 border-2 border-border bg-muted p-0.5">
          <button
            onClick={() => setSwapMode("instant")}
            className={`px-3 py-1.5 text-xs font-bold uppercase cursor-pointer transition-all duration-100 font-body hover:opacity-80 focus:ring-2 focus:ring-primary/50 focus:outline-none ${
              swapMode === "instant"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {t("swap.instant")}
          </button>
          <button
            onClick={() => setSwapMode("limit")}
            className={`px-3 py-1.5 text-xs font-bold uppercase cursor-pointer transition-all duration-100 font-body hover:opacity-80 focus:ring-2 focus:ring-primary/50 focus:outline-none ${
              swapMode === "limit"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {t("swap.limit_order")}
          </button>
        </div>
      </div>

      {swapMode === "instant" && (
        <SwapController
          onAmountChange={(sellAmount) => {
            setSellAmt(sellAmount);
            syncFromSell(sellAmount);
          }}
          currentSellToken={sellToken}
          currentBuyToken={buyToken ?? undefined}
          currentSellAmount={sellAmt}
        />
      )}

      {/* SELL + FLIP + BUY panel container */}
      <div className="relative flex flex-col">
        {/* SELL panel */}
        <SwapPanel
          title={t("common.sell")}
          selectedToken={sellToken}
          tokens={memoizedTokens}
          onSelect={handleSellTokenSelect}
          isEthBalanceFetching={isEthBalanceFetching}
          amount={sellAmt}
          onAmountChange={syncFromSell}
          showMaxButton={
            !!(
              sellToken.balance &&
              sellToken.balance > 0n &&
              lastEditedField === "sell"
            )
          }
          onMax={() => {
            if (sellToken.id === null) {
              const ethAmount = ((sellToken.balance as bigint) * 99n) / 100n;
              syncFromSell(formatEther(ethAmount));
            } else {
              const decimals = sellToken.decimals || 18;
              syncFromSell(formatUnits(sellToken.balance as bigint, decimals));
            }
          }}
          showPercentageSlider={lastEditedField === "sell"}
          className="pb-4"
          readOnly={!!lockedTokens}
        />

        {/* FLIP button - absolutely positioned */}
        {!lockedTokens && (
          <div
            className={cn(
              "absolute left-1/2 -translate-x-1/2 z-10",
              !!(sellToken.balance && sellToken.balance > 0n)
                ? "top-[63%]"
                : "top-[50%]",
            )}
          >
            <FlipActionButton onClick={handleFlipTokens} className="" />
          </div>
        )}

        {/* BUY panel */}
        {buyToken && (
          <SwapPanel
            title={t("common.buy")}
            selectedToken={buyToken}
            tokens={memoizedTokens}
            onSelect={handleBuyTokenSelect}
            isEthBalanceFetching={isEthBalanceFetching}
            amount={buyAmt}
            onAmountChange={syncFromBuy}
            className="pt-4"
            readOnly={!!lockedTokens}
          />
        )}
      </div>

      {/* Custom Recipient Input */}
      <div className="mt-3">
        <button
          onClick={() => setShowRecipientInput(!showRecipientInput)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <span>{showRecipientInput ? "▼" : "▶"}</span>
          {t("swap.custom_recipient") || "Custom recipient"}
        </button>

        {showRecipientInput && (
          <div className="mt-2 space-y-2">
            <input
              type="text"
              placeholder={`${t("swap.recipient_address") || "Recipient address or ENS name"} (${t("common.optional") || "optional"})`}
              value={customRecipient}
              onChange={(e) => setCustomRecipient(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {customRecipient && (
              <div className="space-y-1">
                {ensResolution.isLoading && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <LoadingLogo size="sm" className="scale-50" />
                    {t("swap.resolving_ens") || "Resolving ENS name..."}
                  </p>
                )}
                {ensResolution.error && (
                  <p className="text-xs text-destructive">
                    {ensResolution.error}
                  </p>
                )}
                {ensResolution.address && (
                  <p className="text-xs text-muted-foreground">
                    {ensResolution.isENS ? (
                      <>
                        <span className="text-chart-2">ENS:</span>{" "}
                        {customRecipient}{" "}
                        <span className="text-muted-foreground">→</span>{" "}
                        {ensResolution.address?.slice(0, 6)}...
                        {ensResolution.address?.slice(-4)}
                      </>
                    ) : (
                      <>
                        {t("swap.recipient_note") || "Output will be sent to"}:{" "}
                        {ensResolution.address?.slice(0, 6)}...
                        {ensResolution.address?.slice(-4)}
                      </>
                    )}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Network indicator */}
      <NetworkError message={t("swap.title")} />

      {/* Limit Order Settings */}
      {swapMode === "limit" && (
        <div className="mt-4 p-3 bg-background/50 rounded-lg border border-primary/20">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-foreground">
              {t("common.order_settings")}
            </span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm text-muted-foreground">
                {t("common.allow_partial_fill")}
              </label>
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
              <label className="text-sm text-muted-foreground dark:text-gray-300">
                {t("common.expires_in")}
              </label>
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
                <div className="text-xs text-muted-foreground dark:text-gray-300">
                  Rate: 1 {sellToken.symbol} ={" "}
                  {formatNumber(
                    Number.parseFloat(buyAmt) / Number.parseFloat(sellAmt),
                    6,
                  )}{" "}
                  {buyToken.symbol}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slippage info (UI only for now) */}
      {swapMode === "instant" && (
        <SlippageSettings
          setSlippageBps={setSlippageBps}
          slippageBps={slippageBps}
        />
      )}

      {/* Pool information - kept for UI display */}
      {swapMode === "instant" && canSwap && reserves && (
        <div className="text-xs text-foreground px-1 mt-1">
          <div className="flex justify-between">
            {isCoinToCoin &&
            !isDirectUsdtEthSwap &&
            !(
              (sellToken.id === null && buyToken?.symbol === "USDT") ||
              (buyToken?.id === null && sellToken.symbol === "USDT")
            ) ? (
              <span className="flex items-center">
                <span className="bg-chart-5/20 text-chart-5 px-1 rounded mr-1">
                  {t("swap.route")}
                </span>
                {sellToken.symbol} {t("common.to")} ETH {t("common.to")}{" "}
                {buyToken?.symbol}
              </span>
            ) : (
              <span>
                {t("pool.title")}:{" "}
                {formatNumber(parseFloat(formatEther(reserves.reserve0)), 5)}{" "}
                ETH /{" "}
                {formatNumber(
                  parseFloat(
                    formatUnits(
                      reserves.reserve1,
                      isCustomPool
                        ? sellToken.isCustomPool
                          ? sellToken.decimals || 18
                          : buyToken?.decimals || 18
                        : 18,
                    ),
                  ),
                  3,
                )}{" "}
                {coinId
                  ? tokens.find((t) => t.id === coinId)?.symbol || "Token"
                  : buyToken?.symbol}
              </span>
            )}
            <span className="flex items-center gap-2">
              <span>
                {t("common.fee")}:{" "}
                {getSwapFee({
                  isCustomPool,
                  sellToken,
                  buyToken,
                  isCoinToCoin,
                })}
              </span>
              {priceImpact && (
                <span
                  className={`text-xs font-medium ${priceImpact.impactPercent > 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {priceImpact.impactPercent > 0 ? "+" : ""}
                  {priceImpact.impactPercent.toFixed(2)}%
                </span>
              )}
            </span>
          </div>
          {ethPrice?.priceUSD && !isCoinToCoin && (
            <div className="text-muted-foreground mt-1 space-y-0.5">
              {(() => {
                const ethAmount = parseFloat(formatEther(reserves.reserve0));
                const tokenAmount = parseFloat(
                  formatUnits(
                    reserves.reserve1,
                    isCustomPool
                      ? sellToken.isCustomPool
                        ? sellToken.decimals || 18
                        : buyToken?.decimals || 18
                      : 18,
                  ),
                );
                const tokenPriceInEth = ethAmount / tokenAmount;
                const ethPriceInToken = tokenAmount / ethAmount;
                const tokenPriceUsd = tokenPriceInEth * ethPrice.priceUSD;
                const totalPoolValueUsd = ethAmount * ethPrice.priceUSD * 2;
                const tokenSymbol = coinId
                  ? tokens.find((t) => t.id === coinId)?.symbol || "Token"
                  : buyToken?.symbol;
                const poolToken = coinId
                  ? tokens.find((t) => t.id === coinId)
                  : buyToken;
                const actualSwapFee = poolToken?.swapFee ?? SWAP_FEE;
                return (
                  <>
                    <div className="opacity-75 text-xs">
                      Total Pool Value: ${formatNumber(totalPoolValueUsd, 2)}{" "}
                      USD
                    </div>
                    <div className="opacity-60 text-xs space-y-0.5">
                      <div>
                        1 ETH = {formatNumber(ethPriceInToken, 6)} {tokenSymbol}
                      </div>
                      <div>
                        1 {tokenSymbol} = {tokenPriceInEth.toFixed(8)} ETH ($
                        {tokenPriceUsd.toFixed(8)} USD)
                      </div>
                      <div className="flex items-center gap-1">
                        <span>Fee: {Number(actualSwapFee) / 100}%</span>
                        <HoverCard>
                          <HoverCardTrigger asChild>
                            <span className="text-[10px] opacity-70 cursor-help hover:opacity-100 transition-opacity">
                              ⓘ
                            </span>
                          </HoverCardTrigger>
                          <HoverCardContent className="w-auto">
                            <p className="text-sm">{t("common.paid_to_lps")}</p>
                          </HoverCardContent>
                        </HoverCard>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ACTION BUTTON */}
      <button
        onClick={swapMode === "instant" ? executeSwap : createOrder}
        disabled={
          !isConnected ||
          !sellAmt ||
          isPending ||
          (swapMode === "instant" && !canSwap) ||
          (swapMode === "limit" && (!buyAmt || !buyToken))
        }
        className={`mt-2 button text-base px-8 py-4 bg-primary text-primary-foreground font-bold rounded-lg transform transition-all duration-200 ${
          !isConnected ||
          !sellAmt ||
          isPending ||
          (swapMode === "instant" && !canSwap) ||
          (swapMode === "limit" && (!buyAmt || !buyToken))
            ? "opacity-50 cursor-not-allowed"
            : "opacity-100 hover:scale-105 hover:shadow-lg focus:ring-4 focus:ring-primary/50 focus:outline-none"
        }`}
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <LoadingLogo className="m-0 p-0 h-6 w-6" size="sm" />
            {t("common.loading")}
          </span>
        ) : swapMode === "instant" ? (
          t("common.swap")
        ) : (
          t("common.create_order")
        )}
      </button>

      {/* Status and error messages */}
      {txError && txError.includes(t("common.waiting")) && (
        <div className="text-sm text-primary mt-2 flex items-center bg-background/50 p-2 rounded border border-primary/20">
          <LoadingLogo size="sm" className="mr-2 scale-75" />
          {txError}
        </div>
      )}

      {((writeError && !isUserRejectionError(writeError)) ||
        (txError && !txError.includes(t("common.waiting")))) && (
        <div className="text-sm text-destructive mt-2 bg-background/50 p-2 rounded border border-destructive/20">
          {writeError && !isUserRejectionError(writeError)
            ? writeError.message
            : txError}
        </div>
      )}

      {isSuccess && (
        <div className="text-sm text-chart-2 mt-2 flex items-center justify-between bg-background/50 p-2 rounded border border-chart-2/20">
          <div className="flex items-center">
            <CheckIcon className="h-3 w-3 mr-2" />
            {swapMode === "limit"
              ? t("swap.order_created")
              : "Transaction confirmed!"}
          </div>
          {swapMode === "limit" && (
            <Link
              to="/orders"
              className="flex items-center gap-1 text-chart-2 hover:text-chart-2/80 transition-colors text-xs"
            >
              {t("swap.view_orders")}
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      )}

      <div className="mt-4 border-t border-primary pt-4">
        <PoolSwapChart
          buyToken={buyToken}
          sellToken={sellToken}
          prevPair={prevPairRef.current}
          priceImpact={priceImpact}
        />
      </div>
    </div>
  );
};
