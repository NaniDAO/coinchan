import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, parseUnits } from "viem";
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
    source?: "api" | "fallback"; // Track which source was used
}

function isValidNumberLike(v?: string) {
    if (!v) return false;
    const n = Number(v);
    return Number.isFinite(n) && n > 0;
}

/**
 * Deserialize routes from API (convert string BigInts back to bigint)
 */
function deserializeRoute(route: any): RouteOption {
    return {
        ...route,
        expectedAmount: BigInt(route.expectedAmount),
        steps: route.steps.map((step: any) => ({
            ...step,
            amount: step.amount != null ? BigInt(step.amount) : 0n,
            limit: step.limit != null ? BigInt(step.limit) : 0n,
            deadline: step.deadline != null ? BigInt(step.deadline) : 0n,
            tokenIn: {
                ...step.tokenIn,
                id: step.tokenIn.id ? BigInt(step.tokenIn.id) : undefined,
            },
            tokenOut: {
                ...step.tokenOut,
                id: step.tokenOut.id ? BigInt(step.tokenOut.id) : undefined,
            },
        })),
    };
}

/**
 * A single-source-of-truth quote hook that fetches ALL available routes.
 * - Primary: Calls zRouter API (includes Matcha + on-chain quotes)
 * - Fallback: Uses SDK directly for on-chain quotes only (if API fails)
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

            const zrouterApiUrl = import.meta.env.VITE_ZROUTER_API_URL;
            const chainId = await publicClient.getChainId();

            // TRY 1: Call zRouter API (gets Matcha + on-chain quotes)
            if (zrouterApiUrl) {
                try {
                    // Serialize tokens (convert BigInt to string)
                    const serializeToken = (token: any) => ({
                        ...token,
                        id: token.id ? token.id.toString() : undefined,
                    });

                    // Use valid placeholder address (Matcha rejects zero address)
                    const validOwner =
                        owner ?? "0x0000000000000000000000000000000000010000";

                    const response = await fetch(`${zrouterApiUrl}/quote`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            chainId: chainId.toString(),
                            tokenIn: serializeToken(tokenIn),
                            tokenOut: serializeToken(tokenOut),
                            side,
                            amount: parsedAmount.toString(),
                            owner: validOwner,
                            slippageBps: 50,
                        }),
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data.routes && data.routes.length > 0) {
                            console.log(
                                `✅ Got ${data.routes.length} routes from API (Matcha + on-chain)`,
                            );

                            // Deserialize routes (convert string BigInts to bigint)
                            const allRoutes = data.routes.map(deserializeRoute);

                            // Convert routes to UI format
                            const routes: RouteOptionUI[] = allRoutes.map(
                                (route: RouteOption) => {
                                    let amountIn: string;
                                    let amountOut: string;

                                    if (side === "EXACT_IN") {
                                        amountIn = rawAmount!;
                                        amountOut = formatUnits(
                                            route.expectedAmount,
                                            buyDecimals,
                                        );
                                    } else {
                                        amountIn = formatUnits(
                                            route.expectedAmount,
                                            sellDecimals,
                                        );
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
                                },
                            );

                            // Deduplicate routes
                            const uniqueRoutes: RouteOptionUI[] = [];
                            const seenRouteSignatures = new Set<string>();

                            for (const routeOption of routes) {
                                const signature = JSON.stringify({
                                    venue: routeOption.venue,
                                    sources: routeOption.sources?.sort() ?? [],
                                    isMultiHop: routeOption.isMultiHop,
                                    amountOut:
                                        side === "EXACT_IN"
                                            ? Number(
                                                  routeOption.amountOut,
                                              ).toFixed(6)
                                            : undefined,
                                    amountIn:
                                        side === "EXACT_OUT"
                                            ? Number(
                                                  routeOption.amountIn,
                                              ).toFixed(6)
                                            : undefined,
                                });

                                if (!seenRouteSignatures.has(signature)) {
                                    seenRouteSignatures.add(signature);
                                    uniqueRoutes.push(routeOption);
                                }
                            }

                            // Sort routes by quality
                            uniqueRoutes.sort((a, b) => {
                                if (side === "EXACT_IN") {
                                    const aOut = Number(a.amountOut);
                                    const bOut = Number(b.amountOut);
                                    return bOut - aOut;
                                } else {
                                    const aIn = Number(a.amountIn);
                                    const bIn = Number(b.amountIn);
                                    return aIn - bIn;
                                }
                            });

                            const bestRoute = uniqueRoutes[0];

                            return {
                                ok: true,
                                amountIn: bestRoute.amountIn,
                                amountOut: bestRoute.amountOut,
                                routes: uniqueRoutes,
                                source: "api" as const,
                            };
                        }
                    }

                    console.warn(
                        "⚠️  zRouter API returned no routes, falling back to SDK...",
                    );
                } catch (error) {
                    console.warn(
                        "⚠️  zRouter API failed, falling back to SDK:",
                        error,
                    );
                }
            }

            // FALLBACK: Use SDK directly for on-chain quotes only (no Matcha)
            console.log("🔄 Using SDK fallback for on-chain quotes only...");

            // Use valid placeholder address for consistency
            const validOwner =
                owner ?? "0x0000000000000000000000000000000000010000";

            const allRoutes = await findAllRoutes(publicClient, {
                tokenIn,
                tokenOut,
                side,
                amount: parsedAmount,
                deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 10),
                owner: validOwner,
                slippageBps: 50,
                // NO matchaConfig - only on-chain quotes in fallback
            });

            if (allRoutes.length === 0) {
                return { ok: false };
            }

            console.log(
                `✅ Got ${allRoutes.length} routes from SDK (on-chain only)`,
            );

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

            // Deduplicate routes
            const uniqueRoutes: RouteOptionUI[] = [];
            const seenRouteSignatures = new Set<string>();

            for (const routeOption of routes) {
                const signature = JSON.stringify({
                    venue: routeOption.venue,
                    sources: routeOption.sources?.sort() ?? [],
                    isMultiHop: routeOption.isMultiHop,
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

            // Sort routes by quality
            uniqueRoutes.sort((a, b) => {
                if (side === "EXACT_IN") {
                    const aOut = Number(a.amountOut);
                    const bOut = Number(b.amountOut);
                    return bOut - aOut;
                } else {
                    const aIn = Number(a.amountIn);
                    const bIn = Number(b.amountIn);
                    return aIn - bIn;
                }
            });

            const bestRoute = uniqueRoutes[0];

            return {
                ok: true,
                amountIn: bestRoute.amountIn,
                amountOut: bestRoute.amountOut,
                routes: uniqueRoutes,
                source: "fallback" as const,
            };
        },
    });
}
