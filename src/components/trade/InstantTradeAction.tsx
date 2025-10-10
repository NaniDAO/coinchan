import { useState, useEffect, useRef, useCallback, useMemo } from "react";

import { useTokenPair } from "@/hooks/use-token-pair";
import { TradeController } from "./TradeController";
import { TradePanel } from "./TradePanel";
import { useGetTokens } from "@/hooks/use-get-tokens";
import { cn } from "@/lib/utils";
import { FlipActionButton } from "../FlipActionButton";
import { ETH_TOKEN, sameToken, TokenMetadata, ZAMM_TOKEN } from "@/lib/pools";
import {
  encodeFunctionData,
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
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useZRouterQuote } from "@/hooks/use-zrouter-quote";
import {
  buildRoutePlan,
  mainnetConfig,
  findRoute,
  simulateRoute,
  erc20Abi,
  zRouterAbi,
} from "zrouter-sdk";
import { CoinsAbi } from "@/constants/Coins";
import { toZRouterToken } from "@/lib/zrouter";
import { SLIPPAGE_BPS } from "@/lib/swap";
import { handleWalletError, isUserRejectionError } from "@/lib/errors";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../ui/hover-card";
import { InfoIcon } from "lucide-react";
import { SlippageSettings } from "../SlippageSettings";

import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  encodeTokenQ,
  findTokenFlexible,
  isCanonicalTokenQ,
} from "@/lib/token-query";

interface InstantTradeActionProps {
  locked?: boolean;
  initialSellToken?: TokenMetadata;
  initialBuyToken?: TokenMetadata;
  /**
   * When true, activate TanStack Router search syncing (read from and write to the URL).
   * When false (default), the component ignores URL search params entirely.
   */
  useSearchHook?: boolean;
}

