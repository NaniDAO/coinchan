import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { parseEther } from "viem";
import { usePublicClient } from "wagmi";
import { SingleEthLiquidity } from "./SingleEthLiquidity";
import { ENSUniswapV3Zap } from "./ENSUniswapV3Zap";
import { CheckTheChainAbi, CheckTheChainAddress } from "./constants/CheckTheChain";
import { useReserves } from "./hooks/use-reserves";
import { ENS_POOL_ID } from "./lib/coins";
import { getAmountOut } from "./lib/swap";
import { RefreshCw, TrendingUp, Zap } from "lucide-react";
import { UniswapLogo } from "./components/icons/UniswapLogo";
import { ENSLogo } from "./components/icons/ENSLogo";
import { formatNumber } from "./lib/utils";
import { formatUnits } from "viem";
import type { ENSZapEthAmountChangeDetail } from "./types/events";

export const ENSZapWrapper = () => {
  const { t } = useTranslation();
  const [selectedRoute, setSelectedRoute] = useState<"v3" | "direct">("v3");
  const [autoMode, setAutoMode] = useState(true);
  const [ethAmount, setEthAmount] = useState("");
  const [bestRoute, setBestRoute] = useState<"v3" | "direct">("v3");
  const [v3Output, setV3Output] = useState<bigint>(0n);
  const [directOutput, setDirectOutput] = useState<bigint>(0n);
  const [percentDiff, setPercentDiff] = useState<number>(0);

  const publicClient = usePublicClient();
  const { data: reserves } = useReserves({
    poolId: ENS_POOL_ID,
    source: "cookbook",
  });

  // Listen to ETH amount changes from child components
  useEffect(() => {
    const handleEthAmountChange = (event: CustomEvent<ENSZapEthAmountChangeDetail>) => {
      setEthAmount(event.detail.amount);
    };

    window.addEventListener("ensZapEthAmountChange", handleEthAmountChange);
    return () => {
      window.removeEventListener("ensZapEthAmountChange", handleEthAmountChange);
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
          const ensPriceData = await publicClient.readContract({
            address: CheckTheChainAddress,
            abi: CheckTheChainAbi,
            functionName: "checkPriceInETH",
            args: ["ENS"],
          });

          if (ensPriceData) {
            const ensPriceInETH = ensPriceData[0] as bigint;
            if (ensPriceInETH > 0n) {
              v3Tokens = (((halfEthAmount * 10n ** 18n) / ensPriceInETH) * 997n) / 1000n;
            }
          }
        } catch {}

        // Get direct pool output
        let directTokens = 0n;
        if (reserves.reserve0 > 0n && reserves.reserve1 > 0n) {
          directTokens = getAmountOut(halfEthAmount, reserves.reserve0, reserves.reserve1, 30n);
        }

        setV3Output(v3Tokens);
        setDirectOutput(directTokens);

        // Calculate percentage difference
        if (v3Tokens > 0n && directTokens > 0n) {
          const larger = v3Tokens > directTokens ? v3Tokens : directTokens;
          const smaller = v3Tokens > directTokens ? directTokens : v3Tokens;
          const diff = ((larger - smaller) * 10000n) / smaller;
          setPercentDiff(Number(diff) / 100);
        } else {
          setPercentDiff(0);
        }

        // Set best route
        const newBestRoute = v3Tokens > directTokens ? "v3" : "direct";
        setBestRoute(newBestRoute);

        // Auto-select if in auto mode
        if (autoMode) {
          setSelectedRoute(newBestRoute);
        }
      } catch (err) {
        console.error("Error determining best route:", err);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [ethAmount, publicClient, reserves, autoMode]);

  return (
    <div className="space-y-4">
      {/* Route indicator and selector */}
      <div className="bg-[#0080BC]/5 border border-[#0080BC]/20 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {selectedRoute === "v3" ? (
              <UniswapLogo className="h-4 w-4 text-[#0080BC]" />
            ) : (
              <Zap className="h-4 w-4 text-[#0080BC]" />
            )}
            <span className="text-sm font-medium">
              {selectedRoute === "v3" ? "Uniswap V3 Route" : "Direct Pool Route"}
            </span>
            {autoMode && bestRoute === selectedRoute && percentDiff > 1 && (
              <span className="text-xs text-[#0080BC] font-medium">+{percentDiff.toFixed(1)}% better</span>
            )}
          </div>

          <button
            onClick={() => {
              setAutoMode(!autoMode);
              if (!autoMode) {
                setSelectedRoute(bestRoute);
              }
            }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-[#0080BC] transition-colors"
          >
            <RefreshCw className={`h-3 w-3 ${autoMode ? "animate-pulse" : ""}`} />
            {autoMode ? "Auto" : "Manual"}
          </button>
        </div>

        {/* Show comparison when outputs are calculated */}
        {v3Output > 0n && directOutput > 0n && (
          <div className="text-xs space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Expected ENS output:</span>
              <span className="font-mono font-medium flex items-center gap-1">
                {formatNumber(Number(formatUnits(selectedRoute === "v3" ? v3Output : directOutput, 18)), 4)}
                <ENSLogo className="h-3 w-3 text-[#0080BC]" />
                ENS
              </span>
            </div>
            {!autoMode && (
              <div className="flex gap-1 mt-2">
                <button
                  onClick={() => setSelectedRoute("v3")}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                    selectedRoute === "v3"
                      ? "bg-[#0080BC] text-white"
                      : "bg-[#0080BC]/10 text-muted-foreground hover:bg-[#0080BC]/20"
                  }`}
                >
                  <UniswapLogo className="h-3 w-3" />
                  V3 Route
                  {bestRoute === "v3" && " ✓"}
                </button>
                <button
                  onClick={() => setSelectedRoute("direct")}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                    selectedRoute === "direct"
                      ? "bg-[#0080BC] text-white"
                      : "bg-[#0080BC]/10 text-muted-foreground hover:bg-[#0080BC]/20"
                  }`}
                >
                  <Zap className="h-3 w-3" />
                  Direct Route
                  {bestRoute === "direct" && " ✓"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Show only the selected route */}
      {selectedRoute === "v3" ? <ENSUniswapV3Zap /> : <SingleEthLiquidity />}
    </div>
  );
};
