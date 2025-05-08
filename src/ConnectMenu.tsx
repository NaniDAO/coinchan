import { useAccount, useConnect } from "wagmi";
import React, { useEffect, useState } from "react";
import { truncAddress } from "./lib/address";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const ConnectMenuComponent = () => {
  const { isConnected, address, status } = useAccount();
  const { connect, connectors } = useConnect();
  const [reconnecting, setReconnecting] = useState(false);
  
  // Performance-optimized status tracking with fewer state updates
  useEffect(() => {
    // Only update state if it's actually changing to prevent redundant renders
    const shouldShowReconnecting = status === 'reconnecting' || status === 'connecting';
    
    if (shouldShowReconnecting !== reconnecting) {
      setReconnecting(shouldShowReconnecting);
    }
    
    // Only store the address when connected and stable (not during transition states)
    if (status === 'connected' && address) {
      // Use requestIdleCallback for non-critical storage operations
      if (window.requestIdleCallback) {
        window.requestIdleCallback(() => {
          sessionStorage.setItem('lastConnectedAddress', address);
        });
      } else {
        // Fallback for browsers without requestIdleCallback
        setTimeout(() => {
          sessionStorage.setItem('lastConnectedAddress', address);
        }, 100);
      }
    }
  }, [status, address, reconnecting]);

  // When connected - show the address
  if (isConnected) {
    return (
      <div className="flex items-center">
        <div>{address ? truncAddress(address) : ""}</div>
        {/* <SignButton /> */}
      </div>
    );
  }
  
  // When reconnecting - show a reconnecting message with last known address if available
  if (reconnecting) {
    // Try to get last known address from sessionStorage to display during reconnection
    const lastAddress = sessionStorage.getItem('lastConnectedAddress');
    
    return (
      <div className="flex items-center gap-2">
        {lastAddress && (
          <div className="opacity-50">
            {truncAddress(lastAddress)}
          </div>
        )}
        <div className="text-xs text-yellow-700 animate-pulse">
          {lastAddress ? "Reconnecting..." : "Reconnecting wallet..."}
        </div>
      </div>
    );
  }

  // Normal disconnected state - show connect button
  return (
    <Dialog>
      <DialogTrigger className="appearance-none" asChild>
        <button className="hover:scale-105 focus:underline">🙏 Connect Wallet</button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Wallet</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {connectors.map((connector) => (
            <button
              className="flex items-center justify-start hover:scale-105 focus:underline"
              key={`connector-${connector.id || connector.name}`}
              onClick={() => connect({ connector })}
            >
              <img src={connector.icon ?? "/coinchan-logo.png"} alt={connector.name} className="w-6 h-6 mr-2" />
              <span>{connector.name}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Export a memoized version of the component for better performance
export const ConnectMenu = React.memo(ConnectMenuComponent);