import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PercentageSlider } from "@/components/ui/percentage-slider";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { ZAMMLaunchAbi, ZAMMLaunchAddress } from "@/constants/ZAMMLaunch";
import { useReserves } from "@/hooks/use-reserves";
import { useETHPrice } from "@/hooks/use-eth-price";
import { handleWalletError, isUserRejectionError } from "@/lib/errors";
import {
  type CookbookPoolKey,
  DEADLINE_SEC,
  SWAP_FEE,
  computePoolId,
  computePoolKey,
  getAmountOut,
  withSlippage,
} from "@/lib/swap";
import { nowSec, formatNumber } from "@/lib/utils";
import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { useAccount, useBalance, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

export const BuySellCookbookCoin = ({
  coinId,
  symbol,
}: {
  coinId: bigint;
  symbol: string;
}) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [percentage, setPercentage] = useState(0);

  const poolId = useMemo(() => computePoolId(coinId, SWAP_FEE, CookbookAddress), [coinId]);

  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const { data: ethPrice } = useETHPrice();
  const { data: reserves } = useReserves({
    poolId,
    source: "COOKBOOK",
  });
  const { data: ethBalance } = useBalance({
    address: address,
    chainId: mainnet.id,
  });
  const { data: coinBalance } = useReadContract({
    address: CookbookAddress,
    abi: CookbookAbi,
    functionName: "balanceOf",
    args: address ? [address, coinId] : undefined,
    chainId: mainnet.id,
  });

  // Get user's launchpad balance for claiming
  const { data: launchpadBalance } = useReadContract({
    address: ZAMMLaunchAddress,
    abi: ZAMMLaunchAbi,
    functionName: "balances",
    args: address ? [coinId, address] : undefined,
    chainId: mainnet.id,
  });

  // Check if sale is actually finalized on-chain by reading the contract directly
  const { data: saleData } = useReadContract({
    address: ZAMMLaunchAddress,
    abi: ZAMMLaunchAbi,
    functionName: "sales",
    args: [coinId],
    chainId: mainnet.id,
  });

  // Check if claim is available (sale finalized on-chain and user has balance)
  const canClaim = useMemo(() => {
    // Sale is finalized when creator is address(0) in contract
    const isFinalized = saleData && saleData[0] === "0x0000000000000000000000000000000000000000";
    return isFinalized && launchpadBalance && BigInt(launchpadBalance.toString()) > 0n;
  }, [saleData, launchpadBalance]);

  const claimableAmount = launchpadBalance ? formatUnits(BigInt(launchpadBalance.toString()), 18) : "0";

  const estimated = useMemo(() => {
    if (!reserves || !reserves.reserve0 || !reserves.reserve1) return "0";
    try {
      if (tab === "buy") {
        // Input: ETH amount -> Output: token amount
        const inWei = parseEther(amount || "0");
        const rawOut = getAmountOut(inWei, reserves.reserve0, reserves.reserve1, SWAP_FEE);
        const minOut = withSlippage(rawOut);
        return formatUnits(minOut, 18);
      } else {
        // Input: token amount -> Output: ETH amount
        const inUnits = parseUnits(amount || "0", 18);
        const rawOut = getAmountOut(inUnits, reserves.reserve1, reserves.reserve0, SWAP_FEE);
        const minOut = withSlippage(rawOut);
        return formatEther(minOut);
      }
    } catch {
      return "0";
    }
  }, [amount, reserves, tab]);

  // Sync percentage when amount changes
  useEffect(() => {
    if (!amount) {
      setPercentage(0);
      return;
    }

    try {
      if (tab === "buy" && ethBalance) {
        const amountBigInt = parseEther(amount);
        if (ethBalance.value > 0n) {
          const calculatedPercentage = Number((amountBigInt * 100n) / ethBalance.value);
          setPercentage(Math.min(100, Math.max(0, calculatedPercentage)));
        }
      } else if (tab === "sell" && coinBalance) {
        const amountBigInt = parseUnits(amount, 18);
        if (coinBalance > 0n) {
          const calculatedPercentage = Number((amountBigInt * 100n) / coinBalance);
          setPercentage(Math.min(100, Math.max(0, calculatedPercentage)));
        }
      }
    } catch {
      setPercentage(0);
    }
  }, [amount, tab, ethBalance, coinBalance]);

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

  const handleSwap = async (type: "buy" | "sell") => {
    try {
      if (!address || !isConnected) {
        throw new Error("Wallet not connected");
      }

      if (!reserves) {
        throw new Error("Reserves not loaded");
      }

      const poolKey = computePoolKey(coinId, SWAP_FEE, CookbookAddress) as CookbookPoolKey;

      const amountIn = type === "buy" ? parseEther(amount) : parseUnits(amount, 18);
      const amountOutMin = withSlippage(
        getAmountOut(
          amountIn,
          type === "buy" ? reserves.reserve0 : reserves.reserve1,
          type === "buy" ? reserves.reserve1 : reserves.reserve0,
          SWAP_FEE,
        ),
        200n,
      );

      const zeroForOne = type === "buy";
      const to = address;
      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      const hash = await writeContractAsync({
        address: CookbookAddress,
        abi: CookbookAbi,
        functionName: "swapExactIn",
        args: [poolKey, amountIn, amountOutMin, zeroForOne, to, deadline],
        value: type === "buy" ? amountIn : 0n,
      });
      setTxHash(hash);
      setErrorMessage(null);
    } catch (error) {
      const errorMsg = handleWalletError(error, {
        defaultMessage: t("errors.transaction_error")
      });
      if (errorMsg) {
        setErrorMessage(errorMsg);
      }
    }
  };

  const handleMax = () => {
    if (tab === "buy" && ethBalance) {
      const maxAmount = (ethBalance.value * 99n) / 100n; // Leave 1% for gas
      setAmount(formatEther(maxAmount));
      setPercentage(100);
    } else if (tab === "sell" && coinBalance) {
      setAmount(formatUnits(coinBalance, 18));
      setPercentage(100);
    }
  };

  const handlePercentageChange = (newPercentage: number) => {
    setPercentage(newPercentage);
    
    if (tab === "buy" && ethBalance) {
      const adjustedBalance = newPercentage === 100 
        ? (ethBalance.value * 99n) / 100n // Leave 1% for gas
        : (ethBalance.value * BigInt(newPercentage)) / 100n;
      setAmount(formatEther(adjustedBalance));
    } else if (tab === "sell" && coinBalance) {
      const adjustedBalance = (coinBalance * BigInt(newPercentage)) / 100n;
      setAmount(formatUnits(adjustedBalance, 18));
    }
  };

  const handleClaim = async () => {
    try {
      if (!address || !isConnected) {
        throw new Error("Wallet not connected");
      }

      if (!launchpadBalance) {
        throw new Error("No balance to claim");
      }

      const hash = await writeContractAsync({
        address: ZAMMLaunchAddress,
        abi: ZAMMLaunchAbi,
        functionName: "claim",
        args: [coinId, BigInt(launchpadBalance.toString())],
      });
      setTxHash(hash);
      setErrorMessage(null);
    } catch (error) {
      const errorMsg = handleWalletError(error, {
        defaultMessage: t("errors.transaction_error")
      });
      if (errorMsg) {
        setErrorMessage(errorMsg);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Per-unit price information */}
      {reserves && reserves.reserve0 > 0n && reserves.reserve1 > 0n && ethPrice?.priceUSD && (
        <div className="p-2 bg-muted/30 rounded-lg text-xs text-muted-foreground">
          <div className="flex flex-col gap-1">
            {(() => {
              const ethAmount = parseFloat(formatEther(reserves.reserve0));
              const tokenAmount = parseFloat(formatUnits(reserves.reserve1, 18));
              const tokenPriceInEth = ethAmount / tokenAmount;
              const ethPriceInToken = tokenAmount / ethAmount;
              const tokenPriceUsd = tokenPriceInEth * ethPrice.priceUSD;
              const totalPoolValueUsd = (ethAmount * ethPrice.priceUSD) * 2;
              
              return (
                <>
                  <div className="opacity-90">Pool Value: ${formatNumber(totalPoolValueUsd, 2)} USD</div>
                  <div className="opacity-75">
                    1 ETH = {formatNumber(ethPriceInToken, 6)} {symbol} | 
                    1 {symbol} = {tokenPriceInEth.toFixed(8)} ETH (${formatNumber(tokenPriceUsd, 8)} USD)
                  </div>
                  <div className="opacity-60 flex items-center gap-1">
                    <span>Fee: {Number(SWAP_FEE) / 100}%</span>
                    <span 
                      className="text-[10px] opacity-70 cursor-help hover:opacity-100 transition-opacity" 
                      title={t("common.paid_to_lps")}
                    >
                      ⓘ
                    </span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
      
      {/* Claim Section - Only show if user can claim */}
      {canClaim ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t("claim.title", "Claim Tokens")}
              <Badge variant="default">{t("claim.available", "Available")}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">{t("claim.claimable_balance", "Claimable Balance")}:</span>
                <span className="text-sm font-mono font-bold">
                  {claimableAmount} {symbol}
                </span>
              </div>
              <Button onClick={handleClaim} disabled={!isConnected || isPending} className="w-full" size="lg">
                {isPending ? t("claim.claiming", "Claiming...") : t("claim.claim_all", "Claim All Tokens")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as "buy" | "sell")}>
        <TabsList>
          <TabsTrigger value="buy">{t("create.buy_token", { token: symbol })}</TabsTrigger>
          <TabsTrigger value="sell">{t("create.sell_token", { token: symbol })}</TabsTrigger>
        </TabsList>

        <TabsContent value="buy">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">{t("create.using_token", { token: "ETH" })}</span>
              <span className="text-sm text-gray-500">
                {t("create.balance")}: {ethBalance ? formatEther(ethBalance.value) : "0"} ETH
              </span>
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder={t("create.amount_token", { token: "ETH" })}
                value={amount}
                onChange={(e) => setAmount(e.currentTarget.value)}
              />
              <Button variant="outline" onClick={handleMax} className="whitespace-nowrap">
                Max
              </Button>
            </div>
            {usdValue && amount && (
              <span className="text-xs text-muted-foreground">≈ ${usdValue} USD</span>
            )}
            {ethBalance && ethBalance.value > 0n && (
              <PercentageSlider
                value={percentage}
                onChange={handlePercentageChange}
                disabled={!isConnected}
              />
            )}
            <span className="text-sm font-medium">
              {t("create.you_will_receive", { amount: formatNumber(parseFloat(estimated), 6), token: symbol })}
            </span>
            <Button onClick={() => handleSwap("buy")} disabled={!isConnected || isPending || !amount}>
              {isPending ? t("swap.swapping") : t("create.buy_token", { token: symbol })}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="sell">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">{t("create.using_token", { token: symbol })}</span>
              <span className="text-sm text-gray-500">
                {t("create.balance")}: {coinBalance ? formatUnits(coinBalance, 18) : "0"} {symbol}
              </span>
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder={t("create.amount_token", { token: symbol })}
                value={amount}
                onChange={(e) => setAmount(e.currentTarget.value)}
              />
              <Button variant="outline" onClick={handleMax} className="whitespace-nowrap">
                Max
              </Button>
            </div>
            {coinBalance !== undefined && coinBalance > 0n && (
              <PercentageSlider
                value={percentage}
                onChange={handlePercentageChange}
                disabled={!isConnected}
              />
            )}
            <span className="text-sm font-medium">
              {t("create.you_will_receive", { amount: formatNumber(parseFloat(estimated), 6), token: "ETH" })}
            </span>
            {usdValue && estimated !== "0" && (
              <span className="text-xs text-muted-foreground">≈ ${usdValue} USD</span>
            )}
            <Button onClick={() => handleSwap("sell")} disabled={!isConnected || isPending || !amount}>
              {isPending ? t("swap.swapping") : t("create.sell_token", { token: symbol })}
            </Button>
          </div>
        </TabsContent>

        {errorMessage && <p className="text-destructive text-sm">{errorMessage}</p>}
        {isSuccess && <p className="text-green-600 text-sm">{t("create.transaction_confirmed")}</p>}
      </Tabs>
    </div>
  );
};
