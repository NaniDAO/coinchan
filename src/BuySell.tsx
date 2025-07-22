import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PercentageSlider } from "@/components/ui/percentage-slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { handleWalletError } from "@/lib/errors";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { LoadingLogo } from "./components/ui/loading-logo";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./components/ui/hover-card";
import { NetworkError } from "./components/NetworkError";
import { CoinchanAbi, CoinchanAddress } from "./constants/Coinchan";
import { CoinsAbi, CoinsAddress } from "./constants/Coins";
import { ZAMMAbi, ZAMMAddress } from "./constants/ZAAM";
import { useReserves } from "./hooks/use-reserves";
import { useETHPrice } from "./hooks/use-eth-price";
import { useRequireMainnet } from "./hooks/use-mainnet-check";
import {
  DEADLINE_SEC,
  SWAP_FEE,
  type ZAMMPoolKey,
  computePoolId,
  computePoolKey,
  getAmountOut,
  withSlippage,
} from "./lib/swap";
import { nowSec, formatNumber } from "./lib/utils";

export const BuySell = ({
  tokenId,
  name,
  symbol,
  onPriceImpactChange,
}: {
  tokenId: bigint;
  name: string;
  symbol: string;
  onPriceImpactChange?: (impact: {
    currentPrice: number;
    projectedPrice: number;
    impactPercent: number;
    action: "buy" | "sell";
  } | null) => void;
}) => {
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [swapFee, setSwapFee] = useState<bigint>(SWAP_FEE);
  const [buyPercentage, setBuyPercentage] = useState(0);
  const { t } = useTranslation();

  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const { isReady } = useRequireMainnet();
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const { data: ethPrice } = useETHPrice();

  // Fetch the lockup info to determine the custom swap fee and owner
  useEffect(() => {
    if (!publicClient || !tokenId) return;

    let isMounted = true;

    const fetchLockupInfo = async () => {
      try {
        const lockup = (await publicClient.readContract({
          address: CoinchanAddress,
          abi: CoinchanAbi,
          functionName: "lockups",
          args: [tokenId],
        })) as readonly [string, number, number, boolean, bigint, bigint];

        if (!isMounted) return;

        const [, , , , , lockupSwapFee] = lockup;

        const customSwapFee = lockupSwapFee && lockupSwapFee > 0n ? lockupSwapFee : SWAP_FEE;
        setSwapFee(customSwapFee);
      } catch (err) {
        console.error(`BuySell: Failed to fetch lockup info for token ${tokenId.toString()}:`, err);
        if (isMounted) {
          setSwapFee(SWAP_FEE);
        }
      }
    };

    fetchLockupInfo();

    return () => {
      isMounted = false;
    };
  }, [publicClient, tokenId, address]);

  // Batch multiple contract reads for better performance
  const { data: contractData } = useReadContracts({
    contracts: address
      ? [
          {
            address: CoinsAddress,
            abi: CoinsAbi,
            functionName: "balanceOf",
            args: [address, tokenId],
          },
          {
            address: CoinsAddress,
            abi: CoinsAbi,
            functionName: "isOperator",
            args: [address, ZAMMAddress],
          },
        ]
      : [],
    allowFailure: false,
  });

  const balance = contractData?.[0];
  const isOperator = contractData?.[1];

  const { data: ethBalance } = useBalance({
    address: address,
  });

  const { data: reserves } = useReserves({
    poolId: computePoolId(tokenId, swapFee, CoinsAddress),
    source: "ZAMM",
  });

  const estimated = useMemo(() => {
    if (!reserves || !reserves.reserve0 || !reserves.reserve1) return "0";
    try {
      if (tab === "buy") {
        // Input: ETH amount -> Output: token amount
        const inWei = parseEther(amount || "0");
        const rawOut = getAmountOut(inWei, reserves.reserve0, reserves.reserve1, swapFee);
        const minOut = withSlippage(rawOut);
        return formatUnits(minOut, 18);
      } else {
        // Input: token amount -> Output: ETH amount
        const inUnits = parseUnits(amount || "0", 18);
        const rawOut = getAmountOut(inUnits, reserves.reserve1, reserves.reserve0, swapFee);
        const minOut = withSlippage(rawOut);
        return formatEther(minOut);
      }
    } catch {
      return "0";
    }
  }, [amount, reserves, tab, swapFee]);

  // Calculate USD values
  const usdValue = useMemo(() => {
    if (!ethPrice?.priceUSD) return null;

    try {
      if (tab === "buy") {
        // When buying, show USD value of ETH input
        const ethAmount = parseFloat(amount || "0");
        return formatNumber(ethAmount * ethPrice.priceUSD, 2);
      } else {
        // When selling, show USD value of ETH output
        const ethAmount = parseFloat(estimated || "0");
        return formatNumber(ethAmount * ethPrice.priceUSD, 2);
      }
    } catch {
      return null;
    }
  }, [amount, estimated, ethPrice, tab]);

  const handleBuyPercentageChange = useCallback(
    (percentage: number) => {
      setBuyPercentage(percentage);

      if (!ethBalance?.value) return;

      const adjustedBalance =
        percentage === 100 ? (ethBalance.value * 99n) / 100n : (ethBalance.value * BigInt(percentage)) / 100n;

      const newAmount = formatEther(adjustedBalance);
      setAmount(newAmount);
    },
    [ethBalance?.value],
  );

  useEffect(() => {
    if (tab !== "buy" || !ethBalance?.value || !amount) {
      setBuyPercentage(0);
      return;
    }

    try {
      const amountWei = parseEther(amount);
      if (ethBalance.value > 0n) {
        const calculatedPercentage = Number((amountWei * 100n) / ethBalance.value);
        setBuyPercentage(Math.min(100, Math.max(0, calculatedPercentage)));
      }
    } catch {
      setBuyPercentage(0);
    }
  }, [amount, ethBalance?.value, tab]);

  // Calculate price impact
  useEffect(() => {
    if (!reserves || !amount || parseFloat(amount) === 0) {
      onPriceImpactChange?.(null);
      return;
    }

    const timer = setTimeout(() => {
      try {
        const reserve0 = reserves.reserve0;
        const reserve1 = reserves.reserve1;
        
        if (reserve0 === 0n || reserve1 === 0n) {
          onPriceImpactChange?.(null);
          return;
        }

        let newReserve0: bigint;
        let newReserve1: bigint;

        if (tab === "buy") {
          // Buying token with ETH
          try {
            const swapAmountEth = parseEther(amount || "0");
            const amountOut = getAmountOut(swapAmountEth, reserve0, reserve1, swapFee);
            
            if (amountOut >= reserve1) {
              // Would drain the pool
              onPriceImpactChange?.(null);
              return;
            }
            
            newReserve0 = reserve0 + swapAmountEth;
            newReserve1 = reserve1 - amountOut;
          } catch (e) {
            console.error("Error calculating buy output:", e);
            onPriceImpactChange?.(null);
            return;
          }
        } else {
          // Selling token for ETH
          try {
            const swapAmountToken = parseUnits(amount || "0", 18);
            const amountOut = getAmountOut(swapAmountToken, reserve1, reserve0, swapFee);
            
            if (amountOut >= reserve0) {
              // Would drain the pool
              onPriceImpactChange?.(null);
              return;
            }
            
            newReserve0 = reserve0 - amountOut;
            newReserve1 = reserve1 + swapAmountToken;
          } catch (e) {
            console.error("Error calculating sell output:", e);
            onPriceImpactChange?.(null);
            return;
          }
        }

        // Calculate prices - ETH per token
        const currentPriceInEth = parseFloat(formatEther(reserve0)) / parseFloat(formatUnits(reserve1, 18));
        const newPriceInEth = parseFloat(formatEther(newReserve0)) / parseFloat(formatUnits(newReserve1, 18));
        
        // For charting: when buying tokens (adding ETH), price goes up; when selling tokens (removing ETH), price goes down
        const ethReserveChange = tab === 'buy' ? 'increase' : 'decrease';
        
        console.log('BuySell price impact calculation:', {
          action: tab,
          ethReserveChange,
          reserve0: formatEther(reserve0),
          reserve1: formatUnits(reserve1, 18),
          newReserve0: formatEther(newReserve0),
          newReserve1: formatUnits(newReserve1, 18),
          currentPriceInEth,
          newPriceInEth,
          priceChange: newPriceInEth > currentPriceInEth ? 'up' : 'down'
        });

        // Validate calculated prices
        if (!isFinite(currentPriceInEth) || !isFinite(newPriceInEth) || newPriceInEth <= 0) {
          console.error("Invalid price calculation");
          onPriceImpactChange?.(null);
          return;
        }

        const impactPercent = ((newPriceInEth - currentPriceInEth) / currentPriceInEth) * 100;

        // Sanity check for extreme impacts
        if (Math.abs(impactPercent) > 90) {
          console.warn(`Extreme price impact detected: ${impactPercent.toFixed(2)}%`);
          onPriceImpactChange?.(null);
          return;
        }

        onPriceImpactChange?.({
          currentPrice: currentPriceInEth,
          projectedPrice: newPriceInEth,
          impactPercent,
          action: tab,
        });
      } catch (error) {
        console.error("Error calculating price impact:", error);
        onPriceImpactChange?.(null);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [amount, tab, reserves, swapFee, onPriceImpactChange]);

  const onBuy = async () => {
    if (!reserves || !address || !isReady) return;

    setErrorMessage(null);

    try {
      const amountInWei = parseEther(amount || "0");
      const rawOut = getAmountOut(amountInWei, reserves.reserve0, reserves.reserve1, swapFee);
      const amountOutMin = withSlippage(rawOut);
      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      const poolKey = computePoolKey(tokenId, swapFee, CoinsAddress) as ZAMMPoolKey;
      const hash = await writeContractAsync({
        address: ZAMMAddress,
        abi: ZAMMAbi,
        functionName: "swapExactIn",
        args: [poolKey, amountInWei, amountOutMin, true, address, deadline],
        value: amountInWei,
      });
      setTxHash(hash);
    } catch (err) {
      const errorMsg = handleWalletError(err, {
        defaultMessage: t("errors.transaction_error"),
      });
      if (errorMsg) {
        setErrorMessage(errorMsg);
      }
    }
  };

  const onSell = async () => {
    if (!reserves || !address || !isReady) return;

    setErrorMessage(null);

    try {
      const amountInUnits = parseUnits(amount || "0", 18);

      if (!isOperator) {
        try {
          await writeContractAsync({
            address: CoinsAddress,
            abi: CoinsAbi,
            functionName: "setOperator",
            args: [ZAMMAddress, true],
          });
        } catch (approvalErr) {
          const errorMsg = handleWalletError(approvalErr, {
            defaultMessage: t("errors.transaction_error"),
          });
          if (errorMsg) {
            setErrorMessage(errorMsg);
          }
          return;
        }
      }

      const rawOut = getAmountOut(amountInUnits, reserves.reserve1, reserves.reserve0, swapFee);
      const amountOutMin = withSlippage(rawOut);
      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      const poolKey = computePoolKey(tokenId, swapFee, CoinsAddress) as ZAMMPoolKey;
      const hash = await writeContractAsync({
        address: ZAMMAddress,
        abi: ZAMMAbi,
        functionName: "swapExactIn",
        args: [poolKey, amountInUnits, amountOutMin, false, address, deadline],
      });
      setTxHash(hash);
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
    <div>
      {/* Network warning */}
      <NetworkError compact />

      {/* Per-unit price information */}
      {reserves && reserves.reserve0 > 0n && reserves.reserve1 > 0n && ethPrice?.priceUSD && (
        <div className="mb-3 p-2 bg-muted/30 rounded-lg text-xs text-muted-foreground">
          <div className="flex flex-col gap-1">
            {(() => {
              const ethAmount = parseFloat(formatEther(reserves.reserve0));
              const tokenAmount = parseFloat(formatUnits(reserves.reserve1, 18));
              const tokenPriceInEth = ethAmount / tokenAmount;
              const ethPriceInToken = tokenAmount / ethAmount;
              const tokenPriceUsd = tokenPriceInEth * ethPrice.priceUSD;
              const totalPoolValueUsd = ethAmount * ethPrice.priceUSD * 2;

              return (
                <>
                  <div className="opacity-90">Pool Value: ${formatNumber(totalPoolValueUsd, 2)} USD</div>
                  <div className="opacity-75">
                    1 ETH = {formatNumber(ethPriceInToken, 6)} {symbol} | 1 {symbol} = {tokenPriceInEth.toFixed(8)} ETH
                    (${tokenPriceUsd.toFixed(8)} USD)
                  </div>
                  <div className="opacity-60 flex items-center gap-1">
                    <span>Fee: {Number(swapFee) / 100}%</span>
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <span className="text-[10px] opacity-70 cursor-help hover:opacity-100 transition-opacity">
                          ⓘ
                        </span>
                      </HoverCardTrigger>
                      <HoverCardContent className="w-auto">
                        <p className="text-sm">{t("common.paid_to_lps")}</p>
                      </HoverCardContent>
                    </HoverCard>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as "buy" | "sell")}>
        <TabsList>
          <TabsTrigger value="buy" className="transition-all duration-300">
            Buy {name} [{symbol}]
          </TabsTrigger>
          <TabsTrigger value="sell" className="transition-all duration-300">
            Sell {name} [{symbol}]
          </TabsTrigger>
        </TabsList>

        <TabsContent value="buy" className="max-w-2xl">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-green-700">Using ETH</span>
            <Input
              type="number"
              placeholder="Amount ETH"
              value={amount}
              min="0"
              step="any"
              onChange={(e) => setAmount(e.currentTarget.value)}
              disabled={false}
            />
            {usdValue && amount && <span className="text-xs text-muted-foreground">≈ ${usdValue} USD</span>}

            {ethBalance?.value && ethBalance.value > 0n && isConnected ? (
              <div className="mt-2 pt-2 border-t border-primary/20">
                <PercentageSlider value={buyPercentage} onChange={handleBuyPercentageChange} />
              </div>
            ) : null}

            <span className="text-sm font-medium text-green-800">
              You will receive ~ {formatNumber(parseFloat(estimated), 6)} {symbol}
            </span>
            <Button
              onClick={onBuy}
              disabled={!isConnected || !isReady || isPending || !amount}
              variant="default"
              className={`bg-green-600 hover:bg-green-700 text-white font-bold transition-opacity duration-300`}
            >
              {isPending ? (
                <span className="flex items-center gap-2">
                  <LoadingLogo size="sm" className="scale-75" />
                  Buying…
                </span>
              ) : (
                `Buy ${symbol}`
              )}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="sell" className="max-w-2xl">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-accent dark:text-accent">Using {symbol}</span>
            <div className="relative">
              <Input
                type="number"
                placeholder={`Amount ${symbol}`}
                value={amount}
                min="0"
                step="any"
                onChange={(e) => setAmount(e.currentTarget.value)}
                disabled={false}
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">
                You will receive ~ {formatNumber(parseFloat(estimated), 6)} ETH
              </span>
              {usdValue && estimated !== "0" && (
                <span className="text-xs text-muted-foreground">≈ ${usdValue} USD</span>
              )}
              {balance !== undefined ? (
                <button
                  className="self-end text-sm font-medium text-chart-2 dark:text-chart-2 hover:text-primary transition-colors"
                  onClick={() => setAmount(formatUnits(balance, 18))}
                  disabled={false}
                >
                  MAX ({formatUnits(balance, 18)})
                </button>
              ) : (
                <button className="self-end text-sm font-medium text-chart-2 dark:text-chart-2" disabled={!balance}>
                  MAX
                </button>
              )}
            </div>
            <Button
              onClick={onSell}
              disabled={!isConnected || !isReady || isPending || !amount}
              variant="outline"
              className={`dark:border-accent dark:text-accent dark:hover:bg-accent/10 transition-opacity duration-300 `}
            >
              {isPending ? (
                <span className="flex items-center gap-2">
                  <LoadingLogo size="sm" className="scale-75" />
                  Selling…
                </span>
              ) : (
                `Sell ${symbol}`
              )}
            </Button>
          </div>
        </TabsContent>

        {errorMessage && <p className="text-destructive text-sm">{errorMessage}</p>}
        {isSuccess && <p className="text-chart-2 text-sm">Tx confirmed!</p>}
      </Tabs>
    </div>
  );
};
