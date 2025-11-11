import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, parseUnits, zeroAddress } from "viem";
import type { PublicClient } from "viem";
import { findAllRoutes, type RouteOption } from "zrouter-sdk";
import type { TokenMeta } from "@/lib/coins";
import { toZRouterToken } from "@/lib/zrouter";
import { TokenMetadata } from "@/lib/pools";

type Side = "EXACT_IN" | "EXACT_OUT";

export interface UseZRouterQuoteArgs {
    publicClient?: PublicClient | null;
    sellToken?: TokenMeta | TokenMetadata | null;
    buyToken?: TokenMeta | TokenMetadata | null;
    /** raw user input as a string (e.g. "1.25") */
    rawAmount?: string;
    /** which side the user edited */
    side: Side;
    /** toggle the query; defaults to auto-enabled when inputs are valid */
    enabled?: boolean;

    /** Owner/recipient address for the swap (defaults to zeroAddress if not provided) */
    owner?: `0x${string}` | null;
}

export interface RouteOptionUI {
    route: RouteOption;
    amountIn: string;
    amountOut: string;
    venue: string;
    sources?: string[];
    isMultiHop: boolean;
}

export interface ZRouterQuoteResult {
    ok: boolean;
    amountIn?: string;
    amountOut?: string;
    /** All available routes sorted by best first */
    routes?: RouteOptionUI[];
}

function isValidNumberLike(v?: string) {
    if (!v) return false;
    const n = Number(v);
    return Number.isFinite(n) && n > 0;
}

/**
 * A single-source-of-truth quote hook that fetches ALL available routes.
 * - Returns multiple route options for user selection
 * - Includes Matcha adapter support when API key is provided
 * - Routes are sorted by best first (highest output for EXACT_IN, lowest input for EXACT_OUT)
 * - No refetch on window focus/reconnect
 * - Cached for reuse when user selects a route
 */
export function useZRouterQuote({
    publicClient,
    sellToken,
    buyToken,
    rawAmount,
    side,
    enabled,
    owner,
}: UseZRouterQuoteArgs) {
    // Resolve tokens & decimals once
    const tokenIn = useMemo(
        () => toZRouterToken(sellToken || undefined),
        [sellToken],
    );
    const tokenOut = useMemo(
        () => toZRouterToken(buyToken || undefined),
        [buyToken],
    );
    const sellDecimals = sellToken?.decimals ?? 18;
    const buyDecimals = buyToken?.decimals ?? 18;

    // Compute the viem "amount" input up-front (to freeze the queryKey precisely on what matters)
    const parsedAmount = useMemo(() => {
        if (!isValidNumberLike(rawAmount)) return undefined;
        const dec = side === "EXACT_IN" ? sellDecimals : buyDecimals;
        try {
            return parseUnits(rawAmount!, dec);
        } catch {
            return undefined;
        }
    }, [rawAmount, side, sellDecimals, buyDecimals]);

    // Build a stable query key so React Query only runs when any part changes
    const queryKey = useMemo(
        () =>
            [
                "zrouter-all-routes",
                side,
                // key parts must be serializable/stable; we use address+id to represent tokens
                tokenIn?.address ?? null,
                // if token has an id include it, else null
                (tokenIn as any)?.id?.toString() ?? null,
                tokenOut?.address ?? null,
                (tokenOut as any)?.id?.toString() ?? null,
                parsedAmount?.toString() ?? null,
                sellDecimals?.toString(),
                buyDecimals?.toString(),
                owner ?? null,
            ] as const,
        [
            side,
            tokenIn,
            tokenOut,
            parsedAmount,
            sellDecimals,
            buyDecimals,
            owner,
        ],
    );

    const autoEnabled =
        !!publicClient && !!tokenIn && !!tokenOut && !!parsedAmount;

    return useQuery<ZRouterQuoteResult>({
        queryKey,
        enabled: enabled ?? autoEnabled,
        queryFn: async () => {
            // Safety guards (also protect against TS narrowing)
            if (!publicClient || !tokenIn || !tokenOut || !parsedAmount)
                return { ok: false };

            // Get Matcha API key from environment
            const matchaApiKey = import.meta.env.VITE_MATCHA_API_KEY;

            // Get matcha config if API key is provided
            const matchaConfig = matchaApiKey
                ? { apiKey: matchaApiKey }
                : undefined;

            console.log("Is Matcha Config ?", matchaConfig);

            // Fetch ALL available routes
            const allRoutes = await findAllRoutes(publicClient, {
                tokenIn,
                tokenOut,
                side,
                amount: parsedAmount,
                deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 10), // 10 min deadline
                owner: owner ?? zeroAddress, // Use actual owner if provided, fallback to zeroAddress for quoting
                slippageBps: 50, // 0.5% default slippage for quoting
                matchaConfig,
            });

            if (allRoutes.length === 0) {
                return { ok: false };
            }

            console.log("All routes:", {
                tokenIn,
                tokenOut,
                side,
                owner: owner ?? zeroAddress,
                allRoutes,
            });

            // Convert routes to UI format
            const routes: RouteOptionUI[] = allRoutes.map((route) => {
                let amountIn: string;
                let amountOut: string;

                if (side === "EXACT_IN") {
                    amountIn = rawAmount!;
                    amountOut = formatUnits(route.expectedAmount, buyDecimals);
                } else {
                    amountIn = formatUnits(route.expectedAmount, sellDecimals);
                    amountOut = rawAmount!;
                }

                return {
                    route,
                    amountIn,
                    amountOut,
                    venue: route.venue,
                    sources: route.metadata.sources,
                    isMultiHop: route.metadata.isMultiHop,
                };
            });

            // Deduplicate routes based on route signature (venue + sources + hop type)
            const uniqueRoutes: RouteOptionUI[] = [];
            const seenRouteSignatures = new Set<string>();

            for (const routeOption of routes) {
                // Create a unique signature for this route
                const signature = JSON.stringify({
                    venue: routeOption.venue,
                    sources: routeOption.sources?.sort() ?? [],
                    isMultiHop: routeOption.isMultiHop,
                    // Round amounts to avoid minor precision differences
                    amountOut:
                        side === "EXACT_IN"
                            ? Number(routeOption.amountOut).toFixed(6)
                            : undefined,
                    amountIn:
                        side === "EXACT_OUT"
                            ? Number(routeOption.amountIn).toFixed(6)
                            : undefined,
                });

                if (!seenRouteSignatures.has(signature)) {
                    seenRouteSignatures.add(signature);
                    uniqueRoutes.push(routeOption);
                }
            }

            // Sort routes by quality (best first)
            // For EXACT_IN: higher amountOut is better
            // For EXACT_OUT: lower amountIn is better
            uniqueRoutes.sort((a, b) => {
                if (side === "EXACT_IN") {
                    const aOut = Number(a.amountOut);
                    const bOut = Number(b.amountOut);
                    return bOut - aOut; // descending (higher output is better)
                } else {
                    const aIn = Number(a.amountIn);
                    const bIn = Number(b.amountIn);
                    return aIn - bIn; // ascending (lower input is better)
                }
            });

            // Limit to top 10 routes to avoid overwhelming the user
            const limitedRoutes = uniqueRoutes.slice(0, 10);

            // Best route is first
            const bestRoute = limitedRoutes[0];

            return {
                ok: true,
                amountIn: bestRoute.amountIn,
                amountOut: bestRoute.amountOut,
                routes: limitedRoutes,
            };
        },
    });
}
