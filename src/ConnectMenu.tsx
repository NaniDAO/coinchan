import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ConnectionErrorHandler from "@/lib/ConnectionErrorHandler";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { AddressIcon } from "./components/AddressIcon";
import usePersistentConnection from "./hooks/use-persistent-connection";
import { truncAddress } from "./lib/address";

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

  // Helper function to get connector icon
  const getConnectorIcon = (connector: any) => {
    if (connector.icon) {
      return connector.icon;
    }

    // Handle common connector types
    const connectorName = connector.name.toLowerCase();
    if (connectorName.includes("metamask")) {
      return "/metamask.svg";
    }
    if (connectorName.includes("coinbase")) {
      return "/coinbase.png";
    }
    if (connectorName.includes("injected") || connectorName.includes("browser")) {
      return "/wallet-icon.webp";
    }

    return "/coinchan-logo.png";
  };

  // Render the appropriate UI based on connection state
  const renderConnectionUI = () => {
    // When connected - show the address with dropdown
    if (isConnected) {
      return (
        <span className="inline-flex gap-2.5 items-center">
          <button
            className="!py-1 !px-2 flex flex-row items-center uppercase tracking-wider font-['Chicago'] bg-secondary-background text-secondary-foreground border border-border shadow-[2px_2px_0px_rgba(0,0,0,1)] active:shadow-[1px_1px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] transition-all dark:shadow-[2px_2px_0px_rgba(255,255,255,0.3)] dark:active:shadow-[1px_1px_0px_rgba(255,255,255,0.3)]"
            onClick={() => disconnect()}
          >
            {address ? (
              <AddressIcon address={address} className="!mr-2 !h-4 !w-4 !rounded-lg border-1 border-background" />
            ) : null}
            <span>{address ? truncAddress(address) : ""}</span>
          </button>
        </span>
      );
    }

    // When connecting or reconnecting - show appropriate message
    if (reconnecting) {
      return (
        <div className="flex items-center gap-2">
          <div className="text-xs text-primary animate-pulse font-['Chicago']">{t("common.loading")}</div>
        </div>
      );
    }

    // Show connecting state for first-time connections
    if (status === "connecting") {
      return (
        <div className="flex items-center gap-2">
          <div className="text-xs text-primary animate-pulse font-['Chicago']">{t("common.loading")}</div>
        </div>
      );
    }

    // Normal disconnected state - show connect button
    return (
      <Dialog>
        <DialogTrigger className="!py-1 !px-2 uppercase tracking-wider font-['Chicago'] bg-secondary-background text-secondary-foreground border border-border shadow-[2px_2px_0px_rgba(0,0,0,1)] active:shadow-[1px_1px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] transition-all duration-300 ease-in-out hover:scale-110 hover:shadow-[6px_6px_0_var(--border)] hover:bg-primary hover:text-primary-foreground hover:-translate-x-[2px] hover:-translate-y-[2px] active:scale-95 active:translate-x-0 active:translate-y-0 active:shadow-none dark:shadow-[2px_2px_0px_rgba(255,255,255,0.3)] dark:active:shadow-[1px_1px_0px_rgba(255,255,255,0.3)]">
          {t("common.connect")}
        </DialogTrigger>
        <DialogContent className="!p-4 !bg-secondary-background border-2 border-border shadow-[4px_4px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_rgba(255,255,255,0.3)]">
          <DialogHeader>
            <DialogTitle className="font-['Chicago'] uppercase tracking-widest text-lg">
              {t("common.connect")}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {connectors.map((connector) => (
              <button
                className="!py-1 !px-2 uppercase tracking-wider font-['Chicago'] bg-secondary-background text-secondary-foreground border border-border shadow-[2px_2px_0px_rgba(0,0,0,1)] active:shadow-[1px_1px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] transition-all dark:shadow-[2px_2px_0px_rgba(255,255,255,0.3)] dark:active:shadow-[1px_1px_0px_rgba(255,255,255,0.3)] flex items-center"
                key={`connector-${connector.id || connector.name}`}
                onClick={() => connect({ connector })}
              >
                <img src={getConnectorIcon(connector)} alt={connector.name} className="w-6 h-6 !mr-3" />
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
