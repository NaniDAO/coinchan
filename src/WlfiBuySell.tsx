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
import { type TokenMeta, ETH_TOKEN, WLFI_TOKEN, WLFI_POOL_ID, WLFI_ADDRESS, WLFI_POOL_KEY } from "./lib/coins";
import { CookbookAbi, CookbookAddress } from "./constants/Cookbook";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { AddLiquidity } from "./AddLiquidity";
import { RemoveLiquidity } from "./RemoveLiquidity";
import { WLFIZapWrapper } from "./WLFIZapWrapper";
import { useTokenSelection } from "./contexts/TokenSelectionContext";
import { getAmountOut, withSlippage, DEADLINE_SEC } from "./lib/swap";
import { nowSec, debounce } from "./lib/utils";
import { Button } from "./components/ui/button";
import { LoadingLogo } from "./components/ui/loading-logo";
import { useErc20Allowance } from "./hooks/use-erc20-allowance";
import { handleWalletError } from "./lib/errors";
import { ConnectMenu } from "./ConnectMenu";
const WlfiFarmTab = lazy(() =>
  import("./components/farm/WlfiFarmTab").then((module) => ({ default: module.WlfiFarmTab })),
);
import { ErrorBoundary } from "./components/ErrorBoundary";

// WLFI Logo Component - using local image
const WLFILogo = ({ className = "h-4 w-4" }: { className?: string }) => (
  <img 
    src="/wlfi.png"
    alt="WLFI"
    className={className}
  />
);