export const InstantTradeAction = ({
  locked = false,
  initialSellToken,
  initialBuyToken,
  useSearchHook = false,
}: InstantTradeActionProps) => {
  // URL hooks (bind to the *current* route so it is safe on "/" and "/swap")
  const navigate = useNavigate();
  const search = useSearch(
    useSearchHook === true ? { from: "/swap" } : { from: "/" },
  ) as {
    sellToken?: string;
    buyToken?: string;
  };

  const { sellToken, setSellToken, buyToken, setBuyToken, flip } = useTokenPair(
    {
      initial: {
        sellToken: initialSellToken ?? ETH_TOKEN,
        buyToken: initialBuyToken ?? ZAMM_TOKEN,
      },
    },
  );

  const [sellAmount, setSellAmount] = useState("");
  const [buyAmount, setBuyAmount] = useState("");
  const [lastEditedField, setLastEditedField] = useState<"sell" | "buy">(
    "sell",
  );
  const [slippageBps, setSlippageBps] = useState<bigint>(SLIPPAGE_BPS);

  const { address: owner, isConnected } = useAccount();
  const { data: tokens = [] } = useGetTokens(owner);
  const publicClient = usePublicClient();

  const chainId = useChainId();
  const {
    sendTransactionAsync,
    isPending,
    error: writeError,
  } = useSendTransaction();
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // Local UI error + suppression
  const [txError, setTxError] = useState<string | null>(null);
  const [suppressErrors, setSuppressErrors] = useState(false);

  // Track whether user manually changed the pair (to avoid re-hydrating/overwriting)
  const userChangedPairRef = useRef(false);

  const clearErrorsOnUserEdit = () => {
    setTxError(null);
    setSuppressErrors(true);
  };

  // Reset amounts when pair changes (and clear errors)
  useEffect(() => {
    setSellAmount("");
    setBuyAmount("");
    setLastEditedField("sell");
    clearErrorsOnUserEdit();
  }, [sellToken?.id, buyToken?.id]);

  // ------------------------------
  // URL → State (decode once tokens are known) — only when useSearchHook=true
  // ------------------------------
  useEffect(() => {
    if (!useSearchHook) return; // 🚫 do nothing when disabled
    if (!tokens?.length) return;

    // Resolve flexible queries from URL (addr:id | addr | symbol | id)
    const matchSell = findTokenFlexible(tokens as any, search.sellToken);
    const matchBuy = findTokenFlexible(tokens as any, search.buyToken);

    // Apply resolved tokens (only if different)
    if (matchSell) {
      setSellToken((prev) =>
        prev && sameToken(prev, matchSell) ? prev : matchSell,
      );
    }
    if (matchBuy) {
      setBuyToken((prev) =>
        prev && sameToken(prev, matchBuy) ? prev : matchBuy,
      );
    }

    // Canonicalize (or fill defaults) into the URL if needed
    const canonSell = matchSell
      ? encodeTokenQ(matchSell)
      : sellToken
        ? encodeTokenQ(sellToken)
        : encodeTokenQ(ETH_TOKEN);
    const canonBuy = matchBuy
      ? encodeTokenQ(matchBuy)
      : buyToken
        ? encodeTokenQ(buyToken)
        : encodeTokenQ(ZAMM_TOKEN);

    const needsCanonSell = !isCanonicalTokenQ(search.sellToken) && !!canonSell;
    const needsCanonBuy = !isCanonicalTokenQ(search.buyToken) && !!canonBuy;
    const needsFill = !search.sellToken || !search.buyToken;

    if (needsCanonSell || needsCanonBuy || needsFill) {
      navigate({
        to: ".",
        replace: true,
        search: (s: any) => ({
          ...s,
          sellToken: canonSell,
          buyToken: canonBuy,
        }),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, useSearchHook]);

  // ------------------------------
  // State → URL (keep URL in sync whenever selected tokens change) — only when useSearchHook=true
  // ------------------------------
  useEffect(() => {
    if (!useSearchHook) return; // 🚫 do nothing when disabled
    if (!sellToken || !buyToken) return;

    navigate({
      to: ".",
      replace: true,
      search: (s: any) => ({
        ...s,
        sellToken: encodeTokenQ(sellToken),
        buyToken: encodeTokenQ(buyToken),
      }),
    });
  }, [sellToken, buyToken, navigate, useSearchHook]);

  // Hydrate current selections with balances (without changing which token is selected)
  useEffect(() => {
    if (!tokens?.length) return;

    // Only auto-hydrate while the pair is still the initial one (or untouched)
    const stillDefaultPair =
      sameToken(sellToken, ETH_TOKEN) && sameToken(buyToken, ZAMM_TOKEN);
    if (!stillDefaultPair || userChangedPairRef.current) {
      // even if user changed, still attempt balance hydration without changing ids
    }

    const BALANCE_KEYS = ["balance", "rawBalance", "formattedBalance"] as const;

    const mergeBalances = <T extends Record<string, any>>(
      prev: T,
      match: any,
    ): T => {
      let changed = false;
      const next: any = { ...prev };
      for (const k of BALANCE_KEYS) {
        if (match?.[k] !== undefined && match?.[k] !== prev?.[k]) {
          next[k] = match[k];
          changed = true;
        }
      }
      return changed ? (next as T) : prev;
    };

    // Hydrate SELL without changing which token is selected
    setSellToken((prev) => {
      if (!prev) return prev;
      const match = tokens.find((t) => sameToken(t as any, prev));
      return match ? mergeBalances(prev, match) : prev;
    });

    // Hydrate BUY without changing which token is selected
    setBuyToken((prev) => {
      if (!prev) return prev;
      const match = tokens.find((t) => sameToken(t as any, prev));
      return match ? mergeBalances(prev, match) : prev;
    });
  }, [tokens, setSellToken, setBuyToken, sellToken, buyToken]);

  // ------------------------------
  // Quotes via useZRouterQuote
  // ------------------------------
  const side = lastEditedField === "sell" ? "EXACT_IN" : "EXACT_OUT";
  const rawAmount = lastEditedField === "sell" ? sellAmount : buyAmount;

  const quotingEnabled =
    !!publicClient &&
    !!sellToken &&
    !!buyToken &&
    !!rawAmount &&
    Number(rawAmount) > 0;

  const { data: quote } = useZRouterQuote({
    publicClient: publicClient ?? undefined,
    sellToken,
    buyToken,
    rawAmount,
    side,
    enabled: quotingEnabled,
  });

  // Reflect quote into the opposite field
  useEffect(() => {
    if (!quotingEnabled || !quote?.ok) return;
    if (lastEditedField === "sell") {
      if (buyAmount !== quote.amountOut) setBuyAmount(quote.amountOut ?? "");
    } else {
      if (sellAmount !== quote.amountIn) setSellAmount(quote.amountIn ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote, quotingEnabled, lastEditedField]);

  // ------------------------------
  // Input + selection handlers
  // ------------------------------
  const syncFromSell = (val: string) => {
    clearErrorsOnUserEdit();
    setSellAmount(val);
    setLastEditedField("sell");
  };

  const syncFromBuy = (val: string) => {
    clearErrorsOnUserEdit();
    setBuyAmount(val);
    setLastEditedField("buy");
  };

  // SELL token can be changed even when locked
  const handleSellTokenSelect = (token: TokenMetadata) => {
    clearErrorsOnUserEdit();
    userChangedPairRef.current = true;
    setSellToken(token);
    setSellAmount("");
    setBuyAmount("");
    setLastEditedField("sell");

    // reflect to URL immediately (only when enabled)
    if (useSearchHook) {
      navigate({
        to: ".",
        replace: true,
        search: (s: any) => ({
          ...s,
          sellToken: encodeTokenQ(token),
          buyToken: encodeTokenQ(buyToken ?? ZAMM_TOKEN),
        }),
      });
    }
  };

  // BUY token cannot be changed when locked
  const handleBuyTokenSelect = (token: TokenMetadata) => {
    if (locked) return;
    clearErrorsOnUserEdit();
    userChangedPairRef.current = true;
    setBuyToken(token);
    setSellAmount("");
    setBuyAmount("");
    setLastEditedField("buy");

    // reflect to URL immediately (only when enabled)
    if (useSearchHook) {
      navigate({
        to: ".",
        replace: true,
        search: (s: any) => ({
          ...s,
          sellToken: encodeTokenQ(sellToken ?? ETH_TOKEN),
          buyToken: encodeTokenQ(token),
        }),
      });
    }
  };

  // Flipping is allowed even when locked
  const handleFlip = () => {
    clearErrorsOnUserEdit();
    userChangedPairRef.current = true;
    flip();
    setSellAmount("");
    setBuyAmount("");
    setLastEditedField("sell");

    // reflect to URL after flip (only when enabled)
    if (useSearchHook) {
      const nextSell = buyToken ?? ZAMM_TOKEN;
      const nextBuy = sellToken ?? ETH_TOKEN;
      navigate({
        to: ".",
        replace: true,
        search: (s: any) => ({
          ...s,
          sellToken: encodeTokenQ(nextSell),
          buyToken: encodeTokenQ(nextBuy),
        }),
      });
    }
  };

  // ------------------------------
  // Execute swap (approvals + multicall)
  // ------------------------------
  const executeSwap = async () => {
    // We are attempting a new swap; show future errors again
    setSuppressErrors(false);

    try {
      if (!isConnected || !owner) {
        setTxError("Connect your wallet to proceed");
        return;
      }
      if (!sellToken || !buyToken || !publicClient) {
        setTxError("Select tokens and enter an amount");
        return;
      }
      if (!rawAmount || Number(rawAmount) <= 0) {
        setTxError("Enter an amount to swap");
        return;
      }
      if (chainId !== mainnet.id) {
        setTxError("Wrong network: switch to Ethereum Mainnet");
        return;
      }

      setTxError(null);

      const tokenIn = toZRouterToken(sellToken);
      const tokenOut = toZRouterToken(buyToken);
      const decimals =
        lastEditedField === "sell"
          ? (sellToken.decimals ?? 18)
          : (buyToken.decimals ?? 18);
      const amount = parseUnits(rawAmount, decimals);
      const routeSide = lastEditedField === "sell" ? "EXACT_IN" : "EXACT_OUT";

      // Find a route (deadline 10 minutes)
      const steps = await findRoute(publicClient, {
        tokenIn,
        tokenOut,
        side: routeSide,
        amount,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 10),
        owner,
        slippageBps: Number(slippageBps),
      }).catch(() => []);

      if (!steps.length) {
        setTxError("No route found for this pair/amount");
        return;
      }

      const plan = await buildRoutePlan(publicClient, {
        owner,
        router: mainnetConfig.router,
        steps,
        finalTo: owner as Address,
      }).catch(() => undefined);

      if (!plan) {
        setTxError("Failed to build route plan");
        return;
      }

      const { calls, value, approvals } = plan;

      // Best-effort approvals (ERC20 + Coins operator)
      if (approvals && approvals.length > 0) {
        for (const approval of approvals) {
          const hash = await sendTransactionAsync({
            to: approval.token.address,
            data:
              approval.kind === "ERC20_APPROVAL"
                ? encodeFunctionData({
                    abi: erc20Abi,
                    functionName: "approve",
                    args: [approval.spender, maxUint256],
                  })
                : encodeFunctionData({
                    abi: CoinsAbi,
                    functionName: "setOperator",
                    args: [approval.operator, approval.approved],
                  }),
            value: 0n,
            chainId: mainnet.id,
            account: owner,
          });
          await publicClient.waitForTransactionReceipt({ hash });
        }
      }

      // Simulate route execution
      const sim = await simulateRoute(publicClient, {
        router: mainnetConfig.router,
        account: owner,
        calls,
        value,
        approvals,
      });

      if (!sim) {
        setTxError("Failed to simulate route");
        return;
      }

      // Execute (single call vs multicall)
      const hash = await sendTransactionAsync(
        calls.length === 1
          ? {
              to: mainnetConfig.router,
              data: calls[0],
              value,
              chainId: mainnet.id,
              account: owner,
            }
          : {
              to: mainnetConfig.router,
              data: encodeFunctionData({
                abi: zRouterAbi,
                functionName: "multicall",
                args: [calls],
              }),
              value,
              chainId: mainnet.id,
              account: owner,
            },
      );

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction failed");
      setTxHash(hash);
    } catch (err) {
      console.error("Caught error:", err);
      const msg = handleWalletError(err);
      // Only set error if it's not a user rejection (handleWalletError returns null for rejections)
      if (msg !== null) {
        setTxError(msg);
      }
    }
  };

  // ------------------------------
  // Optional helpers (unchanged)
  // ------------------------------
  const onControllerAmountChange = useCallback((val: string) => {
    clearErrorsOnUserEdit();
    setSellAmount(val);
    setLastEditedField("sell");
  }, []);

  const hasSell = useMemo(
    () => !!(sellToken?.balance && BigInt(sellToken.balance) > 0n),
    [sellToken?.balance],
  );

  return (
    <div>
      {/* Optional controller-style single line input */}
      <TradeController
        onAmountChange={onControllerAmountChange}
        currentSellToken={sellToken}
        // SELL token can always be changed
        setSellToken={(t) => {
          clearErrorsOnUserEdit();
          userChangedPairRef.current = true;
          setSellToken(t);
          if (useSearchHook) {
            navigate({
              to: ".",
              replace: true,
              search: (s: any) => ({
                ...s,
                sellToken: encodeTokenQ(t),
                buyToken: encodeTokenQ(buyToken ?? ZAMM_TOKEN),
              }),
            });
          }
        }}
        currentBuyToken={buyToken}
        // BUY token setter disabled only when locked
        setBuyToken={
          locked
            ? undefined
            : (t) => {
                clearErrorsOnUserEdit();
                userChangedPairRef.current = true;
                setBuyToken(t);
                if (useSearchHook) {
                  navigate({
                    to: ".",
                    replace: true,
                    search: (s: any) => ({
                      ...s,
                      sellToken: encodeTokenQ(sellToken ?? ETH_TOKEN),
                      buyToken: encodeTokenQ(t),
                    }),
                  });
                }
              }
        }
        currentSellAmount={sellAmount}
        setSellAmount={(v) => {
          clearErrorsOnUserEdit();
          setSellAmount(v);
        }}
        className="rounded-md"
        ariaLabel="Trade Controller"
      />

      {/* SELL / FLIP / BUY */}
      <div className="relative flex flex-col">
        <TradePanel
          title={"Sell"}
          selectedToken={sellToken}
          tokens={tokens}
          onSelect={handleSellTokenSelect}
          amount={sellAmount}
          onAmountChange={syncFromSell}
          showMaxButton={hasSell && lastEditedField === "sell"}
          onMax={() => {
            if (!sellToken?.balance) return;
            clearErrorsOnUserEdit();
            const decimals = sellToken.decimals ?? 18;
            syncFromSell(formatUnits(sellToken.balance as bigint, decimals));
          }}
          showPercentageSlider={hasSell}
          className="pb-4 rounded-t-2xl"
        />

        <div
          className={cn("absolute left-1/2 -translate-x-1/2 top-[50%] z-10")}
        >
          <FlipActionButton onClick={handleFlip} />
        </div>

        <TradePanel
          title={"Buy"}
          selectedToken={buyToken ?? undefined}
          tokens={tokens}
          onSelect={locked ? () => {} : handleBuyTokenSelect} // lock only buy token selection
          amount={buyAmount}
          onAmountChange={syncFromBuy}
          className="pt-4 rounded-b-2xl"
        />
      </div>

      {/* Settings */}
      <div className="flex items-center p-1 justify-end flex-row">
        <HoverCard>
          <HoverCardTrigger asChild>
            <InfoIcon className="h-6 w-6 opacity-70 cursor-help hover:opacity-100 transition-opacity" />
          </HoverCardTrigger>
          <HoverCardContent className="w-[320px] space-y-3">
            <SlippageSettings
              slippageBps={slippageBps}
              setSlippageBps={setSlippageBps}
            />
            <p className="text-xs text-muted-foreground">
              Fees are paid to LPs
            </p>
          </HoverCardContent>
        </HoverCard>
      </div>

      {/* Action button */}
      <button
        onClick={executeSwap}
        disabled={!isConnected || !sellAmount || isPending}
        className={cn(
          `w-full mt-3 button text-base px-8 py-4 bg-primary! text-primary-foreground! dark:bg-primary! dark:text-primary-foreground! font-bold rounded-lg transition hover:scale-105`,
          (!isConnected || !sellAmount || isPending) &&
            "opacity-50 cursor-not-allowed",
        )}
      >
        {isPending ? "Processing…" : !sellAmount ? "Get Started" : "Swap"}
      </button>

      {/* Errors / Success */}
      {writeError && !suppressErrors && !isUserRejectionError(writeError) && (
        <div className="mt-2 text-sm text-red-500">
          {handleWalletError(writeError) || "Transaction failed"}
        </div>
      )}
      {txError && !suppressErrors && (
        <div className="mt-2 text-sm text-red-500">{txError}</div>
      )}
      {isSuccess && (
        <div className="mt-2 text-sm text-green-500">
          Transaction confirmed! Hash: {txHash}
        </div>
      )}
    </div>
  );
};
