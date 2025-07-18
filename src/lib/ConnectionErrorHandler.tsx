import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Global error handler for wallet connection issues
 * Provides user-friendly notifications and prevents console spam
 */
export function ConnectionErrorHandler() {
  useEffect(() => {
    // Extended list of wallet connection error patterns
    const errorPatterns = [
      "getChainId is not a function",
      "connector.getChainId",
      "connections.get is not a function",
      "Cannot read properties of undefined (reading 'getChainId')",
      "connector is undefined",
    ];

    // Track error state and user notifications
    let lastErrorTime = 0;
    let handlingError = false;
    let lastNotificationTime = 0;

    // Use a properly typed event handler for 'error' events
    const handleError = (event: Event) => {
      // Early return if we're actively handling an error or throttling
      if (handlingError) return false;

      // Type guard to ensure we're dealing with an ErrorEvent
      if (!(event instanceof ErrorEvent)) return false;

      const now = Date.now();
      // Only process one error every 2 seconds maximum
      if (now - lastErrorTime < 2000) return false;

      const errorMsg = event.error?.message || event.message;
      if (!errorMsg || typeof errorMsg !== "string") return false;

      // Check if this is one of our targeted errors
      const isConnectionError = errorPatterns.some((pattern) => errorMsg.includes(pattern));

      if (isConnectionError) {
        handlingError = true;
        lastErrorTime = now;

        // Suppress the error to prevent console spam
        event.preventDefault();

        // Show user notification (throttled to once per 30 seconds)
        if (now - lastNotificationTime > 30000) {
          lastNotificationTime = now;
          toast.error("Wallet connection issue detected", {
            description: "If transactions fail, please refresh the page and reconnect your wallet.",
            duration: 5000,
            action: {
              label: "Refresh",
              onClick: () => window.location.reload(),
            },
          });
        }

        // Reset the handling flag after a short delay
        setTimeout(() => {
          handlingError = false;
        }, 50);
      }

      return false; // Standard return for EventListener
    };

    // Handle unhandled promise rejections as well
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (handlingError) return;

      const now = Date.now();
      if (now - lastErrorTime < 2000) return;

      const errorMsg = event.reason?.message || event.reason?.toString() || "";
      if (!errorMsg || typeof errorMsg !== "string") return;

      const isConnectionError = errorPatterns.some((pattern) => errorMsg.includes(pattern));

      if (isConnectionError) {
        handlingError = true;
        lastErrorTime = now;

        // Prevent default handling
        event.preventDefault();

        // Show user notification (throttled)
        if (now - lastNotificationTime > 30000) {
          lastNotificationTime = now;
          toast.error("Wallet connection issue detected", {
            description: "If transactions fail, please refresh the page and reconnect your wallet.",
            duration: 5000,
            action: {
              label: "Refresh",
              onClick: () => window.location.reload(),
            },
          });
        }

        setTimeout(() => {
          handlingError = false;
        }, 50);
      }
    };

    // Add our custom error handlers
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      // Clean up by removing our handlers
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  // This component doesn't render anything
  return null;
}

export default ConnectionErrorHandler;
