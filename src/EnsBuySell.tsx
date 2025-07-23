import { useEffect, useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits, parseEther, parseUnits, erc20Abi, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from "wagmi";

import { useETHPrice } from "./hooks/use-eth-price";
import { SwapPanel } from "./components/SwapPanel";
import { SlippageSettings } from "./components/SlippageSettings";
import PoolPriceChart from "./components/PoolPriceChart";
import { ChevronDownIcon } from "lucide-react";
import { type TokenMeta, ETH_TOKEN, ENS_TOKEN, ENS_POOL_ID, ENS_ADDRESS, ENS_POOL_KEY } from "./lib/coins";
import { CookbookAbi, CookbookAddress } from "./constants/Cookbook";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { AddLiquidity } from "./AddLiquidity";
import { RemoveLiquidity } from "./RemoveLiquidity";
import { ENSZapWrapper } from "./ENSZapWrapper";
import { useTokenSelection } from "./contexts/TokenSelectionContext";
import { getAmountOut, withSlippage, DEADLINE_SEC } from "./lib/swap";
import { nowSec, formatNumber } from "./lib/utils";
import { Button } from "./components/ui/button";
import { LoadingLogo } from "./components/ui/loading-logo";
import { useErc20Allowance } from "./hooks/use-erc20-allowance";
import { handleWalletError } from "./lib/errors";
import { ConnectMenu } from "./ConnectMenu";
import { CheckTheChainAbi, CheckTheChainAddress } from "./constants/CheckTheChain";
import { TrendingUp, Zap, ArrowRight, Sparkles } from "lucide-react";
import { ENSLogo } from "./components/icons/ENSLogo";
import { EnsFarmTab } from "./components/farm/EnsFarmTab";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useActiveIncentiveStreams } from "./hooks/use-incentive-streams";
import { useCombinedApr } from "./hooks/use-combined-apr";
import { usePoolApy } from "./hooks/use-pool-apy";

