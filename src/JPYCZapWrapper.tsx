import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { parseEther } from "viem";
import { usePublicClient } from "wagmi";
import { SingleEthLiquidity } from "./SingleEthLiquidity";
import { JPYCUniswapV3Zap } from "./JPYCUniswapV3Zap";
import { CheckTheChainAbi, CheckTheChainAddress } from "./constants/CheckTheChain";
import { useReserves } from "./hooks/use-reserves";
import { JPYC_POOL_ID } from "./lib/coins";
import { getAmountOut } from "./lib/swap";
import { RefreshCw, Zap } from "lucide-react";
import { UniswapLogo } from "./components/icons/UniswapLogo";
import { formatNumber } from "./lib/utils";
import { formatUnits } from "viem";
import type { ENSZapEthAmountChangeDetail } from "./types/events";

export const JPYCZapWrapper = () => {
  const { t } = useTranslation();
  const [selectedRoute, setSelectedRoute] = useState<"v3" | "direct">("direct");
  const [autoMode, setAutoMode] = useState(true);
  const [ethAmount, setEthAmount] = useState("");
  const [bestRoute, setBestRoute] = useState<"v3" | "direct">("direct");
  const [v3Output, setV3Output] = useState<bigint>(0n);
  const [directOutput, setDirectOutput] = useState<bigint>(0n);
  const [percentDiff, setPercentDiff] = useState<number>(0);

  const publicClient = usePublicClient();
  const { data: reserves } = useReserves({
    poolId: JPYC_POOL_ID,
    source: "COOKBOOK",
  });

  // Listen to ETH amount changes from child components
  useEffect(() => {
    const handleEthAmountChange = (event: Event) => {
      const customEvent = event as CustomEvent<ENSZapEthAmountChangeDetail>;
      setEthAmount(customEvent.detail.amount);
    };

    window.addEventListener("jpycZapEthAmountChange", handleEthAmountChange);
    return () => {
      window.removeEventListener("jpycZapEthAmountChange", handleEthAmountChange);
    };
  }, []);

  // Determine best route when ETH amount changes (with debounce)
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!publicClient || !reserves || !ethAmount || parseFloat(ethAmount) === 0) {
        return;
      }

      try {
        const halfEthAmount = parseEther(ethAmount) / 2n;

        // Get V3 output
        let v3Tokens = 0n;
        try {
          const jpycPriceData = await publicClient.readContract({
            address: CheckTheChainAddress,
            abi: CheckTheChainAbi,
            functionName: "checkPriceInETH",
            args: ["JPYC"],
          });

          if (jpycPriceData) {
            const jpycPriceInETH = jpycPriceData[0] as bigint;
            if (jpycPriceInETH > 0n) {
              v3Tokens = (halfEthAmount * 10n ** 18n) / jpycPriceInETH;
            }
          }
        } catch (error) {
          console.error("Failed to fetch JPYC price from oracle:", error);
          // Continue with fallback calculation
        }

        // Get direct pool output
        let directTokens = 0n;
        if (reserves.reserve0 > 0n && reserves.reserve1 > 0n) {
          directTokens = getAmountOut(halfEthAmount, reserves.reserve0, reserves.reserve1, 30n);
        }

        setV3Output(v3Tokens);
        setDirectOutput(directTokens);

        // Calculate percentage difference with safety checks
        if (v3Tokens > 0n && directTokens > 0n) {
          try {
            const larger = v3Tokens > directTokens ? v3Tokens : directTokens;
            const smaller = v3Tokens > directTokens ? directTokens : v3Tokens;
            if (smaller > 0n) {
              const diff = ((larger - smaller) * 10000n) / smaller;
              const percentValue = Number(diff) / 100;
              // Cap at 999% to prevent display issues
              setPercentDiff(Math.min(percentValue, 999));
            } else {
              setPercentDiff(0);
            }
          } catch (error) {
            console.error("Error calculating percentage difference:", error);
            setPercentDiff(0);
          }
        } else {
          setPercentDiff(0);
        }

        // Set best route
        const newBestRoute = v3Tokens > directTokens ? "v3" : "direct";
        setBestRoute(newBestRoute);

        // Auto-select if in auto mode with fallback
        if (autoMode) {
          // Only switch routes if:
          // 1. We have valid outputs
          // 2. The difference is significant (> 5%)
          // 3. OR this is the first calculation (no route selected yet)
          if (v3Tokens > 0n || directTokens > 0n) {
            // If no route selected yet, select the best one
            if (!selectedRoute) {
              setSelectedRoute(newBestRoute);
            } else if (percentDiff > 5) {
              // Only switch if the difference is significant
              // This prevents flickering between routes for small differences
              setSelectedRoute(newBestRoute);
            }
          }
        }
      } catch (err) {
        console.error(t("jpyc.error_determining_route"), err);
        // Reset to safe defaults on error
        setV3Output(0n);
        setDirectOutput(0n);
        setPercentDiff(0);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [ethAmount, publicClient, reserves, autoMode]);

  return (
    <div className="space-y-4">
      {/* Route indicator and selector */}
      <div className="bg-[#4A90E2]/5 border border-[#4A90E2]/20 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {selectedRoute === "v3" ? (
              <UniswapLogo className="h-4 w-4 text-[#4A90E2]" />
            ) : (
              <Zap className="h-4 w-4 text-[#4A90E2]" />
            )}
            <span className="text-sm font-medium">
              {selectedRoute === "v3" ? t("jpyc.uniswap_v3_route") : t("jpyc.direct_pool_route")}
            </span>
            {bestRoute === selectedRoute && percentDiff > 1 && (
              <span className="text-xs text-[#4A90E2] font-medium">
                {autoMode
                  ? t("jpyc.percent_better", { percent: percentDiff.toFixed(1) })
                  : `(${t("jpyc.percent_better", { percent: percentDiff.toFixed(1) })})`}
              </span>
            )}
          </div>

          <button
            onClick={() => {
              setAutoMode(!autoMode);
              if (!autoMode) {
                setSelectedRoute(bestRoute);
              }
            }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-[#4A90E2] transition-colors"
          >
            <RefreshCw className={`h-3 w-3 ${autoMode ? "animate-pulse" : ""}`} />
            {autoMode ? t("jpyc.auto_mode") : t("jpyc.manual_mode")}
          </button>
        </div>

        {/* Show comparison when outputs are calculated */}
        {v3Output > 0n && directOutput > 0n && (
          <div className="text-xs space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{t("jpyc.expected_output")}:</span>
              <span className="font-mono font-medium flex items-center gap-1">
                {formatNumber(Number(formatUnits(selectedRoute === "v3" ? v3Output : directOutput, 18)), 4)}
                <span className="text-[#4A90E2]">JPYC</span>
              </span>
            </div>
            {!autoMode && (
              <div className="flex gap-1 mt-2">
                <button
                  onClick={() => setSelectedRoute("v3")}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                    selectedRoute === "v3"
                      ? "bg-[#4A90E2] text-white"
                      : "bg-[#4A90E2]/10 text-muted-foreground hover:bg-[#4A90E2]/20"
                  }`}
                >
                  <UniswapLogo className="h-3 w-3" />
                  {t("jpyc.v3_route")}
                  {bestRoute === "v3" && " ✓"}
                </button>
                <button
                  onClick={() => setSelectedRoute("direct")}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                    selectedRoute === "direct"
                      ? "bg-[#4A90E2] text-white"
                      : "bg-[#4A90E2]/10 text-muted-foreground hover:bg-[#4A90E2]/20"
                  }`}
                >
                  <Zap className="h-3 w-3" />
                  {t("jpyc.direct_route")}
                  {bestRoute === "direct" && " ✓"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Show only the selected route */}
      {selectedRoute === "v3" ? <JPYCUniswapV3Zap /> : <SingleEthLiquidity />}
    </div>
  );
};
