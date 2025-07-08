import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLandingData, useRandomLoadingText } from "../hooks/use-landing-data";
import { useProtocolStats } from "../hooks/use-protocol-stats";
import { SwapModal } from "./SwapModal";
import { ZammLogo } from "./ZammLogo";
import { Card } from "./ui/card";

interface LandingPageProps {
  onEnterApp?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnterApp }) => {
  const { t } = useTranslation();
  const { data: landingData, isLoading: isLoadingLandingData } = useLandingData();
  const { data: protocolStats } = useProtocolStats();
  const getRandomLoadingText = useRandomLoadingText();
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
        setProgressText(t("landing.tagline"));
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
  }, [isLoading, t]);

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
      <ZammLogo size="landing" onClick={handleLogoClick} isLoading={isLoading} autoStartAnimation={true} />

      <h1 className="m-1 text-center">{t("landing.title")}</h1>

      <div className="ascii-divider">════════════════════════════════════</div>

      <div className="text-center my-[30px]">
        <p className="mb-5 max-w-[400px] mx-auto break-words" aria-live="polite">
          {progressText}
        </p>
        <div className="h-5 my-2.5 relative bg-background border-2 border-foreground w-[300px] mx-auto">
          <div
            className="h-full w-0 bg-card-foreground transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <p>{t("landing.progress_loading", { progress: Math.round(progress) })}</p>
      </div>

      {/* Stats Cards */}
      <div className="my-10 text-base">
        <div className="max-w-[500px] mx-auto">
          <StatsCard
            label={t("landing.stats.eth_price")}
            value={landingData?.ethPrice || t("landing.stats.loading")}
            color="var(--diamond-blue)"
          />
          <StatsCard
            label={t("landing.stats.gas_price")}
            value={landingData?.gasPrice || t("landing.stats.loading")}
            color="var(--diamond-yellow)"
          />
          <StatsCard
            label={t("landing.stats.launch_cost")}
            value={landingData?.launchCost || t("landing.stats.loading")}
            color="var(--diamond-pink)"
          />
        </div>

        <div className="ascii-divider">════════════════════════════════════</div>

        {/* Protocol Stats */}
        <div className="grid grid-cols-3 gap-5 mt-[30px] max-w-[600px] mx-auto">
          <ProtocolStat
            label={t("landing.stats.eth_swapped")}
            primary={protocolStats?.totalEthSwapped || "-"}
            color="var(--diamond-orange)"
          />
          <ProtocolStat
            label={t("landing.stats.swaps")}
            primary={protocolStats?.totalSwaps || "-"}
            color="var(--diamond-purple)"
          />
          <ProtocolStat
            label={t("landing.stats.coins")}
            primary={protocolStats?.totalCoins || "-"}
            color="var(--diamond-blue)"
          />
        </div>
      </div>

      <div className="text-center my-10">
        <button
          className={`button text-base px-8 py-4 bg-primary text-primary-foreground font-bold rounded-lg transform transition-all duration-200
            ${enterEnabled ? "opacity-100 hover:scale-105 hover:shadow-lg focus:ring-4 focus:ring-primary/50 focus:outline-none" : "opacity-50 cursor-not-allowed"}
          `}
          onClick={handleEnterApp}
          disabled={!enterEnabled}
          aria-label={t("landing.enter_app_aria")}
        >
          {t("landing.enter_zamm")}
        </button>
      </div>

      <div className="ascii-divider">════════════════════════════════════</div>

      <SwapModal />
      <p className="text-center my-5 text-xs tracking-wider">{t("landing.features")}</p>
    </div>
  );
};

// Stats Card Component
const StatsCard: React.FC<{
  label: string;
  value: string;
  color: string;
}> = React.memo(({ label, value, color }) => (
  <div className="flex justify-between items-center px-5 py-[15px] border-2 border-border mb-[15px] bg-background hover:shadow-lg transition-all duration-200">
    <div className="flex items-center gap-[10px]">
      <div
        className="w-3 h-3 rounded-full shadow-sm"
        style={{
          background: color,
          boxShadow: `0 0 8px ${color}40`,
        }}
      ></div>
      <span className="font-bold">{label}</span>
    </div>
    <span
      className="font-bold font-body text-lg tracking-wide"
      style={{
        // color: color,
        textShadow: `0 0 12px ${color}60`,
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
  color?: string;
}> = React.memo(({ label, primary, color }) => (
  <Card className="text-center p-5 border-2 border-border bg-background h-2xl py-2 flex flex-col hover:shadow-lg transition-all duration-200 relative">
    <div className="text-lg text-muted-foreground font-bold tracking-wider">{label}</div>
    <div
      className="font-bold text-2xl flex items-center justify-center overflow-hidden mt-2"
      style={{
        // color: color || "inherit",
        textShadow: color ? `0 0 10px ${color}40` : "none",
      }}
    >
      <div className="truncate">{primary}</div>
    </div>
  </Card>
));

ProtocolStat.displayName = "ProtocolStat";

export default LandingPage;
