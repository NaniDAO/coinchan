import { Link } from "@tanstack/react-router";
import { CheckIcon, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  encodeFunctionData,
  formatEther,
  formatUnits,
  maxUint256,
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
import { SwapModeTab } from "./SwapModeTab";
import { CustomRecipientInput } from "./CustomRecipientInput";
import { _ReturnNull } from "i18next";
import { formatDexscreenerStyle } from "./lib/math";
import { SwapEfficiencyNote } from "./components/SwapEfficiencyNote";

interface SwapActionProps {
  lockedTokens?: {
    sellToken: TokenMeta;
    buyToken: TokenMeta;
  };
}

// Toggle detailed console logs for impact calc
const DEBUG_IMPACT = true;

// Known ERC20 token addresses used by the router
const ADDR: Record<string, Address> = {
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  CULT: "0x0000000000c5dc95539589fbD24BE07c6C14eCa4",
  ENS: "0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72",
  ETH: "0x0000000000000000000000000000000000000000", // Native ETH sentinel
};

export function toZRouterToken(token?: TokenMeta) {
  if (!token) return undefined;
  // Native ETH
  if (token.id === null) return { address: ADDR.ETH } as const;

  if (token.source === "ERC20") {
    if (!token.token1)
      throw new Error(`Missing token1 for ERC20 token ${token.id}`);
    return {
      address: token.token1,
    };
  }

  if (token.source === "ZAMM") {
    return {
      address: CoinsAddress as Address,
      id: token.id,
    };
  }

  if (token.source === "COOKBOOK") {
    return {
      address: CookbookAddress as Address,
      id: token.id,
    };
  }

  throw new Error(`Unsupported token source: ${token.source}`);
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

  // Check if this swap involves external ERC20 tokens (which use external AMMs)
  const isExternalSwap = useMemo(() => {
    // If either token is an external ERC20, the swap goes through external AMMs
    return sellToken?.source === "ERC20" || buyToken?.source === "ERC20";
  }, [sellToken, buyToken]);

  const {
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
    impactPercent: number; // positive means buyToken price goes UP
    action: "buy" | "sell";
  } | null>(null);

  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [approvalStep, setApprovalStep] = useState<string | null>(null);
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
    setLastEditedField("sell");
  }, [swapMode]);

  // === quoting via zrouter-sdk ===
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
          const out = formatUnits(res.amountOut, buyToken.decimals || 18);
          if (DEBUG_IMPACT)
            console.debug("[impact] EXACT_IN quote", {
              raw: params.raw,
              amountIn: params.raw,
              amountOut: out,
            });
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
          const inp = formatUnits(res.amountIn, sellToken.decimals || 18);
          if (DEBUG_IMPACT)
            console.debug("[impact] EXACT_OUT quote", {
              raw: params.raw,
              amountIn: inp,
              amountOut: params.raw,
            });
          return { ok: true as const, amountOut: params.raw, amountIn: inp };
        }
      } catch (e) {
        console.error("quote() failed", e);
        return { ok: false as const };
      }
    },
    [publicClient, sellToken, buyToken],
  );

  // === Price impact estimation (side-aware, trader-centric) ===
  useEffect(() => {
    let canceled = false;

    const run = async () => {
      try {
        if (
          swapMode !== "instant" ||
          !sellToken ||
          !buyToken ||
          (!sellAmt && !buyAmt)
        ) {
          if (!canceled) setPriceImpact(null);
          return;
        }

        const epsilon = 0.01;

        // Helper to set result once computed
        const finish = (p0: number, p1: number, action: "buy" | "sell") => {
          if (!isFinite(p0) || !isFinite(p1) || p0 <= 0 || p1 <= 0) {
            if (!canceled) setPriceImpact(null);
            return;
          }
          // Positive = buyToken price goes UP (we measure price of buy token in units of sell token)
          const impactPercent = (p1 / p0 - 1) * 100;
          if (!canceled) {
            setPriceImpact({
              currentPrice: p0,
              projectedPrice: p1,
              impactPercent,
              action,
            });
          }
        };

        if (lastEditedField === "sell") {
          // EXACT_IN: user typed the sell amount
          const in0 = Number(sellAmt || "0");
          if (!isFinite(in0) || in0 <= 0) {
            if (!canceled) setPriceImpact(null);
            return;
          }

          const base = await doQuote({ side: "EXACT_IN", raw: String(in0) });
          if (!base.ok) return void (!canceled && setPriceImpact(null));

          const out0 = Number(base.amountOut);
          if (!isFinite(out0) || out0 <= 0) {
            if (!canceled) setPriceImpact(null);
            return;
          }

          const in1 = in0 * (1 + epsilon);
          const bumped = await doQuote({ side: "EXACT_IN", raw: String(in1) });
          if (!bumped.ok) return void (!canceled && setPriceImpact(null));
          const out1 = Number(bumped.amountOut);

          // Effective price (sell per 1 buy): lower is better for trader
          const p0 = in0 / out0;
          const p1 = in1 / out1;
          finish(p0, p1, "buy");
        } else {
          // EXACT_OUT: user typed the buy amount (still buying the buy token)
          const out0 = Number(buyAmt || "0");
          if (!isFinite(out0) || out0 <= 0) {
            if (!canceled) setPriceImpact(null);
            return;
          }

          const base = await doQuote({ side: "EXACT_OUT", raw: String(out0) });
          if (!base.ok) return void (!canceled && setPriceImpact(null));
          const in0 = Number(base.amountIn);
          if (!isFinite(in0) || in0 <= 0) {
            if (!canceled) setPriceImpact(null);
            return;
          }

          const out1 = out0 * (1 + epsilon);
          const bumped = await doQuote({
            side: "EXACT_OUT",
            raw: String(out1),
          });
          if (!bumped.ok) return void (!canceled && setPriceImpact(null));
          const in1 = Number(bumped.amountIn);

          // Effective price (sell per 1 buy): lower is better for trader
          const p0 = in0 / out0;
          const p1 = in1 / out1;
          finish(p0, p1, "buy");
        }
      } catch (e) {
        console.error("[impact] error", e);
        if (!canceled) setPriceImpact(null);
      }
    };

    const id = setTimeout(run, 350);
    return () => {
      canceled = true;
      clearTimeout(id);
    };
  }, [
    swapMode,
    sellToken,
    buyToken,
    sellAmt,
    buyAmt,
    lastEditedField,
    doQuote,
  ]);

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

      const steps = await findRoute(publicClient, {
        tokenIn,
        tokenOut,
        side,
        amount,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 10),
        owner: address,
        slippageBps: Number(slippageBps),
      }).catch((e) => {
        console.error(e);
        return [];
      });

      if (!steps.length) {
        setTxError(t("errors.unexpected") || "No route found");
        return;
      }

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
      if (approvals && approvals.length > 0) {
        setIsApproving(true);
        for (let i = 0; i < approvals.length; i++) {
          const approval = approvals[i];
          try {
            // Set approval step message
            if (approval.kind === "ERC20_APPROVAL") {
              setApprovalStep(
                t("swap.approving_token", {
                  token: sellToken.symbol || "token",
                }),
              );
            } else {
              setApprovalStep(t("swap.setting_operator"));
            }

            const hash = await sendTransactionAsync({
              to: approval.token.address,
              data:
                approval.kind === "ERC20_APPROVAL"
                  ? encodeFunctionData({
                      abi: erc20Abi,
                      functionName: "approve",
                      args: [approval.spender, maxUint256], // set max approval
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

            setApprovalStep(t("swap.waiting_approval"));
            await publicClient.waitForTransactionReceipt({ hash });
          } catch (error: any) {
            setIsApproving(false);
            setApprovalStep(null);
            if (error?.message?.includes("getChainId is not a function")) {
              console.error("Connector compatibility issue:", error);
              setTxError(t("errors.wallet_connection_refresh"));
              setTimeout(() => window.location.reload(), 2000);
              return;
            }
            throw error;
          }
        }
        setIsApproving(false);
        setApprovalStep(t("swap.approval_complete"));
        // Small delay to show the success message before proceeding
        await new Promise((resolve) => setTimeout(resolve, 500));
        setApprovalStep(null);
      }

      let hash: `0x${string}`;
      try {
        if (calls.length === 1) {
          // Single call: send directly to the router with the encoded call
          hash = await sendTransactionAsync({
            to: mainnetConfig.router,
            data: calls[0],
            value: value,
            chainId: mainnet.id,
            account: address,
          });
        } else {
          // Multiple calls: use multicall
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
        }
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
      {/* Terminal Mode Toggle */}
      <SwapModeTab swapMode={swapMode} setSwapMode={setSwapMode} />
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
              (sellToken.balance as bigint) > 0n &&
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
          showPercentageSlider={
            lastEditedField === "sell" ||
            (isExternalSwap &&
              !!sellToken.balance &&
              (sellToken.balance as bigint) > 0n)
          }
          className="pb-4"
          readOnly={!!lockedTokens}
        />

        {/* FLIP button - absolutely positioned */}
        {!lockedTokens && (
          <div
            className={cn(
              "absolute left-1/2 -translate-x-1/2 z-10",
              !!(
                sellToken.balance &&
                (sellToken.balance as bigint) > 0n &&
                (lastEditedField === "sell" || isExternalSwap)
              )
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

      <SwapEfficiencyNote
        publicClient={publicClient}
        sellToken={sellToken}
        buyToken={buyToken ?? undefined}
        lastEditedField={lastEditedField}
        sellAmt={sellAmt}
        buyAmt={buyAmt}
      />

      {/* Custom Recipient Input - only for instant swaps */}
      {swapMode === "instant" && (
        <CustomRecipientInput
          customRecipient={customRecipient}
          setCustomRecipient={setCustomRecipient}
          ensResolution={ensResolution}
        />
      )}

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

      {/* Pool information - kept for UI display (but not for external swaps) */}
      {swapMode === "instant" && canSwap && reserves && !isExternalSwap && (
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
                  {formatDexscreenerStyle(priceImpact.impactPercent)}%
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
          isApproving ||
          (swapMode === "instant" && !canSwap) ||
          (swapMode === "limit" && (!buyAmt || !buyToken))
        }
        className={`mt-2 button text-base px-8 py-4 bg-primary text-primary-foreground font-bold rounded-lg transform transition-all duration-200 ${
          !isConnected ||
          !sellAmt ||
          isPending ||
          isApproving ||
          (swapMode === "instant" && !canSwap) ||
          (swapMode === "limit" && (!buyAmt || !buyToken))
            ? "opacity-50 cursor-not-allowed"
            : "opacity-100 hover:scale-105 hover:shadow-lg focus:ring-4 focus:ring-primary/50 focus:outline-none"
        }`}
      >
        {isPending || isApproving ? (
          <span className="flex items-center gap-2">
            <LoadingLogo className="m-0 p-0 h-6 w-6" size="sm" />
            {isApproving && approvalStep ? approvalStep : t("common.loading")}
          </span>
        ) : swapMode === "instant" ? (
          customRecipient && ensResolution.address ? (
            <span className="flex items-center gap-2">
              {t("common.swap")} 📤
            </span>
          ) : (
            t("common.swap")
          )
        ) : (
          t("common.create_order")
        )}
      </button>

      {/* Approval progress indicator */}
      {isApproving && approvalStep && (
        <div className="text-sm text-primary mt-2 flex items-center bg-primary/10 p-3 rounded-lg border border-primary/20 animate-pulse">
          <LoadingLogo size="sm" className="mr-2 scale-75" />
          <span className="font-medium">{approvalStep}</span>
        </div>
      )}

      {/* Custom recipient indicator - only for instant swaps */}
      {swapMode === "instant" &&
        customRecipient &&
        ensResolution.address &&
        !txError && (
          <div className="text-sm text-chart-2 mt-2 flex items-center bg-chart-2/10 p-2 rounded border border-chart-2/20">
            <span className="text-xs">
              📤 {t("swap.recipient_note") || "Output will be sent to"}:{" "}
              {ensResolution.address.slice(0, 6)}...
              {ensResolution.address.slice(-4)}
            </span>
          </div>
        )}

      {/* Status and error messages */}
      {txError &&
        t("common.waiting") &&
        txError.includes(t("common.waiting")) && (
          <div className="text-sm text-primary mt-2 flex items-center bg-background/50 p-2 rounded border border-primary/20">
            <LoadingLogo size="sm" className="mr-2 scale-75" />
            {txError}
          </div>
        )}

      {((writeError && !isUserRejectionError(writeError)) ||
        (txError &&
          (!t("common.waiting") ||
            !txError.includes(t("common.waiting"))))) && (
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
          priceImpact={null}
        />
      </div>
    </div>
  );
};
