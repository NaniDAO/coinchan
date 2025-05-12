import { sdk } from "@farcaster/frame-sdk";
import "../index.css";
import { useEffect, useState } from "react";
import { CoinPaper } from "../CoinPaper";
import { CoinForm } from "../CoinForm";
import Coins from "../Coins";
import SwapTile from "../SwapTile";
import usePersistentConnection from "../hooks/use-persistent-connection";

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  const [view, setView] = useState<"menu" | "form" | "memepaper" | "swap">(
    "swap",
  );

  // Use our lightweight persistence hook to maintain UI state across sessions
  usePersistentConnection();

  useEffect(() => {
    sdk.actions.ready();

    // Listen for custom view change events
    const handleViewChange = (event: CustomEvent) => {
      if (event.detail && typeof event.detail === "string") {
        setView(event.detail as "menu" | "form" | "memepaper" | "swap");
      }
    };

    window.addEventListener(
      "coinchan:setView",
      handleViewChange as EventListener,
    );

    return () => {
      window.removeEventListener(
        "coinchan:setView",
        handleViewChange as EventListener,
      );
    };
  }, []);

  const handleMemepaperClick = () => {
    setView("memepaper");
  };

  const handleCoinClick = () => {
    setView("form");
  };

  const handleSwapClick = () => {
    setView("swap");
  };

  return (
    <main className="p-2 sm:p-3 min-h-screen w-screen flex flex-col justify-center items-center">
      <div className="w-full max-w-lg">
        {view === "form" && (
          <div className="">
            <CoinForm onMemepaperClick={handleMemepaperClick} />
          </div>
        )}
        {view === "memepaper" && <CoinPaper onCoinClick={handleCoinClick} />}
        {view === "swap" && <SwapTile />}
        {view === "menu" && (
          <div className="">
            <div>
              <div className="flex justify-center items-center w-full">
                <button
                  className={`appearance-none mt-6 mx-auto flex items-center gap-2 px-5 py-2 bg-white hover:scale-105 font-mono text-red-500 transition-colors duration-200`}
                  onClick={handleSwapClick}
                >
                  Swap
                </button>
              </div>
            </div>
            <div className="w-full">
              <Coins />
            </div>
            <div className="main-menu">
              {/* <ConnectMenu /> */}
              <div className="flex justify-end items-end w-full">
                <button
                  className={`appearance-none mt-6 mx-auto flex items-center gap-2 px-5 py-2 bg-white hover:scale-105 font-mono text-red-500 transition-colors duration-200`}
                  onClick={handleMemepaperClick}
                >
                  🤓 Read the Coinpaper
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
