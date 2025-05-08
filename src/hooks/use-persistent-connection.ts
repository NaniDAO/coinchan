import { useEffect } from 'react';
import { useAccount } from 'wagmi';

/**
 * Simple hook to save wallet address for UI state persistence
 * This works alongside Wagmi's built-in reconnectOnMount feature
 * without trying to manage connections directly
 */
export function usePersistentConnection() {
  // Simplified account access - avoid unnecessary properties
  const { address } = useAccount();

  // Only keep track of the address for UI display during reconnection
  useEffect(() => {
    if (address) {
      sessionStorage.setItem('lastConnectedAddress', address);
    }
  }, [address]);

  // Return nothing - this hook is just for side effects
  return {};
}

export default usePersistentConnection;