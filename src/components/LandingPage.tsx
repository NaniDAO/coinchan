import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  useLandingData,
  useRandomLoadingText,
} from "../hooks/use-landing-data";
import { useProtocolStats } from "../hooks/use-protocol-stats";
import { useTheme } from "@/lib/theme";
import { TrendingFarm } from "./TrendingFarm";
import { ErrorBoundary } from "./ErrorBoundary";
import { LoadingLogo } from "./ui/loading-logo";
import { GovernanceProposals } from "./GovernanceProposals";
import { SaleBlurb } from "./SaleBlurb";

interface LandingPageProps {
  onEnterApp?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnterApp }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const { data: landingData, isLoading: isLoadingLandingData } =
    useLandingData();
  const { data: protocolStats } = useProtocolStats();
  const getRandomLoadingText = useRandomLoadingText();
  const [progressText, setProgressText] = useState("");
  const [progress, setProgress] = useState(0);
  const [enterEnabled, setEnterEnabled] = useState(false);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);

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

  // Terminal boot animation
  useEffect(() => {
    const lines = [
      t("landing.initializing"),
      t("landing.connecting_chains"),
      t("landing.loading_data"),
      t("landing.system_ready"),
    ];

    let currentLine = 0;
    const typeInterval = setInterval(() => {
      if (currentLine < lines.length) {
        setTerminalLines((prev) => [...prev, lines[currentLine]]);
        currentLine++;
      } else {
        clearInterval(typeInterval);
      }
    }, 600);

    return () => clearInterval(typeInterval);
  }, []);

  const handleEnterApp = () => {
    if (onEnterApp) {
      onEnterApp();
    }
  };

  return (
    <div className="bg-background text-foreground font-mono h-full lg:pl-8  p-4">
      {/* Title */}
      <h1 className="text-4xl tracking-widest font-bold mb-4 text-left">
        {t("landing.title")}
      </h1>

      {/* Terminal Boot Lines */}
      <div className="mb-4 min-h-[60px]">
        {terminalLines.map((line, index) => (
          <div
            key={index}
            className="text-sm opacity-0 animate-fadeIn"
            style={{
              animationDelay: `${index * 0.6}s`,
              animationFillMode: "forwards",
            }}
          >
            {line}
          </div>
        ))}
      </div>

      {/* Status and Progress */}
      <div className="mb-4">
        <div className="flex items-center gap-2 text-sm mb-2">
          <span></span>
          <span>{progressText}</span>
          <span className="animate-pulse">_</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span>load:</span>
          <div className="bg-muted h-1 w-32 border border-border">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>

      {/* Compact Stats - Single Line Each */}
      <div className="mb-4 space-y-1 text-sm">
        <div>
          <span className="text-muted-foreground">eth = </span>
          <span className="font-bold">
            {landingData?.ethPrice || "loading..."}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">{t("landing.gas")} = </span>
          <span className="font-bold">
            {landingData?.gasPrice || "loading..."}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">{t("landing.cost")} = </span>
          <span className="font-bold">
            {landingData?.launchCost || "loading..."}
          </span>
        </div>
      </div>

      {/* Trending Farms Section */}
      <div className="mb-4">
        <div className="text-lg mb-2 font-bold">{t("landing.trending")}:</div>
        <div className="space-y-0 text-xs">
          <ErrorBoundary fallback={<LoadingLogo />}>
            <TrendingFarm
              chefId="107452621584058933773078057973488854580628742066235689429927554548147274163352"
              url="/cult"
              imgUrl="/cult.jpg"
            />
          </ErrorBoundary>
          <ErrorBoundary fallback={<LoadingLogo />}>
            <TrendingFarm
              chefId="9911777932062439318891919186675338016828468353880863972728110112967458165574"
              url="/ens"
              imgUrl="/ens.svg"
              color="var(--diamond-blue)"
            />
          </ErrorBoundary>
          <ErrorBoundary fallback={<LoadingLogo />}>
            <TrendingFarm
              chefId="81451133389625739869445444104677551191235868870135185413665230560425375295858"
              url="/farm"
            />
          </ErrorBoundary>
        </div>
      </div>
      {/* Sales Section */}
      <div className="mb-4">
        <div className="text-lg mb-2 font-bold">{t("landing.sales")}:</div>
        <div className="space-y-0 text-xs">
          <ErrorBoundary fallback={<LoadingLogo />}>
            <SaleBlurb coinId="71" />
          </ErrorBoundary>
        </div>
      </div>

      {/* Governance */}
      <GovernanceProposals />

      {/* Protocol Stats - Single Column Format */}
      <div className="mb-6">
        <div className="text-lg mb-2 font-bold">{t("landing.protocol")}:</div>
        <div className="text-lg space-y-1">
          <div>
            <span className="text-muted-foreground">{t("landing.eth_swapped")} = </span>
            <span className="font-bold">
              {protocolStats?.totalEthSwapped || "-"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">{t("landing.swaps")} = </span>
            <span className="font-bold">
              {protocolStats?.totalSwaps || "-"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">{t("landing.coins")} = </span>
            <span className="font-bold">
              {protocolStats?.totalCoins || "-"}
            </span>
          </div>
        </div>
      </div>

      {/* Enter Button */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <span></span>
          <button
            className={`
              bg-primary text-primary-foreground px-4 py-1 text-sm font-bold
              border border-border transition-all duration-200
              hover:shadow-lg focus:ring-2 focus:ring-primary/50 focus:outline-none
              ${enterEnabled ? "" : "opacity-50 cursor-not-allowed"}
            `}
            onClick={handleEnterApp}
            disabled={!enterEnabled}
          >
            {t("landing.enter_zamm")}
          </button>
          {enterEnabled && <span className="animate-pulse">_</span>}
        </div>
      </div>

      {/* Features */}
      <div className="text-xs text-muted-foreground">
        {t("landing.features")}
      </div>

      {/* Video */}
      <video
        className="fixed bottom-5 right-5 w-40 h-40"
        style={{
          clipPath: "polygon(50% 10%, 75% 50%, 50% 90%, 25% 50%)",
        }}
        src={theme === "dark" ? "/zammzamm-bw.mp4" : "/zammzamm.mp4"}
        autoPlay
        loop
        muted
      />
    </div>
  );
};

export default LandingPage;
