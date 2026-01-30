/**
 * Umami Analytics Hook for Coinchan
 *
 * Privacy-focused analytics tracking for:
 * - Swap completions
 * - Token pair popularity
 * - Venue usage
 * - Error tracking
 *
 * IMPORTANT: Never track PII, wallet addresses, or transaction amounts
 */

export interface SwapEventData {
  /** Token symbol (e.g., 'ETH', 'USDC') - NOT address */
  tokenInSymbol: string;
  tokenOutSymbol: string;
  /** Venue/protocol used (e.g., 'UNI_V3', 'SUSHI_V2') */
  venue: string;
  /** Swap direction */
  side: "EXACT_IN" | "EXACT_OUT";
  /** Optional: Route type */
  routeType?: "single-hop" | "multi-hop";
  /** Optional: Number of steps in route */
  steps?: number;
}

export interface RouteSearchEventData {
  tokenInSymbol: string;
  tokenOutSymbol: string;
  /** How many route options were found */
  routesFound: number;
}

export const useAnalytics = () => {
  /**
   * Track successful swap completion
   */
  const trackSwap = (data: SwapEventData) => {
    if (typeof window !== "undefined" && window.umami) {
      window.umami.track("swap-completed", {
        pair: `${data.tokenInSymbol}/${data.tokenOutSymbol}`,
        venue: data.venue,
        side: data.side,
        routeType: data.routeType,
        steps: data.steps,
      });
    }
  };

  /**
   * Track swap errors (helps identify UX pain points)
   */
  const trackSwapError = (errorType: string, context?: Record<string, string>) => {
    if (typeof window !== "undefined" && window.umami) {
      window.umami.track("swap-error", {
        type: errorType,
        ...context,
      });
    }
  };

  /**
   * Track when user searches for a route
   * Helps understand which pairs users are interested in
   */
  const trackRouteSearch = (data: RouteSearchEventData) => {
    if (typeof window !== "undefined" && window.umami) {
      window.umami.track("route-search", {
        pair: `${data.tokenInSymbol}/${data.tokenOutSymbol}`,
        routesFound: data.routesFound,
      });
    }
  };

  /**
   * Track wallet connection
   */
  const trackWalletConnect = (walletType?: string) => {
    if (typeof window !== "undefined" && window.umami) {
      window.umami.track("wallet-connected", {
        type: walletType || "unknown",
      });
    }
  };

  /**
   * Track wallet disconnection
   */
  const trackWalletDisconnect = () => {
    if (typeof window !== "undefined" && window.umami) {
      window.umami.track("wallet-disconnected");
    }
  };

  /**
   * Track when user approves tokens
   */
  const trackTokenApproval = (tokenSymbol: string, spender: "router" | "permit2" | "other") => {
    if (typeof window !== "undefined" && window.umami) {
      window.umami.track("token-approval", {
        token: tokenSymbol,
        spender,
      });
    }
  };

  /**
   * Track route simulation (helps understand if users are checking before swapping)
   */
  const trackRouteSimulation = (success: boolean) => {
    if (typeof window !== "undefined" && window.umami) {
      window.umami.track("route-simulation", {
        success: success ? "yes" : "no",
      });
    }
  };

  /**
   * Generic custom event tracker
   */
  const trackEvent = (eventName: string, properties?: Record<string, any>) => {
    if (typeof window !== "undefined" && window.umami) {
      window.umami.track(eventName, properties);
    }
  };

  return {
    trackSwap,
    trackSwapError,
    trackRouteSearch,
    trackWalletConnect,
    trackWalletDisconnect,
    trackTokenApproval,
    trackRouteSimulation,
    trackEvent,
  };
};

/**
 * Helper to extract token symbol from token object
 * You might need to adjust this based on your token data structure
 */
export const getTokenSymbol = (token: any): string => {
  // Handle ETH
  if (token.address === "0x0000000000000000000000000000000000000000") {
    return "ETH";
  }

  // Try to get symbol from token object
  if (token.symbol) return token.symbol;
  if (token.name) return token.name;

  // Fallback: use short address
  return token.address?.slice(0, 6) || "UNKNOWN";
};

/**
 * Helper to map zRouter venue to analytics-friendly name
 */
export const mapVenueToAnalytics = (venue: string): string => {
  const venueMap: Record<string, string> = {
    UNI_V2: "Uniswap-V2",
    SUSHI_V2: "Sushiswap-V2",
    UNI_V3: "Uniswap-V3",
    UNI_V4: "Uniswap-V4",
    VZ: "ZAMM",
    WRAP_UNWRAP: "Wrap",
    MATCHA: "Matcha-0x",
  };

  return venueMap[venue] || venue;
};
