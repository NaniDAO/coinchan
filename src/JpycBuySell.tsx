import { useEffect, useState, useMemo, useCallback, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits, parseEther, parseUnits, erc20Abi, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from "wagmi";

import { useETHPrice } from "./hooks/use-eth-price";
import { SwapPanel } from "./components/SwapPanel";
import { SlippageSettings } from "./components/SlippageSettings";
// Lazy load heavy components
const PoolPriceChart = lazy(() => import("./components/PoolPriceChart"));
import { ChevronDownIcon } from "lucide-react";
import { type TokenMeta, ETH_TOKEN, JPYC_TOKEN, JPYC_POOL_ID, JPYC_ADDRESS, JPYC_POOL_KEY } from "./lib/coins";
import { CookbookAbi, CookbookAddress } from "./constants/Cookbook";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { AddLiquidity } from "./AddLiquidity";
import { RemoveLiquidity } from "./RemoveLiquidity";
import { JPYCZap } from "./JPYCZap";
import { useTokenSelection } from "./contexts/TokenSelectionContext";
import { getAmountOut, withSlippage, DEADLINE_SEC } from "./lib/swap";
import { nowSec, formatNumber, debounce } from "./lib/utils";
import { Button } from "./components/ui/button";
import { LoadingLogo } from "./components/ui/loading-logo";
import { useErc20Allowance } from "./hooks/use-erc20-allowance";
import { handleWalletError } from "./lib/errors";
import { ConnectMenu } from "./ConnectMenu";
import { CheckTheChainAbi, CheckTheChainAddress } from "./constants/CheckTheChain";
import { TrendingUp, Zap, ArrowRight, Sparkles } from "lucide-react";
const JpycFarmTab = lazy(() =>
  import("./components/farm/JpycFarmTab").then((module) => ({ default: module.JpycFarmTab })),
);
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useActiveIncentiveStreams } from "./hooks/use-incentive-streams";
import { useCombinedApr } from "./hooks/use-combined-apr";
import { usePoolApy } from "./hooks/use-pool-apy";

