import { useEffect, useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits, parseUnits, parseEther, erc20Abi, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from "wagmi";

import PoolPriceChart from "./components/PoolPriceChart";
import { ConnectMenu } from "./ConnectMenu";
import { useETHPrice } from "./hooks/use-eth-price";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { PercentageSlider } from "./components/ui/percentage-slider";
import { LoadingLogo } from "./components/ui/loading-logo";
import { 
  type TokenMeta, 
  ETH_TOKEN, 
  ENS_TOKEN, 
  ENS_POOL_ID, 
  ENS_ADDRESS,
  ENS_POOL_KEY 
} from "./lib/coins";
import { CookbookAbi, CookbookAddress } from "./constants/Cookbook";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { AddLiquidity } from "./AddLiquidity";
import { RemoveLiquidity } from "./RemoveLiquidity";
import { SingleEthLiquidity } from "./SingleEthLiquidity";
import { useTokenSelection } from "./contexts/TokenSelectionContext";
import { getAmountOut, withSlippage, DEADLINE_SEC } from "./lib/swap";
import { handleWalletError } from "./lib/errors";
import { nowSec, formatNumber } from "./lib/utils";
import { useErc20Allowance } from "./hooks/use-erc20-allowance";

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
  const [activeTab, setActiveTab] = useState<"swap" | "add" | "remove" | "zap">("swap");
  const [priceImpact, setPriceImpact] = useState<{
    currentPrice: number;
    projectedPrice: number;
    impactPercent: number;
    action: "buy" | "sell";
  } | null>(null);
  
  // Swap state
  const [swapTab, setSwapTab] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [buyPercentage, setBuyPercentage] = useState(0);
  
  const { writeContractAsync, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const { allowance: ensAllowance } = useErc20Allowance({
    token: ENS_ADDRESS,
    spender: CookbookAddress,
  });
  
  // Create token metadata objects with poolKey
  const ethToken = useMemo<TokenMeta>(() => ({
    ...ETH_TOKEN,
    balance: 0n, // Will be updated by SwapAction
  }), []);

  const ensToken = useMemo<TokenMeta>(() => ({
    ...ENS_TOKEN,
    balance: ensBalance,
    reserve0: poolReserves.reserve0,
    reserve1: poolReserves.reserve1,
  }), [ensBalance, poolReserves.reserve0, poolReserves.reserve1]);

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
        const poolData = await publicClient.readContract({
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

  // Fetch ENS balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (!publicClient || !address) return;
      
      try {
        const balance = await publicClient.readContract({
          address: ENS_ADDRESS,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        });
        
        setEnsBalance(balance as bigint);
      } catch (error) {
        console.error("Failed to fetch ENS balance:", error);
      }
    };

    fetchBalance();
    // Refresh balance every 30 seconds
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [publicClient, address]);

  // Calculate market cap and price
  const ensPrice = poolReserves.reserve0 > 0n && poolReserves.reserve1 > 0n
    ? Number(formatEther(poolReserves.reserve0)) / Number(formatUnits(poolReserves.reserve1, 18))
    : 0;
  
  const ensUsdPrice = ensPrice * (ethPrice?.priceUSD || 0);
  
  // ENS has a total supply of 100M tokens
  const totalSupply = parseUnits("100000000", 18);
  const marketCapUsd = ensUsdPrice * Number(formatUnits(totalSupply, 18));
  
  // Calculate estimated output
  const estimated = useMemo(() => {
    if (!poolReserves.reserve0 || !poolReserves.reserve1 || !amount) return "0";
    try {
      if (swapTab === "buy") {
        // Buying ENS with ETH
        const inWei = parseEther(amount || "0");
        const rawOut = getAmountOut(inWei, poolReserves.reserve0, poolReserves.reserve1, 30n);
        const minOut = withSlippage(rawOut);
        return formatUnits(minOut, 18);
      } else {
        // Selling ENS for ETH
        const inUnits = parseUnits(amount || "0", 18);
        const rawOut = getAmountOut(inUnits, poolReserves.reserve1, poolReserves.reserve0, 30n);
        const minOut = withSlippage(rawOut);
        return formatEther(minOut);
      }
    } catch {
      return "0";
    }
  }, [amount, poolReserves, swapTab]);
  
  // Calculate price impact for chart preview
  useEffect(() => {
    if (!poolReserves.reserve0 || !poolReserves.reserve1 || !amount || parseFloat(amount) <= 0) {
      setPriceImpact(null);
      return;
    }
    
    const timer = setTimeout(() => {
      try {
        let newReserve0 = poolReserves.reserve0;
        let newReserve1 = poolReserves.reserve1;
        
        if (swapTab === "buy") {
          // Buying ENS with ETH
          try {
            const swapAmountEth = parseEther(amount || "0");
            const amountOut = getAmountOut(swapAmountEth, poolReserves.reserve0, poolReserves.reserve1, 30n);
            
            if (amountOut >= poolReserves.reserve1) {
              setPriceImpact(null);
              return;
            }
            
            newReserve0 = poolReserves.reserve0 + swapAmountEth;
            newReserve1 = poolReserves.reserve1 - amountOut;
          } catch (e) {
            console.error("Error calculating buy output:", e);
            setPriceImpact(null);
            return;
          }
        } else {
          // Selling ENS for ETH
          try {
            const swapAmountEns = parseUnits(amount || "0", 18);
            const amountOut = getAmountOut(swapAmountEns, poolReserves.reserve1, poolReserves.reserve0, 30n);
            
            if (amountOut >= poolReserves.reserve0) {
              setPriceImpact(null);
              return;
            }
            
            newReserve0 = poolReserves.reserve0 - amountOut;
            newReserve1 = poolReserves.reserve1 + swapAmountEns;
          } catch (e) {
            console.error("Error calculating sell output:", e);
            setPriceImpact(null);
            return;
          }
        }
        
        // Calculate prices - ETH per ENS token
        const currentPriceInEth = Number(formatEther(poolReserves.reserve0)) / Number(formatUnits(poolReserves.reserve1, 18));
        const newPriceInEth = Number(formatEther(newReserve0)) / Number(formatUnits(newReserve1, 18));
        
        if (!isFinite(currentPriceInEth) || !isFinite(newPriceInEth) || newPriceInEth <= 0) {
          setPriceImpact(null);
          return;
        }
        
        const impactPercent = ((newPriceInEth - currentPriceInEth) / currentPriceInEth) * 100;
        
        // Sanity check
        if (Math.abs(impactPercent) > 90) {
          setPriceImpact(null);
          return;
        }
        
        setPriceImpact({
          currentPrice: currentPriceInEth,
          projectedPrice: newPriceInEth,
          impactPercent,
          action: swapTab,
        });
      } catch (error) {
        console.error("Error calculating price impact:", error);
        setPriceImpact(null);
      }
    }, 500); // 500ms debounce
    
    return () => clearTimeout(timer);
  }, [amount, swapTab, poolReserves]);
  
  // Handle percentage slider for buy
  const handleBuyPercentageChange = useCallback(async (percentage: number) => {
    setBuyPercentage(percentage);
    
    if (!publicClient || !address) return;
    
    try {
      const balance = await publicClient.getBalance({ address });
      if (!balance) return;
      
      const adjustedBalance = percentage === 100 
        ? (balance * 99n) / 100n  // Leave some for gas
        : (balance * BigInt(percentage)) / 100n;
      
      const newAmount = formatEther(adjustedBalance);
      setAmount(newAmount);
    } catch (error) {
      console.error("Failed to get ETH balance:", error);
    }
  }, [address, publicClient]);
  
  // Buy ENS with ETH
  const onBuy = async () => {
    if (!poolReserves || !address || !amount) return;
    
    setErrorMessage(null);
    
    try {
      const amountInWei = parseEther(amount || "0");
      const rawOut = getAmountOut(amountInWei, poolReserves.reserve0, poolReserves.reserve1, 30n);
      const amountOutMin = withSlippage(rawOut);
      const deadline = nowSec() + BigInt(DEADLINE_SEC);
      
      const hash = await writeContractAsync({
        address: CookbookAddress,
        abi: CookbookAbi,
        functionName: "swapExactIn",
        args: [ENS_POOL_KEY as any, amountInWei, amountOutMin, true, address, deadline],
        value: amountInWei,
      });
      
      setTxHash(hash);
      setAmount("");
    } catch (err) {
      const errorMsg = handleWalletError(err, {
        defaultMessage: t("errors.transaction_error"),
      });
      if (errorMsg) {
        setErrorMessage(errorMsg);
      }
    }
  };
  
  // Sell ENS for ETH
  const onSell = async () => {
    if (!poolReserves || !address || !amount) return;
    
    setErrorMessage(null);
    
    try {
      const amountInUnits = parseUnits(amount || "0", 18);
      
      // Check and set allowance if needed
      if (!ensAllowance || ensAllowance < amountInUnits) {
        const approveHash = await writeContractAsync({
          address: ENS_ADDRESS,
          abi: erc20Abi,
          functionName: "approve",
          args: [CookbookAddress, maxUint256],
        });
        
        // Wait for approval
        await publicClient?.waitForTransactionReceipt({ hash: approveHash });
      }
      
      const rawOut = getAmountOut(amountInUnits, poolReserves.reserve1, poolReserves.reserve0, 30n);
      const amountOutMin = withSlippage(rawOut);
      const deadline = nowSec() + BigInt(DEADLINE_SEC);
      
      const hash = await writeContractAsync({
        address: CookbookAddress,
        abi: CookbookAbi,
        functionName: "swapExactIn",
        args: [ENS_POOL_KEY as any, amountInUnits, amountOutMin, false, address, deadline],
      });
      
      setTxHash(hash);
      setAmount("");
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
    <div className="container mx-auto max-w-2xl px-4 py-8">
      {/* Header with ENS theme */}
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <svg width="48" height="48" viewBox="0 0 202 231" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M98.3592 2.80337L34.8353 107.327C34.3371 108.147 33.1797 108.238 32.5617 107.505C26.9693 100.864 6.13478 72.615 31.9154 46.8673C55.4403 23.3726 85.4045 6.62129 96.5096 0.831705C97.7695 0.174847 99.0966 1.59007 98.3592 2.80337Z" fill="#0080BC"/>
            <path d="M94.8459 230.385C96.1137 231.273 97.6758 229.759 96.8261 228.467C82.6374 206.886 35.4713 135.081 28.9559 124.302C22.5295 113.67 9.88976 96.001 8.83534 80.8842C8.7301 79.3751 6.64332 79.0687 6.11838 80.4879C5.27178 82.7767 4.37045 85.5085 3.53042 88.6292C-7.07427 128.023 8.32698 169.826 41.7753 193.238L94.8459 230.386V230.385Z" fill="#0080BC"/>
            <path d="M103.571 228.526L167.095 124.003C167.593 123.183 168.751 123.092 169.369 123.825C174.961 130.465 195.796 158.715 170.015 184.463C146.49 207.957 116.526 224.709 105.421 230.498C104.161 231.155 102.834 229.74 103.571 228.526Z" fill="#0080BC"/>
            <path d="M107.154 0.930762C105.886 0.0433954 104.324 1.5567 105.174 2.84902C119.363 24.4301 166.529 96.2354 173.044 107.014C179.471 117.646 192.11 135.315 193.165 150.432C193.27 151.941 195.357 152.247 195.882 150.828C196.728 148.539 197.63 145.808 198.47 142.687C209.074 103.293 193.673 61.4905 160.225 38.078L107.154 0.930762Z" fill="#0080BC"/>
          </svg>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-[#0080BC] to-[#0066CC] bg-clip-text text-transparent">
            {t("ens.title")}
          </h1>
        </div>
        <p className="text-muted-foreground">
          {t("ens.description")}
        </p>
      </div>

      {/* Market Stats with ENS theme */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-card border border-[#0080BC]/20 dark:border-[#0080BC]/10 rounded-lg p-4 text-center hover:border-[#0080BC]/40 dark:hover:border-[#0080BC]/20 transition-colors">
          <p className="text-sm text-muted-foreground">{t("coin.price")}</p>
          <p className="text-xl font-bold text-[#0080BC] dark:text-[#5BA0CC]">
            {ensPrice > 0 ? `${ensPrice.toFixed(6)} ETH` : "-"}
          </p>
          <p className="text-sm text-muted-foreground">
            ${ensUsdPrice.toFixed(2)}
          </p>
        </div>
        
        <div className="bg-card border border-[#0080BC]/20 dark:border-[#0080BC]/10 rounded-lg p-4 text-center hover:border-[#0080BC]/40 dark:hover:border-[#0080BC]/20 transition-colors">
          <p className="text-sm text-muted-foreground">{t("coin.market_cap")}</p>
          <p className="text-xl font-bold text-[#0080BC] dark:text-[#5BA0CC]">
            ${marketCapUsd > 0 ? (marketCapUsd / 1e6).toFixed(2) + "M" : "-"}
          </p>
        </div>
        
        <div className="bg-card border border-[#0080BC]/20 dark:border-[#0080BC]/10 rounded-lg p-4 text-center hover:border-[#0080BC]/40 dark:hover:border-[#0080BC]/20 transition-colors">
          <p className="text-sm text-muted-foreground">{t("coin.pool_eth")}</p>
          <p className="text-xl font-bold">
            {formatEther(poolReserves.reserve0)} ETH
          </p>
        </div>
        
        <div className="bg-card border border-[#0080BC]/20 dark:border-[#0080BC]/10 rounded-lg p-4 text-center hover:border-[#0080BC]/40 dark:hover:border-[#0080BC]/20 transition-colors">
          <p className="text-sm text-muted-foreground">{t("coin.pool_ens")}</p>
          <p className="text-xl font-bold">
            {Number(formatUnits(poolReserves.reserve1, 18)).toLocaleString()} ENS
          </p>
        </div>
      </div>

      {/* Trading Interface with ENS theme */}
      <div className="bg-card border border-[#0080BC]/20 dark:border-[#0080BC]/10 rounded-lg p-6 mb-8">
        {!isConnected ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              {t("common.connect_wallet_to_trade")}
            </p>
            <ConnectMenu />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="grid w-full grid-cols-4 bg-[#0080BC]/5 dark:bg-[#0080BC]/10">
              <TabsTrigger value="swap" className="data-[state=active]:bg-[#0080BC]/20 dark:data-[state=active]:bg-[#0080BC]/30 data-[state=active]:text-[#0080BC] dark:data-[state=active]:text-white">{t("common.swap")}</TabsTrigger>
              <TabsTrigger value="add" className="data-[state=active]:bg-[#0080BC]/20 dark:data-[state=active]:bg-[#0080BC]/30 data-[state=active]:text-[#0080BC] dark:data-[state=active]:text-white">{t("common.add")}</TabsTrigger>
              <TabsTrigger value="remove" className="data-[state=active]:bg-[#0080BC]/20 dark:data-[state=active]:bg-[#0080BC]/30 data-[state=active]:text-[#0080BC] dark:data-[state=active]:text-white">{t("common.remove")}</TabsTrigger>
              <TabsTrigger value="zap" className="data-[state=active]:bg-[#0080BC]/20 dark:data-[state=active]:bg-[#0080BC]/30 data-[state=active]:text-[#0080BC] dark:data-[state=active]:text-white">{t("common.zap")}</TabsTrigger>
            </TabsList>
            
            <TabsContent value="swap" className="mt-4">
              <Tabs value={swapTab} onValueChange={(v) => setSwapTab(v as "buy" | "sell")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="buy" className="data-[state=active]:bg-[#0080BC]/20 dark:data-[state=active]:bg-[#0080BC]/30">
                    {t("ens.buy_ens")}
                  </TabsTrigger>
                  <TabsTrigger value="sell" className="data-[state=active]:bg-[#0080BC]/20 dark:data-[state=active]:bg-[#0080BC]/30">
                    {t("ens.sell_ens")}
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="buy" className="mt-4">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">{t("ens.you_pay")} (ETH)</label>
                      <Input
                        type="number"
                        placeholder="0.0"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="mt-1"
                      />
                      <PercentageSlider 
                        value={buyPercentage} 
                        onChange={handleBuyPercentageChange}
                        className="mt-2"
                      />
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">{t("ens.you_receive")} (ENS)</label>
                      <div className="p-3 bg-muted rounded-md">
                        <span className="text-lg font-semibold">{formatNumber(parseFloat(estimated), 6)} ENS</span>
                        {priceImpact && (
                          <span className={`ml-2 text-sm ${priceImpact.impactPercent > 0 ? "text-green-600" : "text-red-600"}`}>
                            {priceImpact.impactPercent > 0 ? "+" : ""}{priceImpact.impactPercent.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <Button 
                      onClick={onBuy}
                      disabled={!isConnected || isPending || !amount || parseFloat(amount) === 0}
                      className="w-full bg-[#0080BC] hover:bg-[#0066CC] text-white"
                    >
                      {isPending ? (
                        <span className="flex items-center gap-2">
                          <LoadingLogo size="sm" />
                          {t("ens.buying")}
                        </span>
                      ) : (
                        t("ens.buy_ens")
                      )}
                    </Button>
                  </div>
                </TabsContent>
                
                <TabsContent value="sell" className="mt-4">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">{t("ens.you_pay")} (ENS)</label>
                      <Input
                        type="number"
                        placeholder="0.0"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="mt-1"
                      />
                      {ensBalance > 0n && (
                        <button
                          onClick={() => setAmount(formatUnits(ensBalance, 18))}
                          className="text-sm text-[#0080BC] hover:underline mt-1"
                        >
                          {t("ens.max")}: {formatNumber(parseFloat(formatUnits(ensBalance, 18)), 6)} ENS
                        </button>
                      )}
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">{t("ens.you_receive")} (ETH)</label>
                      <div className="p-3 bg-muted rounded-md">
                        <span className="text-lg font-semibold">{formatNumber(parseFloat(estimated), 6)} ETH</span>
                        {priceImpact && (
                          <span className={`ml-2 text-sm ${priceImpact.impactPercent > 0 ? "text-green-600" : "text-red-600"}`}>
                            {priceImpact.impactPercent > 0 ? "+" : ""}{priceImpact.impactPercent.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <Button 
                      onClick={onSell}
                      disabled={!isConnected || isPending || !amount || parseFloat(amount) === 0}
                      className="w-full bg-[#0080BC] hover:bg-[#0066CC] text-white"
                    >
                      {isPending ? (
                        <span className="flex items-center gap-2">
                          <LoadingLogo size="sm" />
                          {t("ens.selling")}
                        </span>
                      ) : (
                        t("ens.sell_ens")
                      )}
                    </Button>
                  </div>
                </TabsContent>
                
                {errorMessage && (
                  <p className="text-destructive text-sm mt-2">{errorMessage}</p>
                )}
                {isSuccess && (
                  <p className="text-green-600 text-sm mt-2">{t("ens.transaction_confirmed")}</p>
                )}
              </Tabs>
            </TabsContent>
            
            <TabsContent value="add" className="mt-4">
              <AddLiquidity />
            </TabsContent>
            
            <TabsContent value="remove" className="mt-4">
              <RemoveLiquidity />
            </TabsContent>
            
            <TabsContent value="zap" className="mt-4">
              <SingleEthLiquidity />
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Price Chart with ENS theme */}
      <div className="bg-card border border-[#0080BC]/20 dark:border-[#0080BC]/10 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4 text-[#0080BC] dark:text-[#5BA0CC]">{t("ens.price_chart")}</h2>
        <div className="h-[400px]">
          <PoolPriceChart
            poolId={ENS_POOL_ID.toString()}
            ticker="ENS"
            ethUsdPrice={ethPrice?.priceUSD}
            priceImpact={priceImpact}
          />
        </div>
      </div>

      {/* Info Section with ENS theme */}
      <div className="mt-8 bg-card border border-[#0080BC]/20 dark:border-[#0080BC]/10 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4 text-[#0080BC] dark:text-[#5BA0CC]">{t("ens.about_title")}</h2>
        <p className="text-muted-foreground mb-4">
          {t("ens.about_description")}
        </p>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">{t("coin.total_supply")}</p>
            <p className="font-medium">100,000,000 ENS</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("coin.contract_address")}</p>
            <p className="font-mono text-xs break-all">{ENS_ADDRESS}</p>
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