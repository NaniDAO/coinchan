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

import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import {
  encodeTokenQ,
  parseTokenQ,
  findTokenFlexible,
  isCanonicalTokenQ,
} from "@/lib/token-query";

/** ----------------------------------------------------------------
 * URL token helpers
 * ---------------------------------------------------------------- */

function isAddress(str?: string): str is Address {
  return !!str && /^0x[a-fA-F0-9]{40}$/.test(str);
}

/**
 * Resolve a URL token query against a loaded tokenlist.
 * Falls back to `minimalFromTokenQ` when no match yet.
 */
function resolveFromUrl(
  tokens: TokenMetadata[] | undefined,
  q?: string,
): Partial<TokenMetadata> | undefined {
  if (!q) return undefined;
  const match =
    tokens && tokens.length
      ? (findTokenFlexible(tokens as any, q) as TokenMetadata | undefined)
      : undefined;

  if (match) return match;
  // parse token q
  const parsed = parseTokenQ(q);

  if (parsed) {
    if (parsed.kind === "addrid") {
      return {
        address: parsed.address,
        id: parsed.id,
        standard: "ERC6909",
      };
    } else if (parsed.kind === "addr") {
      if (isAddress(parsed.address)) {
        return {
          address: parsed.address,
          standard: "ERC20",
        };
      } else {
        return {
          address: parsed.address,
          standard: "ERC20",
        };
      }
    }
  }
  return undefined;
}

/**
 * Merge known fields (balances + metadata) from `src` onto `dst`
 * without changing the token identity. Use this to hydrate tokens
 * with name/symbol/logoURI/decimals once the tokenlist is available.
 */
function mergeTokenFields<T extends Record<string, any>>(dst: T, src?: any): T {
  if (!src) return dst;

  // fields that define identity and should never be overwritten
  const IDENTITY_KEYS = new Set(["address", "id"]);

  let changed = false;
  const next: any = { ...dst };

  for (const [k, v] of Object.entries(src)) {
    if (v === undefined) continue;
    if (IDENTITY_KEYS.has(k)) continue; // don’t change identity
    if (next[k] !== v) {
      next[k] = v; // merge any other metadata, incl. `image`
      changed = true;
    }
  }

  return changed ? (next as T) : dst;
}

/** ----------------------------------------------------------------
 * Component
 * ---------------------------------------------------------------- */

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
  const navigate = useNavigate();
  const location = useLocation();
  const search = useSearch(
    // @ts-expect-error
    useSearchHook === true ? { from: "/swap" } : { from: location.pathname },
  ) as {
    sellToken?: string;
    buyToken?: string;
  };

  const { address: owner, isConnected } = useAccount();
  const { data: tokens = [] } = useGetTokens(owner);
  const publicClient = usePublicClient();
  const chainId = useChainId();

  /** ------------------------------------------------------------
   * Seed useTokenPair from URL so first paint reflects deep link
   * ------------------------------------------------------------ */
  const urlInitialSell = useMemo(
    () =>
      useSearchHook
        ? (resolveFromUrl(tokens, search.sellToken) as
            | TokenMetadata
            | undefined)
        : undefined,
    // include `tokens` so if they arrive before first render, we seed with richer info
    [useSearchHook, search.sellToken, tokens],
  );

  const urlInitialBuy = useMemo(
    () =>
      useSearchHook
        ? (resolveFromUrl(tokens, search.buyToken) as TokenMetadata | undefined)
        : undefined,
    [useSearchHook, search.buyToken, tokens],
  );

  const { sellToken, setSellToken, buyToken, setBuyToken, flip } = useTokenPair(
    {
      initial: {
        // Priority: URL → explicit props → defaults
        sellToken:
          (urlInitialSell as TokenMetadata) ?? initialSellToken ?? ETH_TOKEN,
        buyToken:
          (urlInitialBuy as TokenMetadata) ?? initialBuyToken ?? ZAMM_TOKEN,
      },
    },
  );

  const [sellAmount, setSellAmount] = useState("");
  const [buyAmount, setBuyAmount] = useState("");
  const [lastEditedField, setLastEditedField] = useState<"sell" | "buy">(
    "sell",
  );
  const [slippageBps, setSlippageBps] = useState<bigint>(SLIPPAGE_BPS);

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
  const didInitialUrlHydrate = useRef(false);

  const clearErrorsOnUserEdit = () => {
    setTxError(null);
    setSuppressErrors(true);
  };

  // Reset amounts when pair changes (skip first URL hydration-triggered change)
  useEffect(() => {
    if (!didInitialUrlHydrate.current && useSearchHook) {
      didInitialUrlHydrate.current = true;
      return;
    }
    setSellAmount("");
    setBuyAmount("");
    setLastEditedField("sell");
    clearErrorsOnUserEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellToken?.address ?? sellToken?.id, buyToken?.address ?? buyToken?.id]);

  // ------------------------------
  // URL → State (decode immediately; don't depend on tokens)
  // ------------------------------
  useEffect(() => {
    if (!useSearchHook) return;

    // Resolve against loaded tokens if possible, else minimal identity
    const matchSell = resolveFromUrl(tokens, search.sellToken);
    const matchBuy = resolveFromUrl(tokens, search.buyToken);

    if (matchSell) {
      setSellToken((prev) =>
        prev && sameToken(prev, matchSell as TokenMetadata)
          ? mergeTokenFields(prev, matchSell)
          : (matchSell as TokenMetadata),
      );
    }
    if (matchBuy) {
      setBuyToken((prev) =>
        prev && sameToken(prev, matchBuy as TokenMetadata)
          ? mergeTokenFields(prev, matchBuy)
          : (matchBuy as TokenMetadata),
      );
    }

    // Canonicalize only when we have a confident match from the tokenlist,
    // or when the URL is missing values. Do NOT inject ETH/ZAMM just because
    // we couldn't resolve yet.
    const updates: Record<string, string> = {};
    const canonSellCandidate =
      (tokens.length && findTokenFlexible(tokens as any, search.sellToken)) ||
      undefined;
    const canonBuyCandidate =
      (tokens.length && findTokenFlexible(tokens as any, search.buyToken)) ||
      undefined;

    if (canonSellCandidate && !isCanonicalTokenQ(search.sellToken)) {
      let encoded = encodeTokenQ(canonSellCandidate);
      if (encoded) updates.sellToken = encoded;
    }
    if (canonBuyCandidate && !isCanonicalTokenQ(search.buyToken)) {
      let encoded = encodeTokenQ(canonBuyCandidate);
      if (encoded) updates.buyToken = encoded;
    }

    if (!search.sellToken && (sellToken || matchSell)) {
      let encoded = encodeTokenQ(
        (canonSellCandidate ??
          (sellToken as TokenMetadata) ??
          (matchSell as TokenMetadata)) as TokenMetadata,
      );
      if (encoded) updates.sellToken = encoded;
    }
    if (!search.buyToken && (buyToken || matchBuy)) {
      let encoded = encodeTokenQ(
        (canonBuyCandidate ??
          (buyToken as TokenMetadata) ??
          (matchBuy as TokenMetadata)) as TokenMetadata,
      );
      if (encoded) updates.buyToken = encoded;
    }

    if (Object.keys(updates).length) {
      navigate({
        to: ".",
        replace: true,
        search: (s: any) => ({ ...s, ...updates }),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useSearchHook, search.sellToken, search.buyToken, tokens]);

  // ------------------------------
  // Hydrate current selections with balances + metadata
  // (without changing which token is selected)
  // ------------------------------
  useEffect(() => {
    if (!tokens?.length) return;

    // Hydrate SELL without changing identity
    setSellToken((prev) => {
      if (!prev) return prev;
      const match = tokens.find((t) => sameToken(t as any, prev));
      return match ? mergeTokenFields(prev, match) : prev;
    });

    // Hydrate BUY without changing identity
    setBuyToken((prev) => {
      if (!prev) return prev;
      const match = tokens.find((t) => sameToken(t as any, prev));
      return match ? mergeTokenFields(prev, match) : prev;
    });
  }, [tokens, setSellToken, setBuyToken]);

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
