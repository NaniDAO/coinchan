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
import { buildRoutePlan, checkRouteApprovals, mainnetConfig, simulateRoute, erc20Abi, zRouterAbi } from "zrouter-sdk";
import { CoinsAbi } from "@/constants/Coins";
import { SLIPPAGE_BPS } from "@/lib/swap";
import { handleWalletError, isUserRejectionError } from "@/lib/errors";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";
import { InfoIcon, Loader2 } from "lucide-react";
import { SlippageSettings } from "../SlippageSettings";
import { RouteOptions } from "./RouteOptions";

import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { encodeTokenQ, parseTokenQ, findTokenFlexible, isCanonicalTokenQ } from "@/lib/token-query";
import { useAnalytics, getTokenSymbol, mapVenueToAnalytics } from "@/hooks/useAnalytics";

/** ----------------------------------------------------------------
 * URL token helpers
 * ---------------------------------------------------------------- */

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
      return {
        address: parsed.address,
        standard: "ERC20",
      };
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
  const { trackSwap, trackSwapError } = useAnalytics();

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

  // Debounce rawAmount to avoid quote requests on every keystroke
  const [debouncedRawAmount, setDebouncedRawAmount] = useState(rawAmount);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedRawAmount(rawAmount);
    }, 500); // 500ms debounce delay

    return () => clearTimeout(timer);
  }, [rawAmount]);

  const quotingEnabled =
    !!publicClient &&
    !!sellToken &&
    !!buyToken &&
    !!debouncedRawAmount &&
    Number(debouncedRawAmount) > 0 &&
    !loadingFromRecommendationRef.current;

  const { data: quote, isFetching: isQuoteFetching } = useZRouterQuote({
    publicClient: publicClient ?? undefined,
    sellToken,
    buyToken,
    rawAmount: debouncedRawAmount,
    side,
    enabled: quotingEnabled,
    owner,
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

      console.log("Checking route approvals:", {
        owner,
        router: mainnetConfig.router,
        steps,
      });

      // First, check what approvals are needed BEFORE building the plan
      // This is critical for Matcha routes which need approval before fetching calldata
      const requiredApprovals = await checkRouteApprovals(publicClient, {
        owner,
        router: mainnetConfig.router,
        steps,
      }).catch((error) => {
        console.error("Failed to check approvals:", error);
        return [];
      });

      console.log("Required approvals:", requiredApprovals);

      // Execute all required approvals and wait for confirmations
      if (requiredApprovals && requiredApprovals.length > 0) {
        for (const approval of requiredApprovals) {
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
          // Wait for each approval to be confirmed onchain before proceeding
          await publicClient.waitForTransactionReceipt({ hash });
        }
      }

      console.log("Building route plan:", {
        owner,
        router: mainnetConfig.router,
        steps,
        finalTo: owner as Address,
      });

      // Now build the route plan with approvals confirmed onchain
      // For Matcha routes, this ensures fresh calldata is generated with correct approval state
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

      console.log("Built plan successfully:", plan);

      const { calls, value, targets } = plan;

      // Simulate route execution
      // Note: Some RPC endpoints (like Cloudflare) don't support eth_createAccessList
      // which is used by simulateRoute for gas optimization. We handle this gracefully.
      let sim;
      try {
        sim = await simulateRoute(publicClient, {
          router: mainnetConfig.router,
          account: owner,
          calls,
          value,
          approvals: [], // No longer checking approvals from buildRoutePlan
          targets,
        });

        if (!sim) {
          console.warn("Simulation returned null, proceeding without simulation");
        }
      } catch (simError: any) {
        // Check if error is due to eth_createAccessList not being supported
        const errorMessage = String(simError).toLowerCase();
        if (errorMessage.includes("eth_createaccesslist") || errorMessage.includes("method not found")) {
          console.warn("RPC endpoint doesn't support eth_createAccessList, skipping simulation:", simError);
          // Continue without simulation - this is OK since we already checked approvals
        } else {
          // For other simulation errors, fail the transaction
          console.error("Route simulation failed:", simError);
          setTxError("Route simulation failed. Please try again.");
          setIsExecuting(false);
          return;
        }
      }

      // Execute using the targets from the plan
      let hash: `0x${string}`;

      if (calls.length === 1) {
        // Single call: send to the specific target from the plan
        hash = await sendTransactionAsync({
          to: targets[0] ?? mainnetConfig.router,
          data: calls[0],
          value,
          chainId: mainnet.id,
          account: owner,
        });
      } else {
        // Multiple calls: check if all targets are the router
        const allTargetsAreRouter = targets.every((t) => t.toLowerCase() === mainnetConfig.router.toLowerCase());

        if (allTargetsAreRouter) {
          // All calls go to router: use multicall
          hash = await sendTransactionAsync({
            to: mainnetConfig.router,
            data: encodeFunctionData({
              abi: zRouterAbi,
              functionName: "multicall",
              args: [calls],
            }),
            value,
            chainId: mainnet.id,
            account: owner,
          });
        } else {
          // Mixed targets: execute calls sequentially to their respective targets
          console.log(
            "Executing multi-target plan:",
            targets.map((t, i) => ({ target: t, call: i })),
          );

          let lastHash: `0x${string}` | undefined;

          for (let i = 0; i < calls.length; i++) {
            const targetHash = await sendTransactionAsync({
              to: targets[i],
              data: calls[i],
              value: i === 0 ? value : 0n, // Only send value with first call
              chainId: mainnet.id,
              account: owner,
            });

            // Wait for each transaction to complete
            await publicClient.waitForTransactionReceipt({
              hash: targetHash,
            });

            lastHash = targetHash;
          }

          // Set hash to the last transaction for receipt tracking
          if (!lastHash) {
            throw new Error("Failed to execute multi-target plan: no transactions were sent");
          }
          hash = lastHash;
        }
      }

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
      });
      if (receipt.status !== "success") throw new Error("Transaction failed");

      // Track successful swap (catch errors to prevent breaking the flow)
      try {
        if (sellToken && buyToken && selectedRoute) {
          const firstStep = selectedRoute.route.steps[0];
          trackSwap({
            tokenInSymbol: getTokenSymbol(sellToken),
            tokenOutSymbol: getTokenSymbol(buyToken),
            venue: firstStep ? mapVenueToAnalytics(firstStep.kind) : "UNKNOWN",
            side,
            routeType: selectedRoute.route.steps.length > 1 ? "multi-hop" : "single-hop",
            steps: selectedRoute.route.steps.length,
          });
        }
      } catch (analyticsError) {
        console.error("Analytics tracking error (non-critical):", analyticsError);
      }

      setTxHash(hash);
      setIsExecuting(false);
    } catch (err) {
      console.error("Caught error:", err);
      const msg = handleWalletError(err);

      // Track swap error (catch analytics errors to prevent breaking the flow)
      try {
        if (sellToken && buyToken && !isUserRejectionError(err)) {
          // Get error details
          const errorMsg = String(err).toLowerCase();
          const errorName = (err as any)?.name || "Unknown";
          const errorCode = (err as any)?.code || (err as any)?.error?.code;

          // Determine error type and stage
          let errorType = "transaction-failed";
          let errorStage = "execution";

          if (errorMsg.includes("slippage")) {
            errorType = "slippage-exceeded";
          } else if (errorMsg.includes("insufficient")) {
            errorType = "insufficient-balance";
            errorStage = "pre-flight";
          } else if (errorMsg.includes("approval") || errorMsg.includes("approve")) {
            errorType = "approval-failed";
            errorStage = "approval";
          } else if (errorMsg.includes("simulation") || errorMsg.includes("simulate")) {
            errorType = "simulation-failed";
            errorStage = "simulation";
          } else if (errorMsg.includes("route") || errorMsg.includes("no route")) {
            errorType = "no-route-found";
            errorStage = "routing";
          } else if (errorMsg.includes("gas")) {
            errorType = "gas-estimation-failed";
            errorStage = "gas-estimation";
          } else if (errorMsg.includes("reverted")) {
            errorType = "transaction-reverted";
          }

          // Extract meaningful error snippet (first 100 chars, sanitized)
          const errorSnippet = String(err)
            .replace(/0x[a-fA-F0-9]{40}/g, "[ADDRESS]") // Remove addresses
            .replace(/\d{10,}/g, "[NUMBER]") // Remove large numbers
            .substring(0, 100);

          trackSwapError(errorType, {
            pair: `${getTokenSymbol(sellToken)}/${getTokenSymbol(buyToken)}`,
            stage: errorStage,
            errorName: errorName,
            ...(errorCode && { code: String(errorCode) }),
            snippet: errorSnippet,
          });
        }
      } catch (analyticsError) {
        console.error("Analytics tracking error (non-critical):", analyticsError);
      }

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

      {/* Route Options */}
      {!isQuoteFetching && quote?.ok && quote.routes && (
        <RouteOptions
          routes={quote.routes}
          selectedRouteIndex={selectedRouteIndex}
          onRouteSelect={setSelectedRouteIndex}
          side={side}
          sellToken={sellToken}
          buyToken={buyToken}
        />
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
