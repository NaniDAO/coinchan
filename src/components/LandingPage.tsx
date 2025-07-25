import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  useLandingData,
  useRandomLoadingText,
} from "../hooks/use-landing-data";
import { useProtocolStats } from "../hooks/use-protocol-stats";
import { useTheme } from "@/lib/theme";
import { getRandomDiamondColor } from "@/lib/color";

interface LandingPageProps {
  onEnterApp?: () => void;
}

interface TrendingFarmProps {
  ticker: string;
  apr: string;
}

const TrendingFarm: React.FC<TrendingFarmProps> = ({ ticker, apr }) => {
  const color = getRandomDiamondColor(ticker);
  return (
    <div className="text-lg">
      <span className="text-muted-foreground">└── </span>
      <span className="font-bold" style={{ color }}>
        {ticker.toUpperCase()}
      </span>
      <span className="text-muted-foreground"> = </span>
      <span className="text-primary font-bold">{apr}%</span>
    </div>
  );
};

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
      "> initializing zamm protocol...",
      "> connecting to chains...",
      "> loading market data...",
      "> system ready",
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
          <span className="text-muted-foreground">gas = </span>
          <span className="font-bold">
            {landingData?.gasPrice || "loading..."}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">cost = </span>
          <span className="font-bold">
            {landingData?.launchCost || "loading..."}
          </span>
        </div>
      </div>

      {/* Trending Farms Section */}
      <div className="mb-4">
        <div className="text-lg mb-2 font-bold">trending:</div>
        <div className="space-y-0 text-xs">
          <TrendingFarm ticker="CULT" apr="410.52" />
          <TrendingFarm ticker="ENS" apr="239.72" />
          <TrendingFarm ticker="ZAMM" apr="147.43" />
        </div>
      </div>

      {/* Protocol Stats - Single Column Format */}
      <div className="mb-6">
        <div className="text-lg mb-2 font-bold">protocol:</div>
        <div className="text-lg space-y-1">
          <div>
            <span className="text-muted-foreground">eth_swapped = </span>
            <span className="font-bold">
              {protocolStats?.totalEthSwapped || "-"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">swaps = </span>
            <span className="font-bold">
              {protocolStats?.totalSwaps || "-"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">coins = </span>
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
          clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
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
