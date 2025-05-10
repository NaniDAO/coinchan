import { useEffect } from "react";
import { useAccount } from "wagmi";

/**
 * Enhanced hook to save wallet address for UI state persistence
 * This works alongside Wagmi's built-in reconnectOnMount feature
 * without trying to manage connections directly
 */
export function usePersistentConnection() {
  // Get both address and connection status
  const { address, status, isConnected } = useAccount();

  // More robust connection persistence logic
  useEffect(() => {
    // When connected and we have an address, store it reliably
    if (status === "connected" && address && isConnected) {
      sessionStorage.setItem("lastConnectedAddress", address);
      // Clear any connection attempt tracking since we're now connected
      sessionStorage.removeItem("connectionAttemptType");
    }

    // When disconnected, clear connection attempt type
    if (status === "disconnected") {
      sessionStorage.removeItem("connectionAttemptType");
      // We don't remove lastConnectedAddress here to allow reconnection UX
    }
  }, [address, status, isConnected]);

  // Use a cleanup function to handle the case when the app is closed/refreshed
  useEffect(() => {
    return () => {
      // This runs when component unmounts (app closing or page refresh)
      // We preserve address but clear connection attempt type
      if (address) {
        sessionStorage.setItem("lastConnectedAddress", address);
      }
      sessionStorage.removeItem("connectionAttemptType");
    };
  }, [address]);

  // Return nothing - this hook is just for side effects
  return {};
}

export default usePersistentConnection;
