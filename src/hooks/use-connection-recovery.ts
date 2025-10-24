import { useEffect, useRef } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { toast } from "sonner";

/**
 * Hook to handle wallet connection recovery when connector errors occur
 * Provides defensive checks and automatic recovery from connector state issues
 */
export function useConnectionRecovery() {
  const { isConnected, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const { connectors, connect } = useConnect();
  const lastErrorTime = useRef<number>(0);
  const recoveryAttempted = useRef<boolean>(false);
  const lastValidationTime = useRef<number>(0);

  useEffect(() => {
    if (!isConnected || !connector) return;

    // Periodically validate connector state to catch issues early
    const validateConnector = () => {
      const now = Date.now();
      // Only validate once every 30 seconds to avoid overhead
      if (now - lastValidationTime.current < 30000) return;
      lastValidationTime.current = now;

      try {
        // Test if connector has required methods
        if (typeof connector.getChainId !== "function") {
          console.warn("Connector missing getChainId method, may need reconnection");
          recoveryAttempted.current = false; // Allow recovery on next error
        }
      } catch (error) {
        console.warn("Connector validation failed:", error);
      }
    };

    // Run initial validation
    validateConnector();

    // Set up periodic validation
    const validationInterval = setInterval(validateConnector, 30000);

    // Cleanup
    return () => {
      clearInterval(validationInterval);
    };

  }, [isConnected, connector, disconnect]);

  // Separate effect for error handling
  useEffect(() => {
    // Set up error handler for connector errors
    const handleConnectorError = (error: Error) => {
      const errorMessage = error?.message || "";
      const now = Date.now();

      // Check if this is a connector-related error
      if (
        errorMessage.includes("getChainId is not a function") ||
        errorMessage.includes("connector.getChainId") ||
        errorMessage.includes("connections.get is not a function") ||
        errorMessage.includes("connector is undefined")
      ) {
        // Throttle error handling (one attempt per 15 seconds)
        if (now - lastErrorTime.current < 15000) return;
        lastErrorTime.current = now;

        // Only attempt recovery once per error cycle
        if (recoveryAttempted.current) return;
        recoveryAttempted.current = true;

        console.warn("Wallet connector error detected, attempting recovery...");

        // Show user-friendly notification with reconnect option
        toast.error("Wallet connection issue detected", {
          description: "Please reconnect your wallet to continue.",
          duration: 7000,
          action: {
            label: "Reconnect",
            onClick: () => {
              // Disconnect and allow user to reconnect manually
              disconnect();
              recoveryAttempted.current = false;
            },
          },
        });
      }
    };

    // Listen for unhandled promise rejections (where these errors often occur)
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (event.reason instanceof Error) {
        handleConnectorError(event.reason);
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [disconnect]);

  // Separate effect to monitor connection state changes
  useEffect(() => {
    // Reset recovery flag when connection changes
    if (isConnected && connector) {
      // Connection is good, reset recovery flag
      recoveryAttempted.current = false;
    }
  }, [isConnected, connector]);

  // Return a manual recovery function that components can call
  const attemptRecovery = async () => {
    try {
      // First disconnect
      disconnect();

      // Wait a bit for cleanup
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Try to reconnect with the first available connector
      const availableConnector = connectors[0];
      if (availableConnector) {
        connect({ connector: availableConnector });
      }
    } catch (error) {
      console.error("Failed to recover connection:", error);
      toast.error("Failed to recover wallet connection. Please refresh the page.");
    }
  };

  return { attemptRecovery };
}
