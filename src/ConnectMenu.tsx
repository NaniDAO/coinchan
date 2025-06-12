import { useAccount, useConnect, useDisconnect } from "wagmi";
import React, { useEffect, useState } from "react";
import { truncAddress } from "./lib/address";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ConnectionErrorHandler from "@/lib/ConnectionErrorHandler";
import usePersistentConnection from "./hooks/use-persistent-connection";
import { useTranslation } from "react-i18next";

const ConnectMenuComponent = () => {
  const { isConnected, address, status } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [reconnecting, setReconnecting] = useState(false);
  const { t } = useTranslation();

  usePersistentConnection();

  // Clean up stale connection state on component mount
  useEffect(() => {
    // If not connected and no active connection in progress, clear the stored address
    // to avoid confusion on fresh visits
    if (status === "disconnected" && !isConnected) {
      const hasLastAddress = !!sessionStorage.getItem("lastConnectedAddress");

      // Only clear if there's actually something to clear (performance optimization)
      if (hasLastAddress && window.location.href.indexOf("?") === -1) {
        // Only clear on fresh page loads without query params (likely not part of a connection flow)
        sessionStorage.removeItem("lastConnectedAddress");
        // Also clear connection attempt type to ensure fresh state
        sessionStorage.removeItem("connectionAttemptType");
      }
    }
  }, [status, isConnected]);

  // Performance-optimized status tracking with fewer state updates
  useEffect(() => {
    // Track connection attempt type to better distinguish between reconnect and fresh connect
    if (status === "connecting") {
      // If this is the first connection attempt (no connectionAttemptType set yet)
      if (!sessionStorage.getItem("connectionAttemptType")) {
        const lastAddress = sessionStorage.getItem("lastConnectedAddress");

        // Set the connection type based on whether we have a last address
        if (lastAddress) {
          sessionStorage.setItem("connectionAttemptType", "reconnect");
        } else {
          sessionStorage.setItem("connectionAttemptType", "fresh");
        }
      }
    }

    // Clear attempt tracking when disconnected
    if (status === "disconnected") {
      sessionStorage.removeItem("connectionAttemptType");
    }

    // Determine if this is truly a reconnection
    const lastAddress = sessionStorage.getItem("lastConnectedAddress");
    const isReconnection = !!lastAddress && sessionStorage.getItem("connectionAttemptType") !== "fresh";

    // Only show reconnecting state if we're actually reconnecting (not first connection)
    // Now using connectionAttemptType to help distinguish context
    const shouldShowReconnecting = status === "reconnecting" || (status === "connecting" && isReconnection);

    if (shouldShowReconnecting !== reconnecting) {
      setReconnecting(shouldShowReconnecting);
    }

    // Only store the address when connected and stable (not during transition states)
    if (status === "connected" && address) {
      // Clear connection attempt type - connection is complete
      sessionStorage.removeItem("connectionAttemptType");

      // Use requestIdleCallback for non-critical storage operations
      if (window.requestIdleCallback) {
        window.requestIdleCallback(() => {
          sessionStorage.setItem("lastConnectedAddress", address);
        });
      } else {
        // Fallback for browsers without requestIdleCallback
        setTimeout(() => {
          sessionStorage.setItem("lastConnectedAddress", address);
        }, 100);
      }
    }
  }, [status, address, reconnecting]);

  // Render the appropriate UI based on connection state
  const renderConnectionUI = () => {
    // When connected - show the address with dropdown
    if (isConnected) {
      return (
        <span style={{ display: 'inline-flex', gap: '10px', alignItems: 'center' }}>
          <span className="wallet-address">
            {address ? truncAddress(address) : ""}
          </span>
          <button 
            className="button"
            onClick={() => disconnect()}
            style={{ marginLeft: '10px', padding: '5px 10px', fontSize: '12px' }}
          >
            DISCONNECT
          </button>
        </span>
      );
    }

    // When connecting or reconnecting - show appropriate message
    if (reconnecting) {
      // Try to get last known address from sessionStorage to display during reconnection
      const lastAddress = sessionStorage.getItem("lastConnectedAddress");

      return (
        <div className="flex items-center gap-2">
          {lastAddress && <div className="opacity-50">{truncAddress(lastAddress)}</div>}
          <div className="text-xs text-primary animate-pulse">
            {t("common.loading")}
          </div>
        </div>
      );
    }

    // Show connecting state for first-time connections
    if (status === "connecting") {
      return (
        <div className="flex items-center gap-2">
          <div className="text-xs text-primary animate-pulse">{t("common.loading")}</div>
        </div>
      );
    }

    // Normal disconnected state - show connect button
    return (
      <Dialog>
        <DialogTrigger className="appearance-none" asChild>
          <button className="button">CONNECT WALLET</button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.connect")}</DialogTitle>
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

  // Return both the ConnectionErrorHandler and the UI elements
  return (
    <>
      <ConnectionErrorHandler />
      {renderConnectionUI()}
    </>
  );
};

// Export a memoized version of the component for better performance
export const ConnectMenu = React.memo(ConnectMenuComponent);
