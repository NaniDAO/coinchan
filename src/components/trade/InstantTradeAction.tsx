import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import type { Recommendation } from "@/types/recommendations";

import { useTokenPair } from "@/hooks/use-token-pair";
import { TradeController } from "./TradeController";
import { TradePanel } from "./TradePanel";
import { useGetTokens } from "@/hooks/use-get-tokens";
import { cn } from "@/lib/utils";
import { FlipActionButton } from "../FlipActionButton";
import { ETH_TOKEN, sameToken, TokenMetadata, ZAMM_TOKEN } from "@/lib/pools";
import { encodeFunctionData, formatUnits, maxUint256, type Address } from "viem";
import { mainnet } from "viem/chains";
import { useAccount, useChainId, usePublicClient, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { useZRouterQuote } from "@/hooks/use-zrouter-quote";
import { buildRoutePlan, mainnetConfig, simulateRoute, erc20Abi, zRouterAbi } from "zrouter-sdk";
import { CoinsAbi } from "@/constants/Coins";
import { SLIPPAGE_BPS } from "@/lib/swap";
import { handleWalletError, isUserRejectionError } from "@/lib/errors";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";
import { InfoIcon, Loader2 } from "lucide-react";
import { SlippageSettings } from "../SlippageSettings";

import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { encodeTokenQ, parseTokenQ, findTokenFlexible, isCanonicalTokenQ } from "@/lib/token-query";

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
function resolveFromUrl(tokens: TokenMetadata[] | undefined, q?: string): Partial<TokenMetadata> | undefined {
  if (!q) return undefined;
  const match =
    tokens && tokens.length ? (findTokenFlexible(tokens as any, q) as TokenMetadata | undefined) : undefined;

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

export const InstantTradeAction = forwardRef<
  { setTokensFromRecommendation: (rec: Recommendation) => void },
  InstantTradeActionProps
>(({ locked = false, initialSellToken, initialBuyToken, useSearchHook = false }, ref) => {
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

  // Prevent errors during initialization when publicClient isn't ready
  if (!publicClient) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  /** ------------------------------------------------------------
   * Seed useTokenPair from URL so first paint reflects deep link
   * ------------------------------------------------------------ */
  const urlInitialSell = useMemo(
    () => (useSearchHook ? (resolveFromUrl(tokens, search.sellToken) as TokenMetadata | undefined) : undefined),
    // include `tokens` so if they arrive before first render, we seed with richer info
    [useSearchHook, search.sellToken, tokens],
  );

  const urlInitialBuy = useMemo(
    () => (useSearchHook ? (resolveFromUrl(tokens, search.buyToken) as TokenMetadata | undefined) : undefined),
    [useSearchHook, search.buyToken, tokens],
  );

  const { sellToken, setSellToken, buyToken, setBuyToken, flip } = useTokenPair({
    initial: {
      // Priority: URL → explicit props → defaults
      sellToken: (urlInitialSell as TokenMetadata) ?? initialSellToken ?? ETH_TOKEN,
      buyToken: (urlInitialBuy as TokenMetadata) ?? initialBuyToken ?? ZAMM_TOKEN,
    },
  });

  const [sellAmount, setSellAmount] = useState("");
  const [buyAmount, setBuyAmount] = useState("");
  const [lastEditedField, setLastEditedField] = useState<"sell" | "buy">("sell");
  const [slippageBps, setSlippageBps] = useState<bigint>(SLIPPAGE_BPS);

  const { sendTransactionAsync, isPending, error: writeError } = useSendTransaction();
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // Local UI error + suppression
  const [txError, setTxError] = useState<string | null>(null);
  const [suppressErrors, setSuppressErrors] = useState(false);

  // Track if swap execution has started (clicked) - distinct from isPending
  const [isExecuting, setIsExecuting] = useState(false);

  // Track whether user manually changed the pair (to avoid re-hydrating/overwriting)
  const userChangedPairRef = useRef(false);
  const didInitialUrlHydrate = useRef(false);
  const loadingFromRecommendationRef = useRef(false);

  const clearErrorsOnUserEdit = () => {
    setTxError(null);
    setSuppressErrors(true);
    setIsExecuting(false);
  };

  // Reset amounts when pair changes (skip first URL hydration-triggered change and recommendation loads)
  useEffect(() => {
    if (!didInitialUrlHydrate.current && useSearchHook) {
      didInitialUrlHydrate.current = true;
      return;
    }
    // Don't reset amounts if we're loading from a recommendation
    if (loadingFromRecommendationRef.current) {
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
    const canonSellCandidate = (tokens.length && findTokenFlexible(tokens as any, search.sellToken)) || undefined;
    const canonBuyCandidate = (tokens.length && findTokenFlexible(tokens as any, search.buyToken)) || undefined;

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
        (canonSellCandidate ?? (sellToken as TokenMetadata) ?? (matchSell as TokenMetadata)) as TokenMetadata,
      );
      if (encoded) updates.sellToken = encoded;
    }
    if (!search.buyToken && (buyToken || matchBuy)) {
      let encoded = encodeTokenQ(
        (canonBuyCandidate ?? (buyToken as TokenMetadata) ?? (matchBuy as TokenMetadata)) as TokenMetadata,
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
    Number(rawAmount) > 0 &&
    !loadingFromRecommendationRef.current;

  // Get Matcha API key from environment
  const matchaApiKey = import.meta.env.VITE_MATCHA_API_KEY;

  const { data: quote, isFetching: isQuoteFetching } = useZRouterQuote({
    publicClient: publicClient ?? undefined,
    sellToken,
    buyToken,
    rawAmount,
    side,
    enabled: quotingEnabled,
    matchaApiKey,
  });

  // Track selected route index (defaults to 0 = best route)
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);

  // Reset selected route when new quotes arrive
  useEffect(() => {
    setSelectedRouteIndex(0);
  }, [quote?.routes]);

  // Reflect quote into the opposite field (use selected route's amounts)
  useEffect(() => {
    if (!quotingEnabled || !quote?.ok || !quote.routes) return;

    const selectedRoute = quote.routes[selectedRouteIndex] || quote.routes[0];
    if (!selectedRoute) return;

    if (lastEditedField === "sell") {
      if (buyAmount !== selectedRoute.amountOut) setBuyAmount(selectedRoute.amountOut);
    } else {
      if (sellAmount !== selectedRoute.amountIn) setSellAmount(selectedRoute.amountIn);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote, quotingEnabled, lastEditedField, selectedRouteIndex]);

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
    // Set executing immediately to disable button and prevent multiple clicks
    setIsExecuting(true);

    try {
      if (!isConnected || !owner) {
        setTxError("Connect your wallet to proceed");
        setIsExecuting(false);
        return;
      }
      if (!sellToken || !buyToken || !publicClient) {
        setTxError("Select tokens and enter an amount");
        setIsExecuting(false);
        return;
      }
      if (!rawAmount || Number(rawAmount) <= 0) {
        setTxError("Enter an amount to swap");
        setIsExecuting(false);
        return;
      }
      if (chainId !== mainnet.id) {
        setTxError("Wrong network: switch to Ethereum Mainnet");
        setIsExecuting(false);
        return;
      }

      setTxError(null);

      // Use the selected route from cached quotes (no refetching!)
      const selectedRoute = quote?.routes?.[selectedRouteIndex];

      if (!selectedRoute) {
        setTxError("No route selected. Please wait for quotes to load.");
        setIsExecuting(false);
        return;
      }

      // Get the steps from the selected route
      const steps = selectedRoute.route.steps;

      if (!steps.length) {
        setTxError("Invalid route selected");
        setIsExecuting(false);
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
        setIsExecuting(false);
        return;
      }

      const { calls, value, approvals, targets } = plan;

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
        targets,
      });

      if (!sim) {
        setTxError("Failed to simulate route");
        setIsExecuting(false);
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
      setIsExecuting(false);
    } catch (err) {
      console.error("Caught error:", err);
      const msg = handleWalletError(err);
      // Only set error if it's not a user rejection (handleWalletError returns null for rejections)
      if (msg !== null) {
        setTxError(msg);
      }
      setIsExecuting(false);
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

  const hasSell = useMemo(() => !!(sellToken?.balance && BigInt(sellToken.balance) > 0n), [sellToken?.balance]);

  // Expose method to set tokens from recommendation via ref
  useImperativeHandle(
    ref,
    () => ({
      setTokensFromRecommendation: (rec: Recommendation) => {
        clearErrorsOnUserEdit();
        userChangedPairRef.current = true;

        // Set flag to prevent quote from overwriting the recommendation amount
        loadingFromRecommendationRef.current = true;

        // Convert recommendation TokenMetadata to app's TokenMetadata format
        const convertToken = (token: Recommendation["tokenIn"] | Recommendation["tokenOut"]): TokenMetadata => {
          // For ERC6909 tokens, parse the id as bigint; for ERC20, use 0n
          const tokenId = token.standard === "ERC6909" && token.id ? BigInt(token.id) : 0n;

          return {
            address: token.address as Address,
            id: tokenId,
            decimals: token.decimals,
            name: token.name,
            symbol: token.symbol,
            imageUrl: token.imageUrl,
            standard: token.standard === "ERC6909" ? "ERC6909" : "ERC20",
          } as TokenMetadata;
        };

        const newSellToken = convertToken(rec.tokenIn);
        const newBuyToken = convertToken(rec.tokenOut);

        // Set tokens first
        setSellToken(newSellToken);
        setBuyToken(newBuyToken);

        // Use setTimeout to ensure tokens are set before amounts
        // This prevents race conditions with the quote effect
        setTimeout(() => {
          // Reset flag BEFORE setting amounts so quote hook can run when amounts update
          loadingFromRecommendationRef.current = false;

          // Set the amount based on the side
          if (rec.side === "SWAP_EXACT_IN") {
            setSellAmount(rec.amount);
            setBuyAmount("");
            setLastEditedField("sell");
          } else {
            setBuyAmount(rec.amount);
            setSellAmount("");
            setLastEditedField("buy");
          }
        }, 0);

        // Update URL if search hook is enabled
        if (useSearchHook) {
          navigate({
            to: ".",
            replace: true,
            search: (s: any) => ({
              ...s,
              sellToken: encodeTokenQ(newSellToken),
              buyToken: encodeTokenQ(newBuyToken),
            }),
          });
        }

        // Scroll to swap form smoothly
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
    }),
    [setSellToken, setBuyToken, setSellAmount, setBuyAmount, setLastEditedField, useSearchHook, navigate],
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

        <div className={cn("absolute left-1/2 -translate-x-1/2 top-[50%] z-10")}>
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

      {/* Quote loading indicator */}
      {isQuoteFetching && quotingEnabled && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Fetching best price...</span>
        </div>
      )}

      {/* Route Selector */}
      {!isQuoteFetching && quote?.ok && quote.routes && quote.routes.length > 1 && (
        <div className="mt-2 p-3 bg-muted/30 rounded-lg space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Select Route</div>
          <div className="space-y-1.5">
            {quote.routes.map((routeOption, index) => {
              const isSelected = index === selectedRouteIndex;
              const isBest = index === 0;

              // Format venue name
              const venueName = routeOption.venue.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

              // Determine route type label
              const routeType = routeOption.isMultiHop ? "Multi-hop" : "Direct";

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => setSelectedRouteIndex(index)}
                  className={cn(
                    "w-full p-2.5 rounded-md text-left transition-all",
                    "border border-border/50 hover:border-primary/50",
                    "flex items-center justify-between gap-2",
                    isSelected && "bg-primary/10 border-primary",
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{venueName}</span>
                      {isBest && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-600 dark:text-green-400">
                          BEST
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">{routeType}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {side === "EXACT_IN"
                        ? `Get ${routeOption.amountOut} ${buyToken?.symbol || ""}`
                        : `Pay ${routeOption.amountIn} ${sellToken?.symbol || ""}`}
                    </div>
                    {routeOption.sources && routeOption.sources.length > 0 && (
                      <div className="text-[10px] text-muted-foreground mt-1">
                        via {routeOption.sources.slice(0, 3).join(", ")}
                        {routeOption.sources.length > 3 && ` +${routeOption.sources.length - 3} more`}
                      </div>
                    )}
                  </div>
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full border-2 flex-shrink-0",
                      isSelected ? "border-primary bg-primary" : "border-border",
                    )}
                  >
                    {isSelected && <div className="w-full h-full rounded-full bg-background scale-50" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="flex items-center p-1 justify-end flex-row">
        <HoverCard>
          <HoverCardTrigger asChild>
            <InfoIcon className="h-6 w-6 opacity-70 cursor-help hover:opacity-100 transition-opacity" />
          </HoverCardTrigger>
          <HoverCardContent className="w-[320px] space-y-3">
            <SlippageSettings slippageBps={slippageBps} setSlippageBps={setSlippageBps} />
            <p className="text-xs text-muted-foreground">Fees are paid to LPs</p>
          </HoverCardContent>
        </HoverCard>
      </div>

      {/* Action button */}
      <button
        onClick={executeSwap}
        disabled={!isConnected || !sellAmount || isExecuting || isPending}
        className={cn(
          `w-full mt-3 button text-base px-8 py-4 bg-primary! text-primary-foreground! dark:bg-primary! dark:text-primary-foreground! font-bold rounded-lg transition hover:scale-105`,
          (!isConnected || !sellAmount || isExecuting || isPending) && "opacity-50 cursor-not-allowed",
        )}
      >
        {isExecuting || isPending ? "Processing…" : !sellAmount ? "Get Started" : "Swap"}
      </button>

      {/* Errors / Success */}
      {writeError && !suppressErrors && !isUserRejectionError(writeError) && (
        <div className="mt-2 text-sm text-red-500">{handleWalletError(writeError) || "Transaction failed"}</div>
      )}
      {txError && !suppressErrors && <div className="mt-2 text-sm text-red-500">{txError}</div>}
      {isSuccess && <div className="mt-2 text-sm text-green-500">Transaction confirmed! Hash: {txHash}</div>}
    </div>
  );
});

InstantTradeAction.displayName = "InstantTradeAction";