export const EnsBuySell = () => {
  const { t } = useTranslation();
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const { data: ethPrice } = useETHPrice();
  const { setSellToken, setBuyToken } = useTokenSelection();
  const [poolReserves, setPoolReserves] = useState<{
    reserve0: bigint;
    reserve1: bigint;
  }>({ reserve0: 0n, reserve1: 0n });

  const [ensBalance, setEnsBalance] = useState<bigint>(0n);
  const [ethBalance, setEthBalance] = useState<bigint>(0n);
  const [activeTab, setActiveTab] = useState<"swap" | "add" | "remove" | "zap">("swap");
  const [swapDirection, setSwapDirection] = useState<"buy" | "sell">("buy"); // buy = ETH->ENS, sell = ENS->ETH
  const [sellAmount, setSellAmount] = useState("");
  const [buyAmount, setBuyAmount] = useState("");
  const [lastEditedField, setLastEditedField] = useState<"sell" | "buy">("sell");
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [priceImpact, setPriceImpact] = useState<{
    currentPrice: number;
    projectedPrice: number;
    impactPercent: number;
    action: "buy" | "sell";
  } | null>(null);
  const [showPriceChart, setShowPriceChart] = useState<boolean>(true); // Open by default
  const [slippageBps, setSlippageBps] = useState<bigint>(1000n); // Default 10% for ENS
  const [arbitrageInfo, setArbitrageInfo] = useState<{
    type: "swap" | "zap"; // Which tab to highlight
    ensFromUniV3: number;
    ensFromCookbook: number;
    percentGain: number;
    testAmountETH: string; // Amount of ETH used for calculation
  } | null>(null);

  const { writeContractAsync, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const { allowance: ensAllowance } = useErc20Allowance({
    token: ENS_ADDRESS,
    spender: CookbookAddress,
  });

  
  // Get active incentive streams for ENS
  const { data: allStreams } = useActiveIncentiveStreams();
  
  // Find ENS farm
  const ensFarm = useMemo(() => {
    if (!allStreams) return null;
    // Look for farms incentivizing the ENS pool
    return allStreams.find((stream) => BigInt(stream.lpId) === ENS_POOL_ID);
  }, [allStreams]);
  
  // Get base APR for the pool
  const { data: poolApr } = usePoolApy(ENS_POOL_ID.toString());
  
  // Get combined APR - always call the hook but disable it when no farm exists
  const { farmApr = 0 } = useCombinedApr({
    stream: ensFarm || {} as any,
    lpToken: ENS_TOKEN,
    enabled: !!ensFarm,
  });


  // Create token metadata objects with current data
  const ethToken = useMemo<TokenMeta>(
    () => ({
      ...ETH_TOKEN,
      balance: ethBalance,
      reserve0: poolReserves.reserve0,
      reserve1: poolReserves.reserve1,
    }),
    [ethBalance, poolReserves.reserve0, poolReserves.reserve1],
  );

  const ensToken = useMemo<TokenMeta>(
    () => ({
      ...ENS_TOKEN,
      balance: ensBalance,
      reserve0: poolReserves.reserve0,
      reserve1: poolReserves.reserve1,
    }),
    [ensBalance, poolReserves.reserve0, poolReserves.reserve1],
  );

  // Set tokens in context when tab changes to add/remove/zap
  useEffect(() => {
    if (activeTab === "add" || activeTab === "remove" || activeTab === "zap") {
      setSellToken(ethToken);
      setBuyToken(ensToken);
    }
  }, [activeTab, ethToken, ensToken, setSellToken, setBuyToken]);

  // Fetch pool reserves
  useEffect(() => {
    const fetchPoolData = async () => {
      if (!publicClient) return;

      try {
        const poolData = await publicClient?.readContract({
          address: CookbookAddress,
          abi: CookbookAbi,
          functionName: "pools",
          args: [ENS_POOL_ID],
        });

        if (Array.isArray(poolData) && poolData.length >= 2) {
          setPoolReserves({
            reserve0: poolData[0] as bigint, // ETH
            reserve1: poolData[1] as bigint, // ENS
          });
        }
      } catch (error) {
        console.error("Failed to fetch ENS pool data:", error);
      }
    };

    fetchPoolData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchPoolData, 30000);
    return () => clearInterval(interval);
  }, [publicClient]);

  // Fetch ENS and ETH balances
  useEffect(() => {
    const fetchBalances = async () => {
      if (!publicClient || !address) return;

      try {
        // Fetch ENS balance
        const ensBalance = await publicClient?.readContract({
          address: ENS_ADDRESS,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        });
        if (ensBalance !== undefined) {
          setEnsBalance(ensBalance as bigint);
        }

        // Fetch ETH balance
        const ethBalance = await publicClient?.getBalance({ address });
        if (ethBalance !== undefined) {
          setEthBalance(ethBalance);
        }
      } catch (error) {
        console.error("Failed to fetch balances:", error);
      }
    };

    fetchBalances();
    // Refresh balances every 30 seconds
    const interval = setInterval(fetchBalances, 30000);
    return () => clearInterval(interval);
  }, [publicClient, address]);

  // Check for arbitrage opportunity
  useEffect(() => {
    const checkArbitrage = async () => {
      if (!publicClient || !poolReserves.reserve0 || !poolReserves.reserve1) return;

      try {
        // Get Uniswap V3 price from oracle
        const ensPriceData = await publicClient?.readContract({
          address: CheckTheChainAddress,
          abi: CheckTheChainAbi,
          functionName: "checkPriceInETH",
          args: ["ENS"],
        });

        if (!ensPriceData) return;

        const uniV3PriceInETH = ensPriceData[0] as bigint;
        if (uniV3PriceInETH === 0n) return;

        // Use sensible amount for arbitrage display:
        // - Default to 0.01 ETH demo amount
        // - If user is connected and 1% of their balance > 0.01 ETH, use that
        const onePercentBalance = isConnected && ethBalance > 0n 
          ? ethBalance / 100n 
          : 0n;
        const minAmount = parseEther("0.01");
        const testAmount = onePercentBalance > minAmount ? onePercentBalance : minAmount;
        const testAmountString = formatEther(testAmount);
        
        // Calculate ENS from both sources
        const ensFromUniV3 = (testAmount * 10n ** 18n) / uniV3PriceInETH;
        const ensFromCookbook = getAmountOut(testAmount, poolReserves.reserve0, poolReserves.reserve1, 30n);
        
        // Determine which opportunity exists
        if (ensFromCookbook > ensFromUniV3) {
          // Cookbook gives more ENS - highlight SWAP tab
          const extraENS = ensFromCookbook - ensFromUniV3;
          const percentGain = Number((extraENS * 10000n) / ensFromUniV3) / 100;
          
          if (percentGain > 0.5) {
            setArbitrageInfo({
              type: "swap",
              ensFromUniV3: Number(formatUnits(ensFromUniV3, 18)),
              ensFromCookbook: Number(formatUnits(ensFromCookbook, 18)),
              percentGain,
              testAmountETH: testAmountString,
            });
          }
        } else if (ensFromUniV3 > ensFromCookbook) {
          // Uniswap gives more ENS - highlight ZAP tab
          const extraENS = ensFromUniV3 - ensFromCookbook;
          const percentGain = Number((extraENS * 10000n) / ensFromCookbook) / 100;
          
          if (percentGain > 0.5) {
            setArbitrageInfo({
              type: "zap",
              ensFromUniV3: Number(formatUnits(ensFromUniV3, 18)),
              ensFromCookbook: Number(formatUnits(ensFromCookbook, 18)),
              percentGain,
              testAmountETH: testAmountString,
            });
          }
        } else {
          // No significant difference
          setArbitrageInfo(null);
        }
      } catch (error) {
        console.error("Failed to check arbitrage:", error);
      }
    };

    // Check on mount and when pool reserves or balance change
    checkArbitrage();
  }, [publicClient, poolReserves, ethBalance, isConnected]);

  // Calculate market cap and price
  const ensPrice =
    poolReserves.reserve0 > 0n && poolReserves.reserve1 > 0n
      ? Number(formatEther(poolReserves.reserve0)) / Number(formatUnits(poolReserves.reserve1, 18))
      : 0;

  const ensUsdPrice = ensPrice * (ethPrice?.priceUSD || 0);

  // ENS has a circulating supply of 33,165,585 tokens
  const circulatingSupply = 33165585n * 10n ** 18n; // 33,165,585 tokens with 18 decimals
  const marketCapUsd = ensUsdPrice * Number(formatUnits(circulatingSupply, 18));

  // Calculate output based on input
  const calculateOutput = useCallback(
    (value: string, field: "sell" | "buy") => {
      if (!poolReserves.reserve0 || !poolReserves.reserve1 || !value || parseFloat(value) === 0) {
        if (field === "sell") setBuyAmount("");
        else setSellAmount("");
        return;
      }

      try {
        if (field === "sell") {
          // User is editing sell amount
          if (swapDirection === "buy") {
            // Buying ENS with ETH
            const ethIn = parseEther(value);
            const ensOut = getAmountOut(ethIn, poolReserves.reserve0, poolReserves.reserve1, 30n);
            setBuyAmount(formatUnits(ensOut, 18));
          } else {
            // Selling ENS for ETH
            const ensIn = parseUnits(value, 18);
            const ethOut = getAmountOut(ensIn, poolReserves.reserve1, poolReserves.reserve0, 30n);
            setBuyAmount(formatEther(ethOut));
          }
        } else {
          // User is editing buy amount (exact out)
          if (swapDirection === "buy") {
            // Want exact ENS out, calculate ETH in
            const ensOut = parseUnits(value, 18);
            // For exact out: amountIn = (reserveIn * amountOut * 10000) / ((reserveOut - amountOut) * (10000 - fee))
            const ethIn = (poolReserves.reserve0 * ensOut * 10000n) / ((poolReserves.reserve1 - ensOut) * 9970n);
            setSellAmount(formatEther(ethIn));
          } else {
            // Want exact ETH out, calculate ENS in
            const ethOut = parseEther(value);
            const ensIn = (poolReserves.reserve1 * ethOut * 10000n) / ((poolReserves.reserve0 - ethOut) * 9970n);
            setSellAmount(formatUnits(ensIn, 18));
          }
        }
      } catch (error) {
        console.error("Error calculating swap amounts:", error);
        if (field === "sell") setBuyAmount("");
        else setSellAmount("");
      }
    },
    [poolReserves, swapDirection],
  );

  // Calculate price impact
  useEffect(() => {
    if (!poolReserves.reserve0 || !poolReserves.reserve1 || !sellAmount || parseFloat(sellAmount) === 0) {
      setPriceImpact(null);
      return;
    }

    const timer = setTimeout(() => {
      try {
        let newReserve0 = poolReserves.reserve0;
        let newReserve1 = poolReserves.reserve1;

        if (swapDirection === "buy") {
          // Buying ENS with ETH
          const ethIn = parseEther(sellAmount);
          const ensOut = getAmountOut(ethIn, poolReserves.reserve0, poolReserves.reserve1, 30n);
          newReserve0 = poolReserves.reserve0 + ethIn;
          newReserve1 = poolReserves.reserve1 - ensOut;
        } else {
          // Selling ENS for ETH
          const ensIn = parseUnits(sellAmount, 18);
          const ethOut = getAmountOut(ensIn, poolReserves.reserve1, poolReserves.reserve0, 30n);
          newReserve0 = poolReserves.reserve0 - ethOut;
          newReserve1 = poolReserves.reserve1 + ensIn;
        }

        const currentPrice =
          Number(formatEther(poolReserves.reserve0)) / Number(formatUnits(poolReserves.reserve1, 18));
        const newPrice = Number(formatEther(newReserve0)) / Number(formatUnits(newReserve1, 18));
        const impactPercent = ((newPrice - currentPrice) / currentPrice) * 100;

        setPriceImpact({
          currentPrice,
          projectedPrice: newPrice,
          impactPercent,
          action: swapDirection,
        });
      } catch (error) {
        console.error("Error calculating price impact:", error);
        setPriceImpact(null);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [sellAmount, swapDirection, poolReserves]);

  // Execute swap
  const executeSwap = async () => {
    if (!address || !sellAmount || parseFloat(sellAmount) <= 0) {
      setErrorMessage("Please enter a valid amount");
      return;
    }

    setErrorMessage(null);

    try {
      if (swapDirection === "buy") {
        // Buy ENS with ETH
        const ethIn = parseEther(sellAmount);

        // Validate ETH balance
        if (ethBalance < ethIn) {
          setErrorMessage("Insufficient ETH balance");
          return;
        }
        const ensOut = getAmountOut(ethIn, poolReserves.reserve0, poolReserves.reserve1, 30n);
        const minOut = withSlippage(ensOut, slippageBps);
        const deadline = nowSec() + BigInt(DEADLINE_SEC);

        const hash = await writeContractAsync({
          address: CookbookAddress,
          abi: CookbookAbi,
          functionName: "swapExactIn",
          args: [ENS_POOL_KEY as any, ethIn, minOut, true, address, deadline],
          value: ethIn,
        });

        setTxHash(hash);
        setSellAmount("");
        setBuyAmount("");
      } else {
        // Sell ENS for ETH
        const ensIn = parseUnits(sellAmount, 18);

        // Validate ENS balance
        if (ensBalance < ensIn) {
          setErrorMessage("Insufficient ENS balance");
          return;
        }

        // Check allowance
        if (!ensAllowance || ensAllowance < ensIn) {
          const approveHash = await writeContractAsync({
            address: ENS_ADDRESS,
            abi: erc20Abi,
            functionName: "approve",
            args: [CookbookAddress, maxUint256],
          });
          await publicClient?.waitForTransactionReceipt({ hash: approveHash });
        }

        const ethOut = getAmountOut(ensIn, poolReserves.reserve1, poolReserves.reserve0, 30n);
        const minOut = withSlippage(ethOut, slippageBps);
        const deadline = nowSec() + BigInt(DEADLINE_SEC);

        const hash = await writeContractAsync({
          address: CookbookAddress,
          abi: CookbookAbi,
          functionName: "swapExactIn",
          args: [ENS_POOL_KEY as any, ensIn, minOut, false, address, deadline],
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
      {/* Header with ENS theme */}
      <div className="mb-4 sm:mb-8 text-center">
        <div className="flex items-center justify-center gap-3">
          <svg width="36" height="36" className="sm:w-12 sm:h-12" viewBox="0 0 202 231" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M98.3592 2.80337L34.8353 107.327C34.3371 108.147 33.1797 108.238 32.5617 107.505C26.9693 100.864 6.13478 72.615 31.9154 46.8673C55.4403 23.3726 85.4045 6.62129 96.5096 0.831705C97.7695 0.174847 99.0966 1.59007 98.3592 2.80337Z"
              fill="#0080BC"
            />
            <path
              d="M94.8459 230.385C96.1137 231.273 97.6758 229.759 96.8261 228.467C82.6374 206.886 35.4713 135.081 28.9559 124.302C22.5295 113.67 9.88976 96.001 8.83534 80.8842C8.7301 79.3751 6.64332 79.0687 6.11838 80.4879C5.27178 82.7767 4.37045 85.5085 3.53042 88.6292C-7.07427 128.023 8.32698 169.826 41.7753 193.238L94.8459 230.386V230.385Z"
              fill="#0080BC"
            />
            <path
              d="M103.571 228.526L167.095 124.003C167.593 123.183 168.751 123.092 169.369 123.825C174.961 130.465 195.796 158.715 170.015 184.463C146.49 207.957 116.526 224.709 105.421 230.498C104.161 231.155 102.834 229.74 103.571 228.526Z"
              fill="#0080BC"
            />
            <path
              d="M107.154 0.930762C105.886 0.0433954 104.324 1.5567 105.174 2.84902C119.363 24.4301 166.529 96.2354 173.044 107.014C179.471 117.646 192.11 135.315 193.165 150.432C193.27 151.941 195.357 152.247 195.882 150.828C196.728 148.539 197.63 145.808 198.47 142.687C209.074 103.293 193.673 61.4905 160.225 38.078L107.154 0.930762Z"
              fill="#0080BC"
            />
          </svg>
        </div>
      </div>

      {/* Trading Interface with ENS theme */}
      <div className="bg-card border border-[#0080BC]/20 dark:border-[#0080BC]/10 rounded-lg p-2 sm:p-4 md:p-6 mb-4 sm:mb-6 md:mb-8">
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
                      <span className="sm:hidden text-muted-foreground text-[10px]">{arbitrageInfo.testAmountETH.slice(0, 4)} ETH</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="flex items-center gap-0.5 sm:gap-1 font-medium">
                        <span className="hidden sm:inline">{formatNumber(arbitrageInfo.ensFromCookbook, 4)}</span>
                        <span className="sm:hidden text-[10px]">{formatNumber(arbitrageInfo.ensFromCookbook, 2)}</span>
                        <ENSLogo className="h-3 w-3" />
                      </span>
                      <span className="ml-0.5 sm:ml-1 font-semibold text-green-600 dark:text-green-400 text-[10px] sm:text-xs">
                        +{arbitrageInfo.percentGain.toFixed(1)}%
                      </span>
                    </>
                  ) : (
                    <div className="flex items-center gap-1 sm:gap-2">
                      <Sparkles className="h-3 w-3 flex-shrink-0" />
                      <span className="flex items-center gap-0.5 sm:gap-1">
                        <span className="hidden sm:inline text-muted-foreground">{t("ens.get")}</span>
                        <span className="font-medium flex items-center gap-0.5">
                          <span className="hidden sm:inline">{formatNumber(arbitrageInfo.ensFromUniV3, 4)}</span>
                          <span className="sm:hidden text-[10px]">{formatNumber(arbitrageInfo.ensFromUniV3, 2)}</span>
                          <ENSLogo className="h-3 w-3" />
                        </span>
                        <span className="font-semibold text-green-600 dark:text-green-400 text-[10px] sm:text-xs">
                          +{arbitrageInfo.percentGain.toFixed(1)}%
                        </span>
                      </span>
                      <ArrowRight className="h-3 w-3 flex-shrink-0 hidden sm:inline" />
                      <span className="flex items-center gap-0.5 sm:gap-1">
                        <Zap className="h-3 w-3 flex-shrink-0 hidden sm:inline" />
                        <span className="font-medium text-[10px] sm:text-xs hidden sm:inline">{t("ens.zap_lp")}</span>
                        {(poolApr || farmApr > 0) && (
                          <span className="text-[#0080BC] font-semibold text-[10px] sm:text-xs hidden sm:inline">
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
            <TabsList className="flex flex-wrap sm:grid sm:grid-cols-5 gap-1 bg-[#0080BC]/5 dark:bg-[#0080BC]/10 p-1 h-auto w-full">
              <TabsTrigger
                value="swap"
                className={`relative flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm data-[state=active]:bg-[#0080BC]/20 dark:data-[state=active]:bg-[#0080BC]/30 data-[state=active]:text-[#0080BC] dark:data-[state=active]:text-white ${
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
                className="flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm data-[state=active]:bg-[#0080BC]/20 dark:data-[state=active]:bg-[#0080BC]/30 data-[state=active]:text-[#0080BC] dark:data-[state=active]:text-white"
              >
                {t("common.add")}
              </TabsTrigger>
              <TabsTrigger
                value="remove"
                className="flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm data-[state=active]:bg-[#0080BC]/20 dark:data-[state=active]:bg-[#0080BC]/30 data-[state=active]:text-[#0080BC] dark:data-[state=active]:text-white"
              >
                {t("common.remove")}
              </TabsTrigger>
              <TabsTrigger
                value="zap"
                className={`relative flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm data-[state=active]:bg-[#0080BC]/20 dark:data-[state=active]:bg-[#0080BC]/30 data-[state=active]:text-[#0080BC] dark:data-[state=active]:text-white ${
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
                className="flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm data-[state=active]:bg-[#0080BC]/20 dark:data-[state=active]:bg-[#0080BC]/30 data-[state=active]:text-[#0080BC] dark:data-[state=active]:text-white"
              >
                {t("common.farm")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="swap" className="mt-2 sm:mt-4">
              <div className="space-y-2 sm:space-y-4">
                {/* Custom simplified swap for ENS */}
                <div className="relative space-y-1">
                  {/* Sell panel */}
                  <SwapPanel
                    title={swapDirection === "buy" ? t("ens.you_pay") : t("ens.you_pay")}
                    selectedToken={swapDirection === "buy" ? ethToken : ensToken}
                    tokens={[]} // Empty array prevents token selection
                    onSelect={() => {}} // No-op
                    isEthBalanceFetching={false}
                    amount={sellAmount}
                    onAmountChange={(val) => {
                      setSellAmount(val);
                      setLastEditedField("sell");
                      calculateOutput(val, "sell");
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
                        // Max ENS
                        const formatted = formatUnits(ensBalance, 18);
                        setSellAmount(formatted);
                        calculateOutput(formatted, "sell");
                      }
                    }}
                    showPercentageSlider={
                      lastEditedField === "sell" &&
                      ((swapDirection === "buy" && ethBalance > 0n) || (swapDirection === "sell" && ensBalance > 0n))
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
                        className="bg-background border-2 border-[#0080BC]/20 rounded-full p-2 hover:border-[#0080BC]/40 transition-all hover:rotate-180 duration-300"
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
                    title={swapDirection === "buy" ? t("ens.you_receive") : t("ens.you_receive")}
                    selectedToken={swapDirection === "buy" ? ensToken : ethToken}
                    tokens={[]} // Empty array prevents token selection
                    onSelect={() => {}} // No-op
                    isEthBalanceFetching={false}
                    amount={buyAmount}
                    onAmountChange={(val) => {
                      setBuyAmount(val);
                      setLastEditedField("buy");
                      calculateOutput(val, "buy");
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
                        (swapDirection === "sell" && ensBalance > 0n && parseUnits(sellAmount || "0", 18) > ensBalance)
                      }
                      className="w-full bg-[#0080BC] hover:bg-[#0066CC] text-white"
                    >
                      {isPending ? (
                        <span className="flex items-center gap-2">
                          <LoadingLogo size="sm" />
                          {swapDirection === "buy" ? t("ens.buying") : t("ens.selling")}
                        </span>
                      ) : swapDirection === "buy" ? (
                        t("ens.buy_ens")
                      ) : (
                        t("ens.sell_ens")
                      )}
                    </Button>
                  )}

                  {errorMessage && <p className="text-destructive text-sm">{errorMessage}</p>}
                  {isSuccess && <p className="text-green-600 text-sm">{t("ens.transaction_confirmed")}</p>}

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
                        <div className="text-xs text-muted-foreground">ENS/ETH {t("coin.price_history")}</div>
                      )}
                    </div>

                    {showPriceChart && (
                      <div className="transition-all duration-300">
                        <PoolPriceChart
                          poolId={ENS_POOL_ID.toString()}
                          ticker="ENS"
                          ethUsdPrice={ethPrice?.priceUSD}
                          priceImpact={priceImpact}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-xs text-muted-foreground text-center">{t("coin.pool_fee")}: 0.3%</div>

                {/* Market Stats - subtle below chart */}
                <div className="mt-4 sm:mt-6 grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 text-xs">
                  <div className="text-center">
                    <p className="text-muted-foreground opacity-70">{t("coin.price")}</p>
                    <p className="font-medium">{ensPrice > 0 ? `${ensPrice.toFixed(6)} ETH` : "-"}</p>
                    <p className="text-muted-foreground opacity-60">${ensUsdPrice.toFixed(2)}</p>
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
                    <p className="text-muted-foreground opacity-70">{t("coin.pool_ens")}</p>
                    <p className="font-medium">{Number(formatUnits(poolReserves.reserve1, 18)).toFixed(3)} ENS</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="add" className="mt-2 sm:mt-4">
              <AddLiquidity />
            </TabsContent>

            <TabsContent value="remove" className="mt-2 sm:mt-4">
              <RemoveLiquidity />
            </TabsContent>

            <TabsContent value="zap" className="mt-2 sm:mt-4">
              <ENSZapWrapper />
            </TabsContent>
            <TabsContent value="farm" className="mt-2 sm:mt-4">
              <ErrorBoundary fallback={<div>{t("common.error_loading_farm")}</div>}>
                <EnsFarmTab />
              </ErrorBoundary>
            </TabsContent>
          </Tabs>
      </div>

      {/* Info Section with ENS theme */}
      <div className="mt-6 md:mt-8 bg-card border border-[#0080BC]/20 dark:border-[#0080BC]/10 rounded-lg p-4 md:p-6">
        <h2 className="text-lg md:text-xl font-semibold mb-4 text-[#0080BC] dark:text-[#5BA0CC]">
          {t("ens.about_title")}
        </h2>
        <p className="text-muted-foreground mb-4">{t("ens.about_description")}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">{t("coin.total_supply")}</p>
            <p className="font-medium">100,000,000 ENS</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("coin.contract_address")}</p>
            <a
              href={`https://etherscan.io/address/${ENS_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs break-all hover:text-[#0080BC] transition-colors"
            >
              {ENS_ADDRESS}
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
          href="https://ens.domains/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm text-muted-foreground hover:text-[#0080BC] transition-colors mt-4"
        >
          ens.domains ↗
        </a>
      </div>

    </div>
  );
};