export const WlfiBuySell = () => {
  const { t } = useTranslation();
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const { data: ethPrice } = useETHPrice();
  const { setSellToken, setBuyToken } = useTokenSelection();
  const [poolReserves, setPoolReserves] = useState<{
    reserve0: bigint;
    reserve1: bigint;
  }>({ reserve0: 0n, reserve1: 0n });

  const [wlfiBalance, setWlfiBalance] = useState<bigint>(0n);
  const [ethBalance, setEthBalance] = useState<bigint>(0n);
  const [activeTab, setActiveTab] = useState<"swap" | "add" | "remove" | "zap">("swap");
  const [swapDirection, setSwapDirection] = useState<"buy" | "sell">("buy"); // buy = ETH->WLFI, sell = WLFI->ETH
  const [sellAmount, setSellAmount] = useState("");
  const [buyAmount, setBuyAmount] = useState("");
  const [lastEditedField, setLastEditedField] = useState<"sell" | "buy">("sell");
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPriceChart, setShowPriceChart] = useState<boolean>(true); // Open by default
  const [slippageBps, setSlippageBps] = useState<bigint>(1000n); // Default 10% for WLFI

  const { writeContractAsync, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const { allowance: wlfiAllowance } = useErc20Allowance({
    token: WLFI_ADDRESS,
    spender: CookbookAddress,
  });

  // Farm hooks removed for now - no active farms for WLFI yet

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

  const wlfiToken = useMemo<TokenMeta>(() => {
    // Only create new object if values actually changed
    if (
      WLFI_TOKEN.balance === wlfiBalance &&
      WLFI_TOKEN.reserve0 === poolReserves.reserve0 &&
      WLFI_TOKEN.reserve1 === poolReserves.reserve1
    ) {
      return WLFI_TOKEN;
    }
    return {
      ...WLFI_TOKEN,
      balance: wlfiBalance,
      reserve0: poolReserves.reserve0,
      reserve1: poolReserves.reserve1,
    };
  }, [wlfiBalance, poolReserves.reserve0, poolReserves.reserve1]);

  // Set tokens in context when tab changes to add/remove/zap
  useEffect(() => {
    if (activeTab === "add" || activeTab === "remove" || activeTab === "zap") {
      setSellToken(ethToken);
      setBuyToken(wlfiToken);
    }
  }, [activeTab, ethToken, wlfiToken, setSellToken, setBuyToken]);

  // Consolidated data fetching for pool reserves and balances
  useEffect(() => {
    const fetchAllData = async () => {
      if (!publicClient) return;

      try {
        // Batch fetch pool data and balances in parallel
        const promises = [];

        // Pool data
        promises.push(
          publicClient.readContract({
            address: CookbookAddress,
            abi: CookbookAbi,
            functionName: "pools",
            args: [WLFI_POOL_ID],
          }),
        );

        // Balances if address is available
        if (address) {
          promises.push(
            publicClient.readContract({
              address: WLFI_ADDRESS,
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
          const newReserves = {
            reserve0: poolData[0] as bigint, // ETH
            reserve1: poolData[1] as bigint, // WLFI
          };
          console.log("WLFI Pool Reserves - ETH:", formatEther(newReserves.reserve0), "WLFI:", formatUnits(newReserves.reserve1, 18));
          setPoolReserves(newReserves);
        }

        // Update balances if fetched
        if (address && results.length > 1) {
          const wlfiBalance = results[1] as bigint;
          const ethBalance = results[2] as bigint;

          if (wlfiBalance !== undefined) {
            setWlfiBalance(wlfiBalance);
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

  // Calculate market cap and price with memoization
  const { wlfiPrice, wlfiUsdPrice, marketCapUsd } = useMemo(() => {
    const price =
      poolReserves.reserve0 > 0n && poolReserves.reserve1 > 0n
        ? Number(formatEther(poolReserves.reserve0)) / Number(formatUnits(poolReserves.reserve1, 18))
        : 0;

    const usdPrice = price * (ethPrice?.priceUSD || 0);

    // WLFI has a total supply of 100 billion tokens
    const totalSupply = 100000000000n * 10n ** 18n; // 100B tokens with 18 decimals
    const marketCap = usdPrice * Number(formatUnits(totalSupply, 18));

    return { wlfiPrice: price, wlfiUsdPrice: usdPrice, marketCapUsd: marketCap };
  }, [poolReserves.reserve0, poolReserves.reserve1, ethPrice?.priceUSD]);

  // Calculate output based on input
  const calculateOutput = useCallback(
    (value: string, field: "sell" | "buy") => {
      // Check if we have valid input
      if (!value || parseFloat(value) === 0) {
        if (field === "sell") setBuyAmount("");
        else setSellAmount("");
        return;
      }
      
      // Check if pool reserves are loaded (they can be 0n for new pools)
      if (poolReserves.reserve0 === undefined || poolReserves.reserve1 === undefined) {
        console.log("Pool reserves not loaded yet");
        if (field === "sell") setBuyAmount("");
        else setSellAmount("");
        return;
      }

      // Only show insufficient liquidity if pool truly has no reserves
      // Since the pool has reserves, we can calculate swaps
      if (poolReserves.reserve0 === 0n && poolReserves.reserve1 === 0n) {
        console.log("Pool has no liquidity");
        setErrorMessage(t("errors.insufficient_liquidity"));
        if (field === "sell") setBuyAmount("");
        else setSellAmount("");
        return;
      }
      
      // Clear any previous error messages
      setErrorMessage(null);

      try {
        if (field === "sell") {
          // User is editing sell amount
          if (swapDirection === "buy") {
            // Buying WLFI with ETH
            const ethIn = parseEther(value);
            const wlfiOut = getAmountOut(ethIn, poolReserves.reserve0, poolReserves.reserve1, 30n);
            setBuyAmount(formatUnits(wlfiOut, 18));
          } else {
            // Selling WLFI for ETH
            const wlfiIn = parseUnits(value, 18);
            const ethOut = getAmountOut(wlfiIn, poolReserves.reserve1, poolReserves.reserve0, 30n);
            setBuyAmount(formatEther(ethOut));
          }
        } else {
          // User is editing buy amount (exact out)
          if (swapDirection === "buy") {
            // Want exact WLFI out, calculate ETH in
            const wlfiOut = parseUnits(value, 18);
            // For exact out: amountIn = (reserveIn * amountOut * 10000) / ((reserveOut - amountOut) * (10000 - fee))
            // Ensure we don't exceed available reserves
            if (poolReserves.reserve1 > wlfiOut && wlfiOut > 0n) {
              const denominator = (poolReserves.reserve1 - wlfiOut) * 9970n;
              if (denominator > 0n) {
                const ethIn = (poolReserves.reserve0 * wlfiOut * 10000n) / denominator;
                setSellAmount(formatEther(ethIn));
              } else {
                setSellAmount("");
              }
            } else {
              setSellAmount("");
            }
          } else {
            // Want exact ETH out, calculate WLFI in
            const ethOut = parseEther(value);
            // Ensure we don't exceed available reserves
            if (poolReserves.reserve0 > ethOut && ethOut > 0n) {
              const denominator = (poolReserves.reserve0 - ethOut) * 9970n;
              if (denominator > 0n) {
                const wlfiIn = (poolReserves.reserve1 * ethOut * 10000n) / denominator;
                setSellAmount(formatUnits(wlfiIn, 18));
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
    [poolReserves, swapDirection, setBuyAmount, setSellAmount, t],
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
        // Buying WLFI with ETH
        const ethIn = parseEther(sellAmount);
        const wlfiOut = getAmountOut(ethIn, poolReserves.reserve0, poolReserves.reserve1, 30n);
        newReserve0 = poolReserves.reserve0 + ethIn;
        newReserve1 = poolReserves.reserve1 - wlfiOut;
      } else {
        // Selling WLFI for ETH
        const wlfiIn = parseUnits(sellAmount, 18);
        const ethOut = getAmountOut(wlfiIn, poolReserves.reserve1, poolReserves.reserve0, 30n);
        newReserve0 = poolReserves.reserve0 - ethOut;
        newReserve1 = poolReserves.reserve1 + wlfiIn;
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
        // Buy WLFI with ETH
        const ethIn = parseEther(sellAmount);

        // Validate ETH balance
        if (ethBalance < ethIn) {
          setErrorMessage("Insufficient ETH balance");
          return;
        }
        const wlfiOut = getAmountOut(ethIn, poolReserves.reserve0, poolReserves.reserve1, 30n);
        const minOut = withSlippage(wlfiOut, slippageBps);
        const deadline = nowSec() + BigInt(DEADLINE_SEC);

        const hash = await writeContractAsync({
          address: CookbookAddress,
          abi: CookbookAbi,
          functionName: "swapExactIn",
          args: [WLFI_POOL_KEY as any, ethIn, minOut, true, address, deadline],
          value: ethIn,
        });

        setTxHash(hash);
        setSellAmount("");
        setBuyAmount("");
      } else {
        // Sell WLFI for ETH
        const wlfiIn = parseUnits(sellAmount, 18);

        // Validate WLFI balance
        if (wlfiBalance < wlfiIn) {
          setErrorMessage("Insufficient WLFI balance");
          return;
        }

        // Check allowance
        if (!wlfiAllowance || wlfiAllowance < wlfiIn) {
          const approveHash = await writeContractAsync({
            address: WLFI_ADDRESS,
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

        const ethOut = getAmountOut(wlfiIn, poolReserves.reserve1, poolReserves.reserve0, 30n);
        const minOut = withSlippage(ethOut, slippageBps);
        const deadline = nowSec() + BigInt(DEADLINE_SEC);

        const hash = await writeContractAsync({
          address: CookbookAddress,
          abi: CookbookAbi,
          functionName: "swapExactIn",
          args: [WLFI_POOL_KEY as any, wlfiIn, minOut, false, address, deadline],
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
      {/* Header with WLFI theme - amber for light, gold for dark */}
      <div className="mb-4 sm:mb-8 text-center">
        <div className="flex items-center justify-center gap-3">
          <div className="relative">
            <WLFILogo className="w-12 h-12 sm:w-16 sm:h-16" />
            <div className="absolute -inset-1 bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 dark:from-yellow-400 dark:via-yellow-500 dark:to-yellow-600 rounded-full blur-md opacity-30"></div>
          </div>
          <div className="text-left">
            <h1 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 dark:from-yellow-400 dark:via-yellow-500 dark:to-yellow-600 bg-clip-text text-transparent">
              WLFI
            </h1>
            <p className="text-xs sm:text-sm text-amber-600 dark:text-yellow-400/80">World Liberty Financial</p>
          </div>
        </div>
      </div>

      {/* Trading Interface */}
      <div className="bg-white dark:bg-black/90 border border-amber-300 dark:border-yellow-500/30 backdrop-blur-xl rounded-lg p-2 sm:p-4 md:p-6 mb-4 sm:mb-6 md:mb-8 shadow-xl shadow-amber-200/50 dark:shadow-yellow-500/20">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="flex flex-wrap sm:grid sm:grid-cols-5 gap-1 bg-amber-100 dark:bg-yellow-500/10 backdrop-blur-sm p-1 h-auto w-full border border-amber-300 dark:border-yellow-500/20">
            <TabsTrigger
              value="swap"
              className="relative flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm text-amber-700 dark:text-yellow-400/80 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-200 data-[state=active]:to-amber-300 dark:data-[state=active]:from-yellow-500/30 dark:data-[state=active]:to-yellow-600/30 data-[state=active]:text-amber-800 dark:data-[state=active]:text-yellow-400 data-[state=active]:border data-[state=active]:border-amber-400 dark:data-[state=active]:border-yellow-500/50"
            >
              {t("common.swap")}
            </TabsTrigger>
            <TabsTrigger
              value="add"
              className="flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm text-amber-700 dark:text-yellow-400/80 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-200 data-[state=active]:to-amber-300 dark:data-[state=active]:from-yellow-500/30 dark:data-[state=active]:to-yellow-600/30 data-[state=active]:text-amber-800 dark:data-[state=active]:text-yellow-400 data-[state=active]:border data-[state=active]:border-amber-400 dark:data-[state=active]:border-yellow-500/50"
            >
              {t("common.add")}
            </TabsTrigger>
            <TabsTrigger
              value="remove"
              className="flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm text-amber-700 dark:text-yellow-400/80 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-200 data-[state=active]:to-amber-300 dark:data-[state=active]:from-yellow-500/30 dark:data-[state=active]:to-yellow-600/30 data-[state=active]:text-amber-800 dark:data-[state=active]:text-yellow-400 data-[state=active]:border data-[state=active]:border-amber-400 dark:data-[state=active]:border-yellow-500/50"
            >
              {t("common.remove")}
            </TabsTrigger>
            <TabsTrigger
              value="zap"
              className="relative flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm text-amber-700 dark:text-yellow-400/80 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-200 data-[state=active]:to-amber-300 dark:data-[state=active]:from-yellow-500/30 dark:data-[state=active]:to-yellow-600/30 data-[state=active]:text-amber-800 dark:data-[state=active]:text-yellow-400 data-[state=active]:border data-[state=active]:border-amber-400 dark:data-[state=active]:border-yellow-500/50"
            >
              {t("common.zap")}
            </TabsTrigger>
            <TabsTrigger
              value="farm"
              className="flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm text-amber-700 dark:text-yellow-400/80 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-200 data-[state=active]:to-amber-300 dark:data-[state=active]:from-yellow-500/30 dark:data-[state=active]:to-yellow-600/30 data-[state=active]:text-amber-800 dark:data-[state=active]:text-yellow-400 data-[state=active]:border data-[state=active]:border-amber-400 dark:data-[state=active]:border-yellow-500/50"
            >
              {t("common.farm")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="swap" className="mt-2 sm:mt-4">
            <div className="space-y-2 sm:space-y-4">
              {/* Custom simplified swap for WLFI */}
              <div className="relative space-y-1">
                {/* Sell panel */}
                <SwapPanel
                  title={swapDirection === "buy" ? t("ens.you_pay") : t("ens.you_pay")}
                  selectedToken={swapDirection === "buy" ? ethToken : wlfiToken}
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
                      // Max WLFI
                      const formatted = formatUnits(wlfiBalance, 18);
                      setSellAmount(formatted);
                      calculateOutput(formatted, "sell");
                    }
                  }}
                  showPercentageSlider={
                    lastEditedField === "sell" &&
                    ((swapDirection === "buy" && ethBalance > 0n) || (swapDirection === "sell" && wlfiBalance > 0n))
                  }
                  className="pb-2 bg-amber-50 dark:bg-black/50 border-amber-200 dark:border-yellow-500/20"
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
                      className="bg-white dark:bg-black border-2 border-amber-400 dark:border-yellow-500/40 rounded-full p-2 hover:border-amber-500 dark:hover:border-yellow-500/60 transition-all hover:rotate-180 duration-300 hover:bg-amber-100 dark:hover:bg-yellow-500/10"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-amber-600 dark:text-yellow-400"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Buy panel */}
                <SwapPanel
                  title={swapDirection === "buy" ? t("ens.you_receive") : t("ens.you_receive")}
                  selectedToken={swapDirection === "buy" ? wlfiToken : ethToken}
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
                  className="pt-2 bg-amber-50 dark:bg-black/50 border-amber-200 dark:border-yellow-500/20"
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
                      (swapDirection === "sell" && wlfiBalance > 0n && parseUnits(sellAmount || "0", 18) > wlfiBalance)
                    }
                    className="w-full bg-gradient-to-r from-amber-500 to-amber-600 dark:from-yellow-500 dark:to-yellow-600 hover:from-amber-600 hover:to-amber-700 dark:hover:from-yellow-600 dark:hover:to-yellow-700 text-white dark:text-black font-bold shadow-lg shadow-amber-500/30 dark:shadow-yellow-500/30"
                  >
                    {isPending ? (
                      <span className="flex items-center gap-2">
                        <LoadingLogo size="sm" />
                        {swapDirection === "buy" ? "Buying WLFI..." : "Selling WLFI..."}
                      </span>
                    ) : swapDirection === "buy" ? (
                      "Buy WLFI"
                    ) : (
                      "Sell WLFI"
                    )}
                  </Button>
                )}

                {errorMessage && <p className="text-red-500 text-sm">{errorMessage}</p>}
                {isSuccess && <p className="text-green-500 text-sm">Transaction confirmed!</p>}

                {/* Slippage Settings */}
                <div className="mt-4">
                  <SlippageSettings slippageBps={slippageBps} setSlippageBps={setSlippageBps} />
                </div>

                {/* Price impact display */}
                {priceImpact && (
                  <div className="mt-2 p-2 bg-amber-100 dark:bg-yellow-500/10 border border-amber-300 dark:border-yellow-500/20 rounded-md">
                    <div className="text-xs text-amber-700 dark:text-yellow-400/80 flex items-center justify-between">
                      <span>{t("swap.price_impact")}:</span>
                      <span
                        className={`font-medium ${priceImpact.impactPercent > 0 ? "text-green-500" : "text-red-500"}`}
                      >
                        {priceImpact.impactPercent > 0 ? "+" : ""}
                        {priceImpact.impactPercent.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Chart */}
              <div className="mt-4 border-t border-amber-300 dark:border-yellow-500/20 pt-4">
                <div className="relative flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() => setShowPriceChart((prev) => !prev)}
                      className="text-xs text-amber-600 dark:text-yellow-400/60 flex items-center gap-1 hover:text-amber-700 dark:hover:text-yellow-400"
                    >
                      {showPriceChart ? t("coin.hide_chart") : t("coin.show_chart")}
                      <ChevronDownIcon
                        className={`w-3 h-3 transition-transform ${showPriceChart ? "rotate-180" : ""}`}
                      />
                    </button>
                    {showPriceChart && (
                      <div className="text-xs text-amber-600 dark:text-yellow-400/60">WLFI/ETH {t("coin.price_history")}</div>
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
                          poolId={WLFI_POOL_ID.toString()}
                          ticker="WLFI"
                          ethUsdPrice={ethPrice?.priceUSD}
                          priceImpact={priceImpact}
                        />
                      </Suspense>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-xs text-amber-600 dark:text-yellow-400/60 text-center">{t("coin.pool_fee")}: 0.3%</div>

              {/* Market Stats - subtle below chart */}
              <div className="mt-4 sm:mt-6 grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 text-xs">
                <div className="text-center">
                  <p className="text-amber-600 dark:text-yellow-400/60">{t("coin.price")}</p>
                  <p className="font-medium text-amber-700 dark:text-yellow-400">{wlfiPrice > 0 ? `${wlfiPrice.toFixed(8)} ETH` : "-"}</p>
                  <p className="text-amber-500 dark:text-yellow-400/40">${wlfiUsdPrice.toFixed(6)}</p>
                </div>

                <div className="text-center">
                  <p className="text-amber-600 dark:text-yellow-400/60">{t("coin.market_cap")}</p>
                  <p className="font-medium text-amber-700 dark:text-yellow-400">
                    $
                    {marketCapUsd > 1e9
                      ? (marketCapUsd / 1e9).toFixed(2) + "B"
                      : marketCapUsd > 0
                        ? (marketCapUsd / 1e6).toFixed(2) + "M"
                        : "-"}
                  </p>
                </div>

                <div className="text-center">
                  <p className="text-yellow-400/60">{t("coin.pool_eth")}</p>
                  <p className="font-medium text-yellow-400">{formatEther(poolReserves.reserve0)} ETH</p>
                </div>

                <div className="text-center">
                  <p className="text-yellow-400/60">Pool WLFI</p>
                  <p className="font-medium text-yellow-400">{Number(formatUnits(poolReserves.reserve1, 18)).toFixed(0)} WLFI</p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="add" className="mt-2 sm:mt-4">
            <ErrorBoundary
              fallback={<div className="text-center py-4 text-red-500">{t("common.error_loading_component")}</div>}
            >
              <AddLiquidity />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="remove" className="mt-2 sm:mt-4">
            <ErrorBoundary
              fallback={<div className="text-center py-4 text-red-500">{t("common.error_loading_component")}</div>}
            >
              <RemoveLiquidity />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="zap" className="mt-2 sm:mt-4">
            <ErrorBoundary
              fallback={<div className="text-center py-4 text-red-500">{t("common.error_loading_component")}</div>}
            >
              <WLFIZapWrapper />
            </ErrorBoundary>
          </TabsContent>
          <TabsContent value="farm" className="mt-2 sm:mt-4">
            <ErrorBoundary fallback={<div className="text-red-500">{t("common.error_loading_farm")}</div>}>
              <Suspense
                fallback={
                  <div className="h-64 flex items-center justify-center">
                    <LoadingLogo />
                  </div>
                }
              >
                <WlfiFarmTab />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>
        </Tabs>
      </div>

      {/* Info Section with black and gold theme */}
      <div className="mt-6 md:mt-8 bg-black/90 border border-yellow-500/30 backdrop-blur-xl rounded-lg p-4 md:p-6 shadow-2xl shadow-yellow-500/20">
        <h2 className="text-lg md:text-xl font-bold mb-4 bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
          About World Liberty Financial
        </h2>
        <p className="text-yellow-400/70 mb-4">
          World Liberty Financial (WLFI) is a decentralized finance platform focused on financial freedom and accessibility.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 text-sm">
          <div>
            <p className="text-yellow-400/60">{t("coin.total_supply")}</p>
            <p className="font-medium text-yellow-400">100,000,000,000 WLFI</p>
          </div>
          <div>
            <p className="text-yellow-400/60">{t("coin.contract_address")}</p>
            <a
              href={`https://etherscan.io/address/${WLFI_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs break-all text-yellow-400/80 hover:text-yellow-400 transition-colors"
            >
              {WLFI_ADDRESS}
            </a>
          </div>
          <div>
            <p className="text-yellow-400/60">{t("coin.pool_fee")}</p>
            <p className="font-medium text-yellow-400">0.3%</p>
          </div>
          <div>
            <p className="text-yellow-400/60">{t("coin.decimals")}</p>
            <p className="font-medium text-yellow-400">18</p>
          </div>
        </div>
        <a
          href="https://worldlibertyfinancial.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm text-yellow-400/60 hover:text-yellow-400 transition-colors mt-4"
        >
          worldlibertyfinancial.com ↗
        </a>
      </div>
    </div>
  );
};