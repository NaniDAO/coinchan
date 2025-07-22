import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits, erc20Abi } from "viem";
import { mainnet } from "viem/chains";
import { useAccount, usePublicClient } from "wagmi";

import PoolPriceChart from "./components/PoolPriceChart";
import { ConnectMenu } from "./ConnectMenu";
import { useETHPrice } from "./hooks/use-eth-price";
import { SwapAction } from "./SwapAction";
import { 
  type TokenMeta, 
  ETH_TOKEN, 
  ENS_TOKEN, 
  ENS_POOL_ID, 
  ENS_ADDRESS
} from "./lib/coins";
import { CookbookAbi, CookbookAddress } from "./constants/Cookbook";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { AddLiquidity } from "./AddLiquidity";
import { RemoveLiquidity } from "./RemoveLiquidity";
import { SingleEthLiquidity } from "./SingleEthLiquidity";
import { useTokenSelection } from "./contexts/TokenSelectionContext";

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
  
  // Create token metadata objects for liquidity operations
  const ethToken = useMemo<TokenMeta>(() => ({
    ...ETH_TOKEN,
    balance: 0n, // Will be updated by liquidity components
  }), []);

  const ensToken = useMemo<TokenMeta>(() => ({
    ...ENS_TOKEN,
    balance: ensBalance,
    reserve0: poolReserves.reserve0,
    reserve1: poolReserves.reserve1,
  }), [ensBalance, poolReserves.reserve0, poolReserves.reserve1]);
  
  // Create locked tokens for SwapAction
  const lockedTokens = useMemo(() => ({
    sellToken: ETH_TOKEN,
    buyToken: ensToken,
  }), [ensToken]);

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
  
  // ENS has a total supply of 100M tokens (hardcoded for performance)
  const totalSupply = 100000000n * 10n ** 18n; // 100M tokens with 18 decimals
  const marketCapUsd = ensUsdPrice * Number(formatUnits(totalSupply, 18));

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      {/* Header with ENS theme */}
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-3">
          <svg width="48" height="48" viewBox="0 0 202 231" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M98.3592 2.80337L34.8353 107.327C34.3371 108.147 33.1797 108.238 32.5617 107.505C26.9693 100.864 6.13478 72.615 31.9154 46.8673C55.4403 23.3726 85.4045 6.62129 96.5096 0.831705C97.7695 0.174847 99.0966 1.59007 98.3592 2.80337Z" fill="#0080BC"/>
            <path d="M94.8459 230.385C96.1137 231.273 97.6758 229.759 96.8261 228.467C82.6374 206.886 35.4713 135.081 28.9559 124.302C22.5295 113.67 9.88976 96.001 8.83534 80.8842C8.7301 79.3751 6.64332 79.0687 6.11838 80.4879C5.27178 82.7767 4.37045 85.5085 3.53042 88.6292C-7.07427 128.023 8.32698 169.826 41.7753 193.238L94.8459 230.386V230.385Z" fill="#0080BC"/>
            <path d="M103.571 228.526L167.095 124.003C167.593 123.183 168.751 123.092 169.369 123.825C174.961 130.465 195.796 158.715 170.015 184.463C146.49 207.957 116.526 224.709 105.421 230.498C104.161 231.155 102.834 229.74 103.571 228.526Z" fill="#0080BC"/>
            <path d="M107.154 0.930762C105.886 0.0433954 104.324 1.5567 105.174 2.84902C119.363 24.4301 166.529 96.2354 173.044 107.014C179.471 117.646 192.11 135.315 193.165 150.432C193.27 151.941 195.357 152.247 195.882 150.828C196.728 148.539 197.63 145.808 198.47 142.687C209.074 103.293 193.673 61.4905 160.225 38.078L107.154 0.930762Z" fill="#0080BC"/>
          </svg>
        </div>
      </div>

      {/* Market Stats with ENS theme */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-6 md:mb-8">
        <div className="bg-card border border-[#0080BC]/20 dark:border-[#0080BC]/10 rounded-lg p-3 md:p-4 text-center hover:border-[#0080BC]/40 dark:hover:border-[#0080BC]/20 transition-colors">
          <p className="text-xs md:text-sm text-muted-foreground">{t("coin.price")}</p>
          <p className="text-lg md:text-xl font-bold text-[#0080BC] dark:text-[#5BA0CC]">
            {ensPrice > 0 ? `${ensPrice.toFixed(6)} ETH` : "-"}
          </p>
          <p className="text-xs md:text-sm text-muted-foreground">
            ${ensUsdPrice.toFixed(2)}
          </p>
        </div>
        
        <div className="bg-card border border-[#0080BC]/20 dark:border-[#0080BC]/10 rounded-lg p-3 md:p-4 text-center hover:border-[#0080BC]/40 dark:hover:border-[#0080BC]/20 transition-colors">
          <p className="text-xs md:text-sm text-muted-foreground">{t("coin.market_cap")}</p>
          <p className="text-lg md:text-xl font-bold text-[#0080BC] dark:text-[#5BA0CC]">
            ${marketCapUsd > 0 ? (marketCapUsd / 1e6).toFixed(2) + "M" : "-"}
          </p>
        </div>
        
        <div className="bg-card border border-[#0080BC]/20 dark:border-[#0080BC]/10 rounded-lg p-3 md:p-4 text-center hover:border-[#0080BC]/40 dark:hover:border-[#0080BC]/20 transition-colors">
          <p className="text-xs md:text-sm text-muted-foreground">{t("coin.pool_eth")}</p>
          <p className="text-lg md:text-xl font-bold">
            {formatEther(poolReserves.reserve0)} ETH
          </p>
        </div>
        
        <div className="bg-card border border-[#0080BC]/20 dark:border-[#0080BC]/10 rounded-lg p-3 md:p-4 text-center hover:border-[#0080BC]/40 dark:hover:border-[#0080BC]/20 transition-colors">
          <p className="text-xs md:text-sm text-muted-foreground">{t("coin.pool_ens")}</p>
          <p className="text-lg md:text-xl font-bold">
            {Number(formatUnits(poolReserves.reserve1, 18)).toLocaleString()} ENS
          </p>
        </div>
      </div>

      {/* Trading Interface with ENS theme */}
      <div className="bg-card border border-[#0080BC]/20 dark:border-[#0080BC]/10 rounded-lg p-4 md:p-6 mb-6 md:mb-8">
        {!isConnected ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              {t("common.connect_wallet_to_trade")}
            </p>
            <ConnectMenu />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 gap-1 bg-[#0080BC]/5 dark:bg-[#0080BC]/10">
              <TabsTrigger value="swap" className="data-[state=active]:bg-[#0080BC]/20 dark:data-[state=active]:bg-[#0080BC]/30 data-[state=active]:text-[#0080BC] dark:data-[state=active]:text-white">{t("common.swap")}</TabsTrigger>
              <TabsTrigger value="add" className="data-[state=active]:bg-[#0080BC]/20 dark:data-[state=active]:bg-[#0080BC]/30 data-[state=active]:text-[#0080BC] dark:data-[state=active]:text-white">{t("common.add")}</TabsTrigger>
              <TabsTrigger value="remove" className="data-[state=active]:bg-[#0080BC]/20 dark:data-[state=active]:bg-[#0080BC]/30 data-[state=active]:text-[#0080BC] dark:data-[state=active]:text-white">{t("common.remove")}</TabsTrigger>
              <TabsTrigger value="zap" className="data-[state=active]:bg-[#0080BC]/20 dark:data-[state=active]:bg-[#0080BC]/30 data-[state=active]:text-[#0080BC] dark:data-[state=active]:text-white">{t("common.zap")}</TabsTrigger>
            </TabsList>
            
            <TabsContent value="swap" className="mt-4">
              <SwapAction lockedTokens={lockedTokens} />
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
        <h2 className="text-lg md:text-xl font-semibold mb-4 text-[#0080BC] dark:text-[#5BA0CC]">{t("ens.price_chart")}</h2>
        <div className="h-[300px] md:h-[400px]">
          <PoolPriceChart
            poolId={ENS_POOL_ID.toString()}
            ticker="ENS"
            ethUsdPrice={ethPrice?.priceUSD}
          />
        </div>
      </div>

      {/* Info Section with ENS theme */}
      <div className="mt-6 md:mt-8 bg-card border border-[#0080BC]/20 dark:border-[#0080BC]/10 rounded-lg p-4 md:p-6">
        <h2 className="text-lg md:text-xl font-semibold mb-4 text-[#0080BC] dark:text-[#5BA0CC]">{t("ens.about_title")}</h2>
        <p className="text-muted-foreground mb-4">
          {t("ens.about_description")}
        </p>
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