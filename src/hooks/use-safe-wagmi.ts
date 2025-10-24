import { useAccount as useAccountOriginal, type UseAccountReturnType } from "wagmi";
import { useMemo } from "react";

/**
 * Safe wrapper around wagmi's useAccount hook that provides defensive checks
 * to prevent "connector.getChainId is not a function" errors
 */
export function useSafeAccount(): UseAccountReturnType {
  const account = useAccountOriginal();

  // Wrap the account object with defensive checks
  const safeAccount = useMemo(() => {
    // If connector exists, validate it has required methods
    if (account.connector) {
      try {
        // Test if connector has required methods
        const hasGetChainId = typeof account.connector.getChainId === "function";

        if (!hasGetChainId) {
          console.warn("Connector missing required methods, connection may be unstable");
          // Return account without connector to prevent errors
          return {
            ...account,
            connector: undefined,
            isConnected: false,
          } as UseAccountReturnType;
        }
      } catch (error) {
        console.warn("Error validating connector:", error);
        // Return safe fallback
        return {
          ...account,
          connector: undefined,
          isConnected: false,
        } as UseAccountReturnType;
      }
    }

    return account;
  }, [account]);

  return safeAccount;
}

/**
 * Hook to check if the current connector is in a valid state
 */
export function useConnectorHealth() {
  const { connector, isConnected } = useAccountOriginal();

  const isHealthy = useMemo(() => {
    if (!isConnected || !connector) {
      return true; // Not connected is a valid state
    }

    try {
      // Check if connector has required methods
      return typeof connector.getChainId === "function";
    } catch (error) {
      console.warn("Connector health check failed:", error);
      return false;
    }
  }, [connector, isConnected]);

  return {
    isHealthy,
    connector,
    isConnected,
  };
}
