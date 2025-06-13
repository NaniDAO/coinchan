import React, { useState, useEffect, useMemo } from "react";
import { ZammLogo } from "./ZammLogo";
import {
  getRandomLoadingText,
  useLandingData,
} from "../hooks/use-landing-data";
import { useProtocolStats } from "../hooks/use-protocol-stats";
import { Card } from "./ui/card";

interface LandingPageProps {
  onEnterApp?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnterApp }) => {
  const { data: landingData, isLoading: isLoadingLandingData } =
    useLandingData();
  const { data: protocolStats } = useProtocolStats();
  const [progressText, setProgressText] = useState("");
  const [progress, setProgress] = useState(0);
  const [enterEnabled, setEnterEnabled] = useState(false);

  const isLoading = useMemo(() => {
    if (isLoadingLandingData === false && landingData !== undefined) {
      return false;
    }

    return true;
  }, [isLoadingLandingData, landingData]);

  useEffect(() => {
    if (isLoading === false) {
      setTimeout(() => {
        setProgress(100);
        setProgressText("The Efficient Ethereum Exchange");
        setEnterEnabled(true);
      }, 1000);
    } else {
      setProgressText(getRandomLoadingText());

      const interval = setInterval(() => {
        setProgress((prevProgress) => {
          if (isLoading && prevProgress < 90) {
            return Math.min(prevProgress + Math.random() * 3, 90);
          }
          return prevProgress;
        });
      }, 200);

      return () => clearInterval(interval);
    }
  }, [isLoading]);

  const handleEnterApp = () => {
    if (onEnterApp) {
      onEnterApp();
    }
  };

  const handleLogoClick = () => {
    // Trigger logo animation - handled by ZammLogo component
  };

  return (
    <div className="outline-2 outline-offset-2 outline-background !mb-[50px] bg-background !h-full m-0 text-foreground">
      <ZammLogo
        size="landing"
        onClick={handleLogoClick}
        isLoading={isLoading}
        autoStartAnimation={true}
      />

      <h1 className="m-1 text-center">ZAMM DEFI</h1>

      <div className="ascii-divider">════════════════════════════════════</div>

      <div style={{ textAlign: "center", margin: "30px 0" }}>
        <p
          style={{
            marginBottom: "20px",
            maxWidth: "400px",
            margin: "0 auto",
            overflowWrap: "break-word",
          }}
          aria-live="polite"
        >
          {progressText}
        </p>
        <div
          className="h-5 my-2.5 relative bg-background border-2 border-foreground"
          style={{ width: "300px", margin: "20px auto" }}
        >
          <div
            className="h-full w-0 bg-card-foreground transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <p>[{Math.round(progress)}%]</p>
      </div>

      {/* Stats Cards */}
      <div style={{ margin: "40px 0", fontSize: "var(--font-size-base)" }}>
        <div style={{ maxWidth: "500px", margin: "0 auto" }}>
          <StatsCard
            label="ETH Price:"
            value={landingData?.ethPrice || "Loading..."}
            color="var(--diamond-blue)"
          />
          <StatsCard
            label="Gas Price:"
            value={landingData?.gasPrice || "Loading..."}
            color="var(--diamond-yellow)"
          />
          <StatsCard
            label="Launch Cost:"
            value={landingData?.launchCost || "Loading..."}
            color="var(--diamond-pink)"
          />
        </div>

        <div className="ascii-divider">
          ════════════════════════════════════
        </div>

        {/* Protocol Stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "20px",
            marginTop: "30px",
            maxWidth: "600px",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          <ProtocolStat
            label="ETH SWAPPED"
            primary={protocolStats?.totalEthSwapped || "-"}
          />
          <ProtocolStat
            label="SWAPS"
            primary={protocolStats?.totalSwaps || "-"}
          />
          <ProtocolStat
            label="COINS"
            primary={protocolStats?.totalCoins || "-"}
          />
        </div>
      </div>

      <div style={{ textAlign: "center", margin: "40px 0" }}>
        <button
          className="button"
          onClick={handleEnterApp}
          disabled={!enterEnabled}
          style={{
            opacity: enterEnabled ? 1 : 0.5,
            fontSize: "16px",
            padding: "12px 24px",
          }}
          aria-label="Enter the ZAMM application"
        >
          ENTER ZAMM
        </button>
      </div>

      <div className="ascii-divider">════════════════════════════════════</div>

      <p
        style={{
          textAlign: "center",
          margin: "20px 0",
          fontSize: "12px",
          letterSpacing: "1px",
        }}
      >
        EVM PRAGUE • FAIR LAUNCHES • CHEAP FEES
      </p>
    </div>
  );
};

// Stats Card Component
const StatsCard: React.FC<{
  label: string;
  value: string;
  color: string;
}> = React.memo(({ label, value, color }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "15px 20px",
      border: "2px solid var(--border)",
      marginBottom: "15px",
      background: "var(--background)",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <div
        style={{
          width: "8px",
          height: "8px",
          background: color,
          borderRadius: "50%",
        }}
      ></div>
      <span style={{ fontWeight: "bold" }}>{label}</span>
    </div>
    <span
      style={{
        color: color,
        fontWeight: "bold",
        fontFamily: "var(--font-body)",
      }}
    >
      {value}
    </span>
  </div>
));
StatsCard.displayName = "StatsCard";

// Protocol Stats Component
const ProtocolStat: React.FC<{
  label: string;
  primary: string;
}> = React.memo(({ label, primary }) => (
  <Card className="text-center p-5 border-2 border-border bg-background h-2xl py-2 flex flex-col">
    <div className="text-lg text-muted-foreground font-bold tracking-wider">
      {label}
    </div>
    <div className="font-bold text-lg flex items-center justify-center overflow-hidden">
      <div className="truncate">{primary}</div>
    </div>
  </Card>
));

ProtocolStat.displayName = "ProtocolStat";

export default LandingPage;