export const JpycBuySell = () => {
  const { t } = useTranslation();
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const { data: ethPrice } = useETHPrice();
  const { setSellToken, setBuyToken } = useTokenSelection();
  const [poolReserves, setPoolReserves] = useState<{
    reserve0: bigint;
    reserve1: bigint;
  }>({ reserve0: 0n, reserve1: 0n });

  const [jpycBalance, setJpycBalance] = useState<bigint>(0n);
  const [ethBalance, setEthBalance] = useState<bigint>(0n);
  const [jpycTotalSupply, setJpycTotalSupply] = useState<bigint>(0n);
  const [activeTab, setActiveTab] = useState<"swap" | "add" | "remove" | "zap">("swap");
  const [swapDirection, setSwapDirection] = useState<"buy" | "sell">("buy"); // buy = ETH->JPYC, sell = JPYC->ETH
  const [sellAmount, setSellAmount] = useState("");
  const [buyAmount, setBuyAmount] = useState("");
  const [lastEditedField, setLastEditedField] = useState<"sell" | "buy">("sell");
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPriceChart, setShowPriceChart] = useState<boolean>(true); // Open by default
  const [slippageBps, setSlippageBps] = useState<bigint>(1000n); // Default 10% for JPYC
  const [arbitrageInfo, setArbitrageInfo] = useState<{
    type: "swap" | "zap"; // Which tab to highlight
    jpycFromUniV3: number;
    jpycFromCookbook: number;
    percentGain: number;
    testAmountETH: string; // Amount of ETH used for calculation
  } | null>(null);

  const { writeContractAsync, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const { allowance: jpycAllowance } = useErc20Allowance({
    token: JPYC_ADDRESS,
    spender: CookbookAddress,
  });

  // Get active incentive streams for JPYC
  const { data: allStreams } = useActiveIncentiveStreams();

  // Find JPYC farm
  const jpycFarm = useMemo(() => {
    if (!allStreams) return null;
    // Look for farms incentivizing the JPYC pool
    return allStreams.find((stream) => BigInt(stream.lpId) === JPYC_POOL_ID);
  }, [allStreams]);

  // Get base APR for the pool
  const { data: poolApr } = usePoolApy(JPYC_POOL_ID.toString());

  // Get combined APR - always call the hook but disable it when no farm exists
  const { farmApr = 0 } = useCombinedApr({
    stream: jpycFarm || ({} as any),
    lpToken: JPYC_TOKEN,
    enabled: !!jpycFarm,
  });

  // Create token metadata objects with current data - optimized to reduce object creation
  const ethToken = useMemo<TokenMeta>(() => {
    // Only create new object if values actually changed
    if (
      ETH_TOKEN.balance === ethBalance &&
      ETH_TOKEN.reserve0 === poolReserves.reserve0 &&
      ETH_TOKEN.reserve1 === poolReserves.reserve1
    ) {
      return ETH_TOKEN;
    }
    return {
      ...ETH_TOKEN,
      balance: ethBalance,
      reserve0: poolReserves.reserve0,
      reserve1: poolReserves.reserve1,
    };
  }, [ethBalance, poolReserves.reserve0, poolReserves.reserve1]);

  const jpycToken = useMemo<TokenMeta>(() => {
    // Only create new object if values actually changed
    if (
      JPYC_TOKEN.balance === jpycBalance &&
      JPYC_TOKEN.reserve0 === poolReserves.reserve0 &&
      JPYC_TOKEN.reserve1 === poolReserves.reserve1
    ) {
      return JPYC_TOKEN;
    }
    return {
      ...JPYC_TOKEN,
      balance: jpycBalance,
      reserve0: poolReserves.reserve0,
      reserve1: poolReserves.reserve1,
    };
  }, [jpycBalance, poolReserves.reserve0, poolReserves.reserve1]);

  // Set tokens in context when tab changes to add/remove/zap
  useEffect(() => {
    if (activeTab === "add" || activeTab === "remove" || activeTab === "zap") {
      setSellToken(ethToken);
      setBuyToken(jpycToken);
    }
  }, [activeTab, ethToken, jpycToken, setSellToken, setBuyToken]);

  // Consolidated data fetching for pool reserves, balances, and total supply
  useEffect(() => {
    const fetchAllData = async () => {
      if (!publicClient) return;

      try {
        // Batch fetch pool data, balances, and total supply in parallel
        const promises = [];

        // Pool data
        promises.push(
          publicClient.readContract({
            address: CookbookAddress,
            abi: CookbookAbi,
            functionName: "pools",
            args: [JPYC_POOL_ID],
          }),
        );

        // JPYC total supply (always fetch)
        promises.push(
          publicClient.readContract({
            address: JPYC_ADDRESS,
            abi: erc20Abi,
            functionName: "totalSupply",
          }),
        );

        // Balances if address is available
        if (address) {
          promises.push(
            publicClient.readContract({
              address: JPYC_ADDRESS,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [address],
            }),
            publicClient.getBalance({ address }),
          );
        }

        const results = await Promise.all(promises);

        // Update pool reserves
        const poolData = results[0];
        if (Array.isArray(poolData) && poolData.length >= 2) {
          setPoolReserves({
            reserve0: poolData[0] as bigint, // ETH
            reserve1: poolData[1] as bigint, // JPYC
          });
        }

        // Update total supply
        const totalSupply = results[1] as bigint;
        if (totalSupply !== undefined) {
          setJpycTotalSupply(totalSupply);
        }

        // Update balances if fetched
        if (address && results.length > 2) {
          const jpycBalance = results[2] as bigint;
          const ethBalance = results[3] as bigint;

          if (jpycBalance !== undefined) {
            setJpycBalance(jpycBalance);
          }
          if (ethBalance !== undefined) {
            setEthBalance(ethBalance);
          }
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      }
    };

    fetchAllData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchAllData, 30000);
    return () => clearInterval(interval);
  }, [publicClient, address]);

  // Check for arbitrage opportunity with proper cleanup
  useEffect(() => {
    let cancelled = false;

    const checkArbitrage = async () => {
      if (!publicClient || !poolReserves.reserve0 || !poolReserves.reserve1) return;

      try {
        // Get Uniswap V3 price from oracle
        const jpycPriceData = await publicClient?.readContract({
          address: CheckTheChainAddress,
          abi: CheckTheChainAbi,
          functionName: "checkPriceInETH",
          args: ["JPYC"],
        });

        if (!jpycPriceData) return;

        const uniV3PriceInETH = jpycPriceData[0] as bigint;
        if (uniV3PriceInETH === 0n) return;

        // Use sensible amount for arbitrage display:
        // - Default to 0.01 ETH demo amount
        // - If user is connected and 1% of their balance > 0.01 ETH, use that
        const onePercentBalance = isConnected && ethBalance > 0n ? ethBalance / 100n : 0n;
        const minAmount = parseEther("0.01");
        const testAmount = onePercentBalance > minAmount ? onePercentBalance : minAmount;
        const testAmountString = formatEther(testAmount);

        // Calculate JPYC from both sources
        const jpycFromUniV3 = (testAmount * 10n ** 18n) / uniV3PriceInETH;
        const jpycFromCookbook = getAmountOut(testAmount, poolReserves.reserve0, poolReserves.reserve1, 30n);

        // Determine which opportunity exists
        if (jpycFromCookbook > jpycFromUniV3 && jpycFromUniV3 > 0n) {
          // Cookbook gives more JPYC - highlight SWAP tab
          const extraJPYC = jpycFromCookbook - jpycFromUniV3;
          const percentGain = Number((extraJPYC * 10000n) / jpycFromUniV3) / 100;

          if (percentGain > 0.5 && !cancelled) {
            setArbitrageInfo({
              type: "swap",
              jpycFromUniV3: Number(formatUnits(jpycFromUniV3, 18)),
              jpycFromCookbook: Number(formatUnits(jpycFromCookbook, 18)),
              percentGain,
              testAmountETH: testAmountString,
            });
          }
        } else if (jpycFromUniV3 > jpycFromCookbook && jpycFromCookbook > 0n) {
          // Uniswap gives more JPYC - highlight ZAP tab
          const extraJPYC = jpycFromUniV3 - jpycFromCookbook;
          const percentGain = Number((extraJPYC * 10000n) / jpycFromCookbook) / 100;

          if (percentGain > 0.5 && !cancelled) {
            setArbitrageInfo({
              type: "zap",
              jpycFromUniV3: Number(formatUnits(jpycFromUniV3, 18)),
              jpycFromCookbook: Number(formatUnits(jpycFromCookbook, 18)),
              percentGain,
              testAmountETH: testAmountString,
            });
          }
        } else if (!cancelled) {
          // No significant difference
          setArbitrageInfo(null);
        }
      } catch (error) {
        console.error("Failed to check arbitrage:", error);
      }
    };

    // Check on mount and when pool reserves or balance change
    checkArbitrage();

    return () => {
      cancelled = true;
    };
  }, [publicClient, poolReserves, ethBalance, isConnected]);

  // Calculate market cap and price with memoization using actual total supply
  const { jpycPrice, jpycUsdPrice, marketCapUsd } = useMemo(() => {
    const price =
      poolReserves.reserve0 > 0n && poolReserves.reserve1 > 0n
        ? Number(formatEther(poolReserves.reserve0)) / Number(formatUnits(poolReserves.reserve1, 18))
        : 0;

    const usdPrice = price * (ethPrice?.priceUSD || 0);

    // Use actual on-chain total supply
    const marketCap = jpycTotalSupply > 0n ? usdPrice * Number(formatUnits(jpycTotalSupply, 18)) : 0;

    return { jpycPrice: price, jpycUsdPrice: usdPrice, marketCapUsd: marketCap };
  }, [poolReserves.reserve0, poolReserves.reserve1, ethPrice?.priceUSD, jpycTotalSupply]);

  // Calculate output based on input
  const calculateOutput = useCallback(
    (value: string, field: "sell" | "buy") => {
      if (!poolReserves.reserve0 || !poolReserves.reserve1 || !value || parseFloat(value) === 0) {
        if (field === "sell") setBuyAmount("");
        else setSellAmount("");
        return;
      }

      // Minimum liquidity check to prevent calculation errors - very low thresholds
      // Only block if reserves are essentially zero to avoid false positives
      const minEthLiquidity = parseEther("0.001"); // 0.001 ETH minimum
      const minJpycLiquidity = parseUnits("1", 18); // 1 JPYC minimum
      if (poolReserves.reserve0 < minEthLiquidity || poolReserves.reserve1 < minJpycLiquidity) {
        setErrorMessage(t("jpyc.insufficient_liquidity"));
        if (field === "sell") setBuyAmount("");
        else setSellAmount("");
        return;
      }

      try {
        if (field === "sell") {
          // User is editing sell amount
          if (swapDirection === "buy") {
            // Buying JPYC with ETH
            const ethIn = parseEther(value);
            const jpycOut = getAmountOut(ethIn, poolReserves.reserve0, poolReserves.reserve1, 30n);
            setBuyAmount(formatUnits(jpycOut, 18));
          } else {
            // Selling JPYC for ETH
            const jpycIn = parseUnits(value, 18);
            const ethOut = getAmountOut(jpycIn, poolReserves.reserve1, poolReserves.reserve0, 30n);
            setBuyAmount(formatEther(ethOut));
          }
        } else {
          // User is editing buy amount (exact out)
          if (swapDirection === "buy") {
            // Want exact JPYC out, calculate ETH in
            const jpycOut = parseUnits(value, 18);
            // For exact out: amountIn = (reserveIn * amountOut * 10000) / ((reserveOut - amountOut) * (10000 - fee))
            // Ensure we don't exceed available reserves
            if (poolReserves.reserve1 > jpycOut && jpycOut > 0n) {
              const denominator = (poolReserves.reserve1 - jpycOut) * 9970n;
              if (denominator > 0n) {
                const ethIn = (poolReserves.reserve0 * jpycOut * 10000n) / denominator;
                setSellAmount(formatEther(ethIn));
              } else {
                setSellAmount("");
              }
            } else {
              setSellAmount("");
            }
          } else {
            // Want exact ETH out, calculate JPYC in
            const ethOut = parseEther(value);
            // Ensure we don't exceed available reserves
            if (poolReserves.reserve0 > ethOut && ethOut > 0n) {
              const denominator = (poolReserves.reserve0 - ethOut) * 9970n;
              if (denominator > 0n) {
                const jpycIn = (poolReserves.reserve1 * ethOut * 10000n) / denominator;
                setSellAmount(formatUnits(jpycIn, 18));
              } else {
                setSellAmount("");
              }
            } else {
              setSellAmount("");
            }
          }
        }
      } catch (error) {
        console.error("Error calculating swap amounts:", error);
        if (field === "sell") setBuyAmount("");
        else setSellAmount("");
      }
    },
    [poolReserves, swapDirection, setBuyAmount, setSellAmount],
  );

  // Debounced version for user input to prevent excessive recalculations
  const debouncedCalculateOutput = useMemo(
    () => debounce((value: string, field: "sell" | "buy") => calculateOutput(value, field), 300),
    [calculateOutput],
  );

  // Calculate price impact with memoization
  const priceImpact = useMemo(() => {
    if (!poolReserves.reserve0 || !poolReserves.reserve1 || !sellAmount || parseFloat(sellAmount) === 0) {
      return null;
    }

    try {
      let newReserve0 = poolReserves.reserve0;
      let newReserve1 = poolReserves.reserve1;

      if (swapDirection === "buy") {
        // Buying JPYC with ETH
        const ethIn = parseEther(sellAmount);
        const jpycOut = getAmountOut(ethIn, poolReserves.reserve0, poolReserves.reserve1, 30n);
        newReserve0 = poolReserves.reserve0 + ethIn;
        newReserve1 = poolReserves.reserve1 - jpycOut;
      } else {
        // Selling JPYC for ETH
        const jpycIn = parseUnits(sellAmount, 18);
        const ethOut = getAmountOut(jpycIn, poolReserves.reserve1, poolReserves.reserve0, 30n);
        newReserve0 = poolReserves.reserve0 - ethOut;
        newReserve1 = poolReserves.reserve1 + jpycIn;
      }

      const currentPrice = Number(formatEther(poolReserves.reserve0)) / Number(formatUnits(poolReserves.reserve1, 18));
      const newPrice = Number(formatEther(newReserve0)) / Number(formatUnits(newReserve1, 18));
      const impactPercent = ((newPrice - currentPrice) / currentPrice) * 100;

      return {
        currentPrice,
        projectedPrice: newPrice,
        impactPercent,
        action: swapDirection,
      };
    } catch (error) {
      console.error("Error calculating price impact:", error);
      return null;
    }
  }, [sellAmount, swapDirection, poolReserves.reserve0, poolReserves.reserve1]);

  // Execute swap
  const executeSwap = async () => {
    if (!address || !sellAmount || parseFloat(sellAmount) <= 0) {
      setErrorMessage("Please enter a valid amount");
      return;
    }

    setErrorMessage(null);

    try {
      if (swapDirection === "buy") {
        // Buy JPYC with ETH
        const ethIn = parseEther(sellAmount);

        // Validate ETH balance
        if (ethBalance < ethIn) {
          setErrorMessage("Insufficient ETH balance");
          return;
        }
        const jpycOut = getAmountOut(ethIn, poolReserves.reserve0, poolReserves.reserve1, 30n);
        const minOut = withSlippage(jpycOut, slippageBps);
        const deadline = nowSec() + BigInt(DEADLINE_SEC);

        const hash = await writeContractAsync({
          address: CookbookAddress,
          abi: CookbookAbi,
          functionName: "swapExactIn",
          args: [JPYC_POOL_KEY as any, ethIn, minOut, true, address, deadline],
          value: ethIn,
        });

        setTxHash(hash);
        setSellAmount("");
        setBuyAmount("");
      } else {
        // Sell JPYC for ETH
        const jpycIn = parseUnits(sellAmount, 18);

        // Validate JPYC balance
        if (jpycBalance < jpycIn) {
          setErrorMessage("Insufficient JPYC balance");
          return;
        }

        // Check allowance
        if (!jpycAllowance || jpycAllowance < jpycIn) {
          const approveHash = await writeContractAsync({
            address: JPYC_ADDRESS,
            abi: erc20Abi,
            functionName: "approve",
            args: [CookbookAddress, maxUint256],
          });

          try {
            await publicClient?.waitForTransactionReceipt({ hash: approveHash });
          } catch (approvalError) {
            setErrorMessage(t("errors.approval_failed"));
            return;
          }
        }

        const ethOut = getAmountOut(jpycIn, poolReserves.reserve1, poolReserves.reserve0, 30n);
        const minOut = withSlippage(ethOut, slippageBps);
        const deadline = nowSec() + BigInt(DEADLINE_SEC);

        const hash = await writeContractAsync({
          address: CookbookAddress,
          abi: CookbookAbi,
          functionName: "swapExactIn",
          args: [JPYC_POOL_KEY as any, jpycIn, minOut, false, address, deadline],
        });

        setTxHash(hash);
        setSellAmount("");
        setBuyAmount("");
      }
    } catch (err) {
      const errorMsg = handleWalletError(err, {
        defaultMessage: t("errors.transaction_error"),
      });
      if (errorMsg) {
        setErrorMessage(errorMsg);
      }
    }
  };

  return (
    <div className="container mx-auto max-w-2xl px-2 sm:px-4 py-4 sm:py-8">
      {/* Header with JPYC/Farcaster theme */}
      <div className="mb-4 sm:mb-8 text-center">
        <div className="flex items-center justify-center gap-3">
          <img
            src="https://content.wrappr.wtf/ipfs/bafkreigzo74zz6wlriztpznhuqxbh4nrucakv7dg6dxbroxlofzedthpce"
            alt="JPYC"
            className="w-12 h-12 sm:w-16 sm:h-16 rounded-full"
          />
          <div className="text-4xl sm:text-5xl font-bold text-[#4A90E2]">JPYC</div>
        </div>
      </div>

      {/* Trading Interface with Fark Blue theme */}
      <div className="bg-card border border-[#4A90E2]/20 dark:border-[#4A90E2]/10 rounded-lg p-2 sm:p-4 md:p-6 mb-4 sm:mb-6 md:mb-8">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          {/* Subtle arbitrage notification */}
          {arbitrageInfo && activeTab !== arbitrageInfo.type && (
            <div className="mb-2 flex justify-center sm:justify-end">
              <button
                onClick={() => setActiveTab(arbitrageInfo.type)}
                className="group relative flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full hover:bg-green-200 dark:hover:bg-green-900/50 transition-all animate-pulse hover:animate-none"
              >
                <TrendingUp className="h-3 w-3" />
                {arbitrageInfo.type === "swap" ? (
                  <>
                    <span className="hidden sm:inline text-muted-foreground">{arbitrageInfo.testAmountETH} ETH</span>
                    <span className="sm:hidden text-muted-foreground text-[10px]">
                      {arbitrageInfo.testAmountETH.slice(0, 4)} ETH
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="flex items-center gap-0.5 sm:gap-1 font-medium">
                      <span className="hidden sm:inline">{formatNumber(arbitrageInfo.jpycFromCookbook, 4)}</span>
                      <span className="sm:hidden text-[10px]">{formatNumber(arbitrageInfo.jpycFromCookbook, 2)}</span>
                      <span className="text-[#4A90E2]">JPYC</span>
                    </span>
                    <span className="ml-0.5 sm:ml-1 font-semibold text-green-600 dark:text-green-400 text-[10px] sm:text-xs">
                      +{arbitrageInfo.percentGain.toFixed(1)}%
                    </span>
                  </>
                ) : (
                  <div className="flex items-center gap-1 sm:gap-2">
                    <Sparkles className="h-3 w-3 flex-shrink-0" />
                    <span className="flex items-center gap-0.5 sm:gap-1">
                      <span className="hidden sm:inline text-muted-foreground">{t("jpyc.get")}</span>
                      <span className="font-medium flex items-center gap-0.5">
                        <span className="hidden sm:inline">{formatNumber(arbitrageInfo.jpycFromUniV3, 4)}</span>
                        <span className="sm:hidden text-[10px]">{formatNumber(arbitrageInfo.jpycFromUniV3, 2)}</span>
                        <span className="text-[#4A90E2]">JPYC</span>
                      </span>
                      <span className="font-semibold text-green-600 dark:text-green-400 text-[10px] sm:text-xs">
                        +{arbitrageInfo.percentGain.toFixed(1)}%
                      </span>
                    </span>
                    <ArrowRight className="h-3 w-3 flex-shrink-0 hidden sm:inline" />
                    <span className="flex items-center gap-0.5 sm:gap-1">
                      <Zap className="h-3 w-3 flex-shrink-0 hidden sm:inline" />
                      <span className="font-medium text-[10px] sm:text-xs hidden sm:inline">{t("jpyc.zap_lp")}</span>
                      {(poolApr || farmApr > 0) && (
                        <span className="text-[#4A90E2] font-semibold text-[10px] sm:text-xs hidden sm:inline">
                          APR {(Number(poolApr?.slice(0, -1) || 0) + farmApr).toFixed(1)}%
                        </span>
                      )}
                    </span>
                  </div>
                )}
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              </button>
            </div>
          )}
          <TabsList className="flex flex-wrap sm:grid sm:grid-cols-5 gap-1 bg-[#4A90E2]/5 dark:bg-[#4A90E2]/10 p-1 h-auto w-full">
            <TabsTrigger
              value="swap"
              className={`relative flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm data-[state=active]:bg-[#4A90E2]/20 dark:data-[state=active]:bg-[#4A90E2]/30 data-[state=active]:text-[#4A90E2] dark:data-[state=active]:text-white ${
                arbitrageInfo?.type === "swap" && activeTab !== "swap" ? "ring-1 ring-green-400/50" : ""
              }`}
            >
              {t("common.swap")}
              {arbitrageInfo?.type === "swap" && activeTab !== "swap" && (
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="add"
              className="flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm data-[state=active]:bg-[#4A90E2]/20 dark:data-[state=active]:bg-[#4A90E2]/30 data-[state=active]:text-[#4A90E2] dark:data-[state=active]:text-white"
            >
              {t("common.add")}
            </TabsTrigger>
            <TabsTrigger
              value="remove"
              className="flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm data-[state=active]:bg-[#4A90E2]/20 dark:data-[state=active]:bg-[#4A90E2]/30 data-[state=active]:text-[#4A90E2] dark:data-[state=active]:text-white"
            >
              {t("common.remove")}
            </TabsTrigger>
            <TabsTrigger
              value="zap"
              className={`relative flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm data-[state=active]:bg-[#4A90E2]/20 dark:data-[state=active]:bg-[#4A90E2]/30 data-[state=active]:text-[#4A90E2] dark:data-[state=active]:text-white ${
                arbitrageInfo?.type === "zap" && activeTab !== "zap" ? "ring-1 ring-green-400/50" : ""
              }`}
            >
              {t("common.zap")}
              {arbitrageInfo?.type === "zap" && activeTab !== "zap" && (
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="farm"
              className="flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm data-[state=active]:bg-[#4A90E2]/20 dark:data-[state=active]:bg-[#4A90E2]/30 data-[state=active]:text-[#4A90E2] dark:data-[state=active]:text-white"
            >
              {t("common.farm")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="swap" className="mt-2 sm:mt-4">
            <div className="space-y-2 sm:space-y-4">
              {/* Custom simplified swap for JPYC */}
              <div className="relative space-y-1">
                {/* Sell panel */}
                <SwapPanel
                  title={swapDirection === "buy" ? t("jpyc.you_pay") : t("jpyc.you_pay")}
                  selectedToken={swapDirection === "buy" ? ethToken : jpycToken}
                  tokens={[]} // Empty array prevents token selection
                  onSelect={() => {}} // No-op
                  isEthBalanceFetching={false}
                  amount={sellAmount}
                  onAmountChange={(val) => {
                    setSellAmount(val);
                    setLastEditedField("sell");
                    debouncedCalculateOutput(val, "sell");
                  }}
                  showMaxButton={true}
                  onMax={() => {
                    if (swapDirection === "buy") {
                      // Max ETH (leave some for gas)
                      const maxEth = (ethBalance * 99n) / 100n;
                      const formatted = formatEther(maxEth);
                      setSellAmount(formatted);
                      calculateOutput(formatted, "sell");
                    } else {
                      // Max JPYC
                      const formatted = formatUnits(jpycBalance, 18);
                      setSellAmount(formatted);
                      calculateOutput(formatted, "sell");
                    }
                  }}
                  showPercentageSlider={
                    lastEditedField === "sell" &&
                    ((swapDirection === "buy" && ethBalance > 0n) || (swapDirection === "sell" && jpycBalance > 0n))
                  }
                  className="pb-2"
                />

                {/* Flip button */}
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <button
                      onClick={() => {
                        setSwapDirection(swapDirection === "buy" ? "sell" : "buy");
                        setSellAmount("");
                        setBuyAmount("");
                      }}
                      className="bg-background border-2 border-[#4A90E2]/20 rounded-full p-2 hover:border-[#4A90E2]/40 transition-all hover:rotate-180 duration-300"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Buy panel */}
                <SwapPanel
                  title={swapDirection === "buy" ? t("jpyc.you_receive") : t("jpyc.you_receive")}
                  selectedToken={swapDirection === "buy" ? jpycToken : ethToken}
                  tokens={[]} // Empty array prevents token selection
                  onSelect={() => {}} // No-op
                  isEthBalanceFetching={false}
                  amount={buyAmount}
                  onAmountChange={(val) => {
                    setBuyAmount(val);
                    setLastEditedField("buy");
                    debouncedCalculateOutput(val, "buy");
                  }}
                  showPercentageSlider={lastEditedField === "buy"}
                  className="pt-2"
                />

                {/* Swap button */}
                {!isConnected ? (
                  <ConnectMenu />
                ) : (
                  <Button
                    onClick={executeSwap}
                    disabled={
                      isPending ||
                      !sellAmount ||
                      parseFloat(sellAmount) === 0 ||
                      (swapDirection === "buy" && ethBalance > 0n && parseEther(sellAmount || "0") > ethBalance) ||
                      (swapDirection === "sell" && jpycBalance > 0n && parseUnits(sellAmount || "0", 18) > jpycBalance)
                    }
                    className="w-full bg-[#4A90E2] hover:bg-[#3A7BC8] text-white"
                  >
                    {isPending ? (
                      <span className="flex items-center gap-2">
                        <LoadingLogo size="sm" />
                        {swapDirection === "buy" ? t("jpyc.buying") : t("jpyc.selling")}
                      </span>
                    ) : swapDirection === "buy" ? (
                      t("jpyc.buy_jpyc")
                    ) : (
                      t("jpyc.sell_jpyc")
                    )}
                  </Button>
                )}

                {errorMessage && <p className="text-destructive text-sm">{errorMessage}</p>}
                {isSuccess && <p className="text-green-600 text-sm">{t("jpyc.transaction_confirmed")}</p>}

                {/* Slippage Settings */}
                <div className="mt-4">
                  <SlippageSettings slippageBps={slippageBps} setSlippageBps={setSlippageBps} />
                </div>

                {/* Price impact display */}
                {priceImpact && (
                  <div className="mt-2 p-2 bg-muted/50 rounded-md">
                    <div className="text-xs text-muted-foreground flex items-center justify-between">
                      <span>{t("swap.price_impact")}:</span>
                      <span
                        className={`font-medium ${priceImpact.impactPercent > 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        {priceImpact.impactPercent > 0 ? "+" : ""}
                        {priceImpact.impactPercent.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Chart */}
              <div className="mt-4 border-t border-primary pt-4">
                <div className="relative flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() => setShowPriceChart((prev) => !prev)}
                      className="text-xs text-muted-foreground flex items-center gap-1 hover:text-primary"
                    >
                      {showPriceChart ? t("coin.hide_chart") : t("coin.show_chart")}
                      <ChevronDownIcon
                        className={`w-3 h-3 transition-transform ${showPriceChart ? "rotate-180" : ""}`}
                      />
                    </button>
                    {showPriceChart && (
                      <div className="text-xs text-muted-foreground">JPYC/ETH {t("coin.price_history")}</div>
                    )}
                  </div>

                  {showPriceChart && (
                    <div className="transition-all duration-300">
                      <Suspense
                        fallback={
                          <div className="h-64 flex items-center justify-center">
                            <LoadingLogo />
                          </div>
                        }
                      >
                        <PoolPriceChart
                          poolId={JPYC_POOL_ID.toString()}
                          ticker="JPYC"
                          ethUsdPrice={ethPrice?.priceUSD}
                          priceImpact={priceImpact}
                        />
                      </Suspense>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-xs text-muted-foreground text-center">{t("coin.pool_fee")}: 0.3%</div>

              {/* Market Stats - subtle below chart */}
              <div className="mt-4 sm:mt-6 grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 text-xs">
                <div className="text-center">
                  <p className="text-muted-foreground opacity-70">{t("coin.price")}</p>
                  <p className="font-medium">{jpycPrice > 0 ? `${jpycPrice.toFixed(6)} ETH` : "-"}</p>
                  <p className="text-muted-foreground opacity-60">${jpycUsdPrice.toFixed(2)}</p>
                </div>

                <div className="text-center">
                  <p className="text-muted-foreground opacity-70">{t("coin.market_cap")}</p>
                  <p className="font-medium">
                    $
                    {marketCapUsd > 1e9
                      ? (marketCapUsd / 1e9).toFixed(2) + "B"
                      : marketCapUsd > 0
                        ? (marketCapUsd / 1e6).toFixed(2) + "M"
                        : "-"}
                  </p>
                </div>

                <div className="text-center">
                  <p className="text-muted-foreground opacity-70">{t("coin.pool_eth")}</p>
                  <p className="font-medium">{formatEther(poolReserves.reserve0)} ETH</p>
                </div>

                <div className="text-center">
                  <p className="text-muted-foreground opacity-70">{t("coin.pool_jpyc")}</p>
                  <p className="font-medium">{Number(formatUnits(poolReserves.reserve1, 18)).toFixed(3)} JPYC</p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="add" className="mt-2 sm:mt-4">
            <ErrorBoundary
              fallback={<div className="text-center py-4 text-destructive">{t("common.error_loading_component")}</div>}
            >
              <AddLiquidity />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="remove" className="mt-2 sm:mt-4">
            <ErrorBoundary
              fallback={<div className="text-center py-4 text-destructive">{t("common.error_loading_component")}</div>}
            >
              <RemoveLiquidity />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="zap" className="mt-2 sm:mt-4">
            <ErrorBoundary
              fallback={<div className="text-center py-4 text-destructive">{t("common.error_loading_component")}</div>}
            >
              <JPYCZap />
            </ErrorBoundary>
          </TabsContent>
          <TabsContent value="farm" className="mt-2 sm:mt-4">
            <ErrorBoundary fallback={<div>{t("common.error_loading_farm")}</div>}>
              <Suspense
                fallback={
                  <div className="h-64 flex items-center justify-center">
                    <LoadingLogo />
                  </div>
                }
              >
                <JpycFarmTab />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>
        </Tabs>
      </div>

      {/* Info Section with Fark Blue theme */}
      <div className="mt-6 md:mt-8 bg-card border border-[#4A90E2]/20 dark:border-[#4A90E2]/10 rounded-lg p-4 md:p-6">
        <h2 className="text-lg md:text-xl font-semibold mb-4 text-[#4A90E2] dark:text-[#6CA8E8]">
          {t("jpyc.about_title")}
        </h2>
        <p className="text-muted-foreground mb-4">{t("jpyc.about_description")}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">{t("coin.total_supply")}</p>
            <p className="font-medium">
              {jpycTotalSupply > 0n
                ? `${formatNumber(Number(formatUnits(jpycTotalSupply, 18)), 0)} JPYC`
                : "Loading..."}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("coin.contract_address")}</p>
            <a
              href={`https://etherscan.io/address/${JPYC_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs break-all hover:text-[#4A90E2] transition-colors"
            >
              {JPYC_ADDRESS}
            </a>
          </div>
          <div>
            <p className="text-muted-foreground">{t("coin.pool_fee")}</p>
            <p className="font-medium">0.3%</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("coin.decimals")}</p>
            <p className="font-medium">18</p>
          </div>
        </div>
        <a
          href="https://corporate.jpyc.co.jp/en"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm text-muted-foreground hover:text-[#4A90E2] transition-colors mt-4"
        >
          corporate.jpyc.co.jp ↗
        </a>
      </div>
    </div>
  );
};
