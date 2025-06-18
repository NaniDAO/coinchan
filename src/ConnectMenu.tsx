import { useAccount, useDisconnect } from "wagmi";
import React, { useEffect, useState } from "react";
import { truncAddress } from "./lib/address";
import ConnectionErrorHandler from "@/lib/ConnectionErrorHandler";
import usePersistentConnection from "./hooks/use-persistent-connection";
import { useTranslation } from "react-i18next";
import { AddressIcon } from "./components/AddressIcon";

const ConnectMenuComponent = () => {
  const { isConnected, address, status } = useAccount();
  const { disconnect } = useDisconnect();
  const [reconnecting, setReconnecting] = useState(false);
  const { t } = useTranslation();

  usePersistentConnection();

  // Clean up stale connection state on component mount
  useEffect(() => {
    if (status === "disconnected" && !isConnected) {
      const hasLastAddress = !!sessionStorage.getItem("lastConnectedAddress");

      if (hasLastAddress && window.location.href.indexOf("?") === -1) {
        sessionStorage.removeItem("lastConnectedAddress");
        sessionStorage.removeItem("connectionAttemptType");
      }
    }
  }, [status, isConnected]);

  // Performance-optimized status tracking with fewer state updates
  useEffect(() => {
    if (status === "connecting") {
      if (!sessionStorage.getItem("connectionAttemptType")) {
        const lastAddress = sessionStorage.getItem("lastConnectedAddress");

        if (lastAddress) {
          sessionStorage.setItem("connectionAttemptType", "reconnect");
        } else {
          sessionStorage.setItem("connectionAttemptType", "fresh");
        }
      }
    }

    if (status === "disconnected") {
      sessionStorage.removeItem("connectionAttemptType");
    }

    const lastAddress = sessionStorage.getItem("lastConnectedAddress");
    const isReconnection = !!lastAddress && sessionStorage.getItem("connectionAttemptType") !== "fresh";
    const shouldShowReconnecting = status === "reconnecting" || (status === "connecting" && isReconnection);

    if (shouldShowReconnecting !== reconnecting) {
      setReconnecting(shouldShowReconnecting);
    }

    if (status === "connected" && address) {
      sessionStorage.removeItem("connectionAttemptType");

      if (window.requestIdleCallback) {
        window.requestIdleCallback(() => {
          sessionStorage.setItem("lastConnectedAddress", address);
        });
      } else {
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
    return <appkit-button />;
  };

  return (
    <>
      <ConnectionErrorHandler />
      {renderConnectionUI()}
    </>
  );
};

export const ConnectMenu = React.memo(ConnectMenuComponent);
