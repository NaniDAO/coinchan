import { useEffect, useRef } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { toast } from "sonner";

/**
 * Hook to handle wallet connection recovery when connector errors occur
 */
export function useConnectionRecovery() {
  const { isConnected, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const { connectors, connect } = useConnect();
  const lastErrorTime = useRef<number>(0);
  const recoveryAttempted = useRef<boolean>(false);

  useEffect(() => {
    if (!isConnected || !connector) return;

    // Set up a proxy to detect connector errors
    const handleConnectorError = (error: Error) => {
      const errorMessage = error?.message || "";
      const now = Date.now();
      
      // Check if this is a connector-related error
      if (
        errorMessage.includes("getChainId is not a function") ||
        errorMessage.includes("connector.getChainId") ||
        errorMessage.includes("connections.get is not a function")
      ) {
        // Throttle error handling (one attempt per 10 seconds)
        if (now - lastErrorTime.current < 10000) return;
        lastErrorTime.current = now;

        // Only attempt recovery once per error cycle
        if (recoveryAttempted.current) return;
        recoveryAttempted.current = true;

        console.warn("Wallet connector error detected, attempting recovery...");
        
        // Show user-friendly notification
        toast.error("Wallet connection issue detected. Please reconnect your wallet.", {
          duration: 5000,
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

    // Reset recovery flag when connection changes
    const resetRecoveryFlag = () => {
      recoveryAttempted.current = false;
    };

    // Also listen for successful connection to reset the flag
    const checkConnection = setInterval(() => {
      if (isConnected && connector) {
        resetRecoveryFlag();
      }
    }, 5000);

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      clearInterval(checkConnection);
    };
  }, [isConnected, connector, disconnect]);

  // Return a manual recovery function that components can call
  const attemptRecovery = async () => {
    try {
      // First disconnect
      disconnect();
      
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));
      
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