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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { handleWalletError } from "@/lib/errors";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { LoadingLogo } from "./components/ui/loading-logo";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "./components/ui/hover-card";
import { NetworkError } from "./components/NetworkError";
import { CoinchanAbi, CoinchanAddress } from "./constants/Coinchan";
import { CoinsAbi, CoinsAddress } from "./constants/Coins";
import { ZAMMAbi, ZAMMAddress } from "./constants/ZAAM";
import PoolPriceChart from "@/components/PoolPriceChart";
import { ChevronDownIcon } from "lucide-react";
import { useReserves } from "./hooks/use-reserves";
import { useETHPrice } from "./hooks/use-eth-price";
import { useRequireMainnet } from "./hooks/use-mainnet-check";
import {
  DEADLINE_SEC,
  SWAP_FEE,
  SLIPPAGE_BPS,
  type ZAMMPoolKey,
  computePoolId,
  computePoolKey,
  getAmountOut,
  withSlippage,
} from "./lib/swap";
import { nowSec, formatNumber } from "./lib/utils";
import { PercentageBlobs } from "./components/ui/percentage-blobs";

export const BuySell = ({
  tokenId,
  symbol,
  onPriceImpactChange,
}: {
  tokenId: bigint;
  symbol: string;
  onPriceImpactChange?: (
    impact: {
      currentPrice: number;
      projectedPrice: number;
      impactPercent: number;
      action: "buy" | "sell";
    } | null,
  ) => void;
}) => {
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [swapFee, setSwapFee] = useState<bigint>(SWAP_FEE);
  const [buyPercentage, setBuyPercentage] = useState(0);
  const [showPriceChart, setShowPriceChart] = useState<boolean>(false);
  const [priceImpact, setPriceImpact] = useState<{
    currentPrice: number;
    projectedPrice: number;
    impactPercent: number;
    action: "buy" | "sell";
  } | null>(null);
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

        const [, , , , lockupSwapFee, _deadline] = lockup;

        const customSwapFee =
          lockupSwapFee && lockupSwapFee > 0n ? lockupSwapFee : SWAP_FEE;
        setSwapFee(customSwapFee);
      } catch (err) {
        console.error(
          `BuySell: Failed to fetch lockup info for token ${tokenId.toString()}:`,
          err,
        );
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
        if (!amount || parseFloat(amount) === 0) return "0";
        const ethAmount = parseEther(amount);
        const output = getAmountOut(
          ethAmount,
          reserves.reserve0,
          reserves.reserve1,
          swapFee,
        );
        return formatUnits(output, 18);
      } else {
        if (!amount || parseFloat(amount) === 0) return "0";
        const tokenAmount = parseUnits(amount, 18);
        const output = getAmountOut(
          tokenAmount,
          reserves.reserve1,
          reserves.reserve0,
          swapFee,
        );
        return formatEther(output);
      }
    } catch (e) {
      console.error("Estimate calculation error:", e);
      return "0";
    }
  }, [amount, reserves, swapFee, tab]);

  const usdValue = useMemo(() => {
    if (!ethPrice?.priceUSD) return null;
    const ethAmount =
      tab === "buy" ? parseFloat(amount || "0") : parseFloat(estimated || "0");
    if (isNaN(ethAmount) || ethAmount === 0) return null;
    const usdAmount = ethAmount * ethPrice.priceUSD;
    return usdAmount.toFixed(2);
  }, [amount, estimated, ethPrice, tab]);

  // Updated onBuy function
  const onBuy = useCallback(async () => {
    if (!address || !isReady || !amount) {
      return;
    }

    try {
      setErrorMessage(null);
      const ethAmount = parseEther(amount);
      const minAmountOut = parseEther(estimated);
      const minAmountOutWithSlippage = withSlippage(minAmountOut, SLIPPAGE_BPS);

      const poolKey: ZAMMPoolKey = computePoolKey(
        tokenId,
        swapFee,
        CoinsAddress,
      ) as ZAMMPoolKey;

      // For buying tokens with ETH, we swap ETH (token0) for tokens (token1)
      // zeroForOne = true means we're swapping token0 (ETH) for token1 (tokens)
      const hash = await writeContractAsync({
        address: ZAMMAddress,
        abi: ZAMMAbi,
        functionName: "swapExactIn",
        args: [
          poolKey,
          ethAmount, // amountIn
          minAmountOutWithSlippage, // amountOutMin
          true, // zeroForOne (ETH to tokens)
          address, // to
          nowSec() + BigInt(DEADLINE_SEC), // deadline
        ],
        value: ethAmount,
        chainId: mainnet.id,
      });

      setTxHash(hash);
      setAmount("");
    } catch (error) {
      const message = handleWalletError(error, {
        defaultMessage: "Buy failed",
      });
      setErrorMessage(message);
    }
  }, [
    address,
    isReady,
    amount,
    estimated,
    writeContractAsync,
    tokenId,
    swapFee,
    t,
  ]);

  // Updated onSell function
  const onSell = useCallback(async () => {
    if (!address || !isReady || !amount) {
      return;
    }

    try {
      setErrorMessage(null);
      const tokenAmount = parseEther(amount);
      const minAmountOut = parseEther(estimated);
      const minAmountOutWithSlippage = withSlippage(minAmountOut, SLIPPAGE_BPS);

      const poolKey: ZAMMPoolKey = computePoolKey(
        tokenId,
        swapFee,
        CoinsAddress,
      ) as ZAMMPoolKey;

      // For selling tokens for ETH, we swap tokens (token1) for ETH (token0)
      // zeroForOne = false means we're swapping token1 (tokens) for token0 (ETH)
      const hash = await writeContractAsync({
        address: ZAMMAddress,
        abi: ZAMMAbi,
        functionName: "swapExactIn",
        args: [
          poolKey,
          tokenAmount, // amountIn
          minAmountOutWithSlippage, // amountOutMin
          false, // zeroForOne (tokens to ETH)
          address, // to
          nowSec() + BigInt(DEADLINE_SEC), // deadline
        ],
        chainId: mainnet.id,
      });

      setTxHash(hash);
      setAmount("");
    } catch (error) {
      const message = handleWalletError(error, {
        defaultMessage: "Sell failed",
      });
      setErrorMessage(message);
    }
  }, [
    address,
    isReady,
    amount,
    estimated,
    writeContractAsync,
    tokenId,
    swapFee,
    t,
  ]);

  const handleBuyPercentageChange = useCallback(
    (percentage: number) => {
      setBuyPercentage(percentage);
      if (ethBalance?.value) {
        const percentageValue = (ethBalance.value * BigInt(percentage)) / 100n;
        setAmount(formatEther(percentageValue));
      }
    },
    [ethBalance],
  );

  // Price impact calculation with proper debouncing
  useEffect(() => {
    if (!reserves || !amount || parseFloat(amount) === 0) {
      setPriceImpact(null);
      onPriceImpactChange?.(null);
      return;
    }

    const timer = setTimeout(() => {
      try {
        const reserve0 = reserves.reserve0;
        const reserve1 = reserves.reserve1;

        if (!reserve0 || !reserve1 || reserve0 === 0n || reserve1 === 0n) {
          setPriceImpact(null);
          onPriceImpactChange?.(null);
          return;
        }

        // Current price: ETH per token
        const currentPriceInEth =
          Number(formatEther(reserve0)) / Number(formatUnits(reserve1, 18));

        let newReserve0: bigint, newReserve1: bigint;

        if (tab === "buy") {
          const ethAmount = parseEther(amount);
          const output = getAmountOut(ethAmount, reserve0, reserve1, swapFee);
          newReserve0 = reserve0 + ethAmount;
          newReserve1 = reserve1 - output;
        } else {
          const tokenAmount = parseUnits(amount, 18);
          const output = getAmountOut(tokenAmount, reserve1, reserve0, swapFee);
          newReserve0 = reserve0 - output;
          newReserve1 = reserve1 + tokenAmount;
        }

        // New price after trade
        const newPriceInEth =
          Number(formatEther(newReserve0)) /
          Number(formatUnits(newReserve1, 18));

        // Calculate price impact percentage
        let impactPercent =
          ((newPriceInEth - currentPriceInEth) / currentPriceInEth) * 100;

        // For very small impacts, show a minimal value
        if (Math.abs(impactPercent) < 0.001) {
          // Instead of showing 0, show a very small value
          const adjustedNewPrice =
            tab === "buy"
              ? currentPriceInEth * 1.00001 // Tiny increase for buys
              : currentPriceInEth * 0.99999; // Tiny decrease for sells

          const impact = {
            currentPrice: currentPriceInEth,
            projectedPrice: adjustedNewPrice,
            impactPercent: tab === "buy" ? 0.001 : -0.001,
            action: tab as "buy" | "sell",
          };
          setPriceImpact(impact);
          onPriceImpactChange?.(impact);
          return;
        }

        const impact = {
          currentPrice: currentPriceInEth,
          projectedPrice: newPriceInEth,
          impactPercent,
          action: tab as "buy" | "sell",
        };
        setPriceImpact(impact);
        onPriceImpactChange?.(impact);
      } catch (error) {
        console.error("Error calculating price impact:", error);
        setPriceImpact(null);
        onPriceImpactChange?.(null);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [reserves, amount, swapFee, tab, onPriceImpactChange]);

  if (!isReady) {
    return <NetworkError />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Trading Stats */}
      {reserves && (
        <div className="flex items-center justify-center">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-center">
            {(() => {
              const totalLiquidity = reserves.reserve0;
              const coinReserve = reserves.reserve1;
              const price =
                coinReserve > 0n
                  ? (reserves.reserve0 * 10n ** 18n) / coinReserve
                  : 0n;

              return (
                <>
                  <div className="font-mono text-xs">
                    <span className="text-muted-foreground">
                      {t("common.liquidity")}:{" "}
                    </span>
                    <span className="text-foreground">
                      {formatEther(totalLiquidity).slice(0, 8)} ETH
                    </span>
                  </div>
                  <div className="font-mono text-xs">
                    <span className="text-muted-foreground">
                      {t("common.price")}:{" "}
                    </span>
                    <span className="text-foreground">
                      {formatEther(price).slice(0, 12)} ETH
                    </span>
                  </div>
                  <div className="font-mono text-xs">
                    <span className="text-muted-foreground">
                      {t("common.fee")}:{" "}
                    </span>
                    <span className="text-foreground">
                      {Number(swapFee) / 100}%
                    </span>
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
        <TabsList className="grid grid-cols-2 w-full max-w-md mx-auto">
          <TabsTrigger
            value="buy"
            className="transition-all duration-300 font-semibold"
          >
            Buy {symbol}
          </TabsTrigger>
          <TabsTrigger
            value="sell"
            className="transition-all duration-300 font-semibold"
          >
            Sell {symbol}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="buy" className="w-full max-w-md mx-auto mt-6">
          <div className="space-y-4 p-4 bg-card rounded-lg border border-border">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                You Pay
              </label>
              <div className="relative">
                <Input
                  type="number"
                  placeholder="0.0"
                  value={amount}
                  min="0"
                  step="any"
                  onChange={(e) => setAmount(e.currentTarget.value)}
                  className="pr-16 text-lg font-semibold"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium">
                  ETH
                </span>
              </div>
              {usdValue && parseFloat(amount || "0") > 0 && (
                <span className="text-xs text-muted-foreground block">
                  ≈ ${usdValue} USD
                </span>
              )}
            </div>

            {ethBalance?.value && ethBalance.value > 0n && isConnected ? (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Balance: {formatUnits(ethBalance.value, 18)} ETH</span>
                </div>
                <PercentageBlobs
                  value={buyPercentage}
                  onChange={handleBuyPercentageChange}
                />
              </div>
            ) : null}

            <div className="p-3 bg-secondary/50 rounded-md space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  You Receive
                </span>
                <span className="text-lg font-semibold text-green-600">
                  ~{formatNumber(parseFloat(estimated), 6)} {symbol}
                </span>
              </div>
              {priceImpact && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    Price Impact
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      priceImpact.impactPercent > 5
                        ? "text-yellow-600"
                        : priceImpact.impactPercent > 10
                          ? "text-red-600"
                          : "text-green-600"
                    }`}
                  >
                    {priceImpact.impactPercent > 0 ? "+" : ""}
                    {priceImpact.impactPercent.toFixed(2)}%
                  </span>
                </div>
              )}
            </div>

            <Button
              onClick={onBuy}
              disabled={!isConnected || !isReady || isPending || !amount}
              variant="default"
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold h-12 text-base"
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

        <TabsContent value="sell" className="w-full max-w-md mx-auto mt-6">
          <div className="space-y-4 p-4 bg-card rounded-lg border border-border">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                You Sell
              </label>
              <div className="relative">
                <Input
                  type="number"
                  placeholder="0.0"
                  value={amount}
                  min="0"
                  step="any"
                  onChange={(e) => setAmount(e.currentTarget.value)}
                  className="pr-16 text-lg font-semibold"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium">
                  {symbol}
                </span>
              </div>
              {balance !== undefined && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    Balance: {formatUnits(balance, 18)} {symbol}
                  </span>
                  <button
                    className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                    onClick={() => setAmount(formatUnits(balance, 18))}
                  >
                    MAX
                  </button>
                </div>
              )}
            </div>

            <div className="p-3 bg-secondary/50 rounded-md space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  You Receive
                </span>
                <span className="text-lg font-semibold text-blue-600">
                  ~{formatNumber(parseFloat(estimated), 6)} ETH
                </span>
              </div>
              {usdValue && parseFloat(estimated || "0") > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    USD Value
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ≈ ${usdValue}
                  </span>
                </div>
              )}
              {priceImpact && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    Price Impact
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      Math.abs(priceImpact.impactPercent) > 10
                        ? "text-red-600"
                        : Math.abs(priceImpact.impactPercent) > 5
                          ? "text-yellow-600"
                          : "text-blue-600"
                    }`}
                  >
                    {priceImpact.impactPercent.toFixed(2)}%
                  </span>
                </div>
              )}
            </div>

            <Button
              onClick={onSell}
              disabled={
                !isConnected || !isReady || isPending || !amount || !isOperator
              }
              variant="destructive"
              className="w-full h-12 text-base font-bold text-white"
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

        {errorMessage && (
          <p className="text-destructive text-sm mt-4">{errorMessage}</p>
        )}
        {isSuccess && (
          <p className="text-chart-2 text-sm mt-4">Transaction confirmed!</p>
        )}
      </Tabs>

      {/* Chart Dropdown Section */}
      <div className="mt-6 border-t border-border pt-4">
        <button
          onClick={() => setShowPriceChart((prev) => !prev)}
          className="text-sm text-muted-foreground flex items-center gap-1 hover:text-primary transition-colors mb-3"
        >
          {showPriceChart
            ? t("coin.hide_chart", "Hide Chart")
            : t("coin.show_chart", "Show Chart")}
          <ChevronDownIcon
            className={`w-4 h-4 transition-transform ${showPriceChart ? "rotate-180" : ""}`}
          />
        </button>

        {showPriceChart && (
          <div className="transition-all duration-300 rounded-lg border border-border p-4 bg-card">
            <div className="text-xs text-muted-foreground mb-2">
              {symbol}/ETH {t("coin.price_history", "Price History")}
            </div>
            <PoolPriceChart
              poolId={computePoolId(tokenId, swapFee, CoinsAddress).toString()}
              ticker={symbol}
              priceImpact={priceImpact}
            />
          </div>
        )}
      </div>
    </div>
  );
};
