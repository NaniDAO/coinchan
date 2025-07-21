import { useEffect, useCallback } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { mainnet } from 'wagmi/chains';

interface UseMainnetCheckOptions {
  // Whether to automatically switch to mainnet
  autoSwitch?: boolean;
  // Callback when user is on wrong network
  onWrongNetwork?: () => void;
  // Callback when switching networks
  onSwitching?: () => void;
  // Callback when switch is successful
  onSwitchSuccess?: () => void;
  // Callback when switch fails
  onSwitchError?: (error: Error) => void;
}

export const useMainnetCheck = (options: UseMainnetCheckOptions = {}) => {
  const { autoSwitch = true, onWrongNetwork, onSwitching, onSwitchSuccess, onSwitchError } = options;
  
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain();
  
  const isOnMainnet = chainId === mainnet.id;
  const needsNetworkSwitch = isConnected && !isOnMainnet;
  
  // Attempt to switch to mainnet
  const switchToMainnet = useCallback(async () => {
    if (!switchChain || isOnMainnet) return;
    
    try {
      onSwitching?.();
      await switchChain({ chainId: mainnet.id });
      onSwitchSuccess?.();
    } catch (error) {
      console.error('Failed to switch to mainnet:', error);
      onSwitchError?.(error as Error);
    }
  }, [switchChain, isOnMainnet, onSwitching, onSwitchSuccess, onSwitchError]);
  
  // Auto-switch effect
  useEffect(() => {
    if (needsNetworkSwitch && autoSwitch && !isSwitching) {
      // Give user a moment to see what's happening
      const timer = setTimeout(() => {
        switchToMainnet();
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [needsNetworkSwitch, autoSwitch, isSwitching, switchToMainnet]);
  
  // Notify about wrong network
  useEffect(() => {
    if (needsNetworkSwitch) {
      onWrongNetwork?.();
    }
  }, [needsNetworkSwitch, onWrongNetwork]);
  
  return {
    isOnMainnet,
    needsNetworkSwitch,
    isSwitching,
    switchError,
    switchToMainnet,
    chainId,
  };
};

// Helper hook for components that require mainnet
export const useRequireMainnet = () => {
  const { isOnMainnet, isSwitching } = useMainnetCheck({ autoSwitch: true });
  
  // Return loading state while switching
  const isReady = isOnMainnet && !isSwitching;
  
  return { isReady, isOnMainnet, isSwitching };
};