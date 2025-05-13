import { sdk } from "@farcaster/frame-sdk";
import "./index.css";
import { useEffect, useState } from "react";
import { CoinPaper } from "./CoinPaper";
import { CoinForm } from "./CoinForm";
import Coins from "./Coins";
import { ConnectMenu } from "./ConnectMenu";
import SwapTile from "./SwapTile";
import { SendTile } from "./SendTile";
import ConnectionErrorHandler from "./utils/ConnectionErrorHandler";
import usePersistentConnection from "./hooks/use-persistent-connection";

function App() {
  const [view, setView] = useState<"menu" | "form" | "memepaper" | "swap" | "send">("swap");
  const [tapCount, setTapCount] = useState(0);
  const [lastTap, setLastTap] = useState(0);

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

    window.addEventListener("coinchan:setView", handleViewChange as EventListener);

    return () => {
      window.removeEventListener("coinchan:setView", handleViewChange as EventListener);
    };
  }, []);

  const handleLogoTap = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastTap < 300) {
      setView((prevView) => (prevView === "form" ? "menu" : "form")); // Toggle view
    }
    setLastTap(now);
    setTapCount(tapCount + 1);
  };

  const handleMemepaperClick = () => {
    setView("memepaper");
  };

  const handleCoinClick = () => {
    setView("form");
  };

  const handleSwapClick = () => {
    setView("swap");
  };

  const handleSendClick = () => {
    setView("send");
  };

  return (
    <main className="p-2 sm:p-3 min-h-screen w-screen flex flex-col justify-center items-center">
      {/* Silent error handler component for wallet connection issues */}
      <ConnectionErrorHandler />
      <div className="w-full max-w-lg">
        <header className="flex justify-end w-full">
          <ConnectMenu />
        </header>
        <img
          src="/coinchan-logo.png"
          alt="Coinchan"
          className={`logo ${view !== "menu" ? "small" : ""}`}
          onClick={handleLogoTap}
          onTouchStart={handleLogoTap}
        />
        {view === "form" && (
          <div className="">
            <CoinForm onMemepaperClick={handleMemepaperClick} />
          </div>
        )}
        {view === "memepaper" && <CoinPaper onCoinClick={handleCoinClick} />}
        {view === "swap" && <SwapTile />}
        {view === "send" && <SendTile />}
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
              <Coins onSend={handleSendClick} />
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

export default App;
