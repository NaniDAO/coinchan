import { useMemo, useState } from "react";
import {
  useAccount,
  useBalance,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { parseEther, formatEther, formatUnits } from "viem";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Loader2, Coins, Clock, Users, DollarSign } from "lucide-react";
import { zICOAbi, zICOAddress } from "@/constants/zICO";
import { TradePanel } from "../trade/TradePanel";
import { ETH_TOKEN, TokenMetadata } from "@/lib/pools";
import { ZICOSaleStatus } from "@/hooks/use-otc-sale-status";
import { mainnet } from "viem/chains";
import { Progress } from "../ui/progress";
import { useTranslation } from "react-i18next";
import { useETHPrice } from "@/hooks/use-eth-price";

export type BuyOTCProps = {
  buyToken: TokenMetadata;
  sale?: ZICOSaleStatus;
  totalSupply?: bigint;
  className?: string;
};

function useOtcQuote({
  coinId,
  ethInWei,
}: {
  coinId?: bigint;
  ethInWei?: bigint;
}) {
  const enabled = Boolean(
    coinId !== undefined && ethInWei !== undefined && ethInWei! > 0n,
  );

  const sim = useSimulateContract({
    abi: zICOAbi,
    address: zICOAddress,
    functionName: "buyOTC",
    args: coinId !== undefined ? [coinId, 0n] : undefined,
    value: ethInWei,
    query: {
      enabled,
      refetchOnWindowFocus: false,
    },
  });

  const amountOut: bigint | undefined = sim.data?.result as bigint | undefined;

  return {
    amountOut,
    isLoading: sim.isLoading,
    isFetching: sim.isFetching,
    error: sim.error,
    refetch: sim.refetch,
  };
}

export default function BuyOTC({
  buyToken,
  sale,
  totalSupply,
  className,
}: BuyOTCProps) {
  const { t } = useTranslation();
  const { address, isConnected } = useAccount();
  const { data: ethPrice } = useETHPrice();

  const { data: ethBalance } = useBalance({
    address,
    chainId: mainnet.id,
  });

  const sellToken = {
    ...ETH_TOKEN,
    balance: ethBalance?.value,
  };

  const tokens = useMemo(() => {
    return [buyToken, sellToken];
  }, [buyToken, sellToken]);

  // amount user inputs in ETH (as string for the input field)
  const [ethAmount, setEthAmount] = useState<string>("");

  const ethInWei = useMemo(() => {
    try {
      if (!ethAmount) return undefined;
      return parseEther(ethAmount as `${number}`);
    } catch {
      return undefined;
    }
  }, [ethAmount]);

  const coinId: bigint | undefined = useMemo(() => {
    if (!buyToken) return undefined;
    if (typeof buyToken.id === "number") return BigInt(buyToken.id);
    return buyToken.id ?? undefined;
  }, [buyToken]);

  // --- Quote ---
  const {
    amountOut,
    isFetching: quoteLoading,
    error: quoteError,
  } = useOtcQuote({
    coinId,
    ethInWei,
  });

  // --- Write ---
  const {
    writeContract,
    data: txHash,
    isPending: isWriting,
    error: writeError,
  } = useWriteContract();
  const {
    isLoading: isMining,
    isSuccess,
    isError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    query: {
      enabled: Boolean(txHash),
    },
  });

  const canSubmit =
    isConnected && !!ethInWei && !!coinId && !isWriting && !isMining;

  const onBuy = () => {
    if (!ethInWei || !coinId) return;
    writeContract({
      address: zICOAddress,
      abi: zICOAbi,
      functionName: "buyOTC",
      args: [coinId, 0n],
      value: ethInWei,
    });
  };

  const formattedOut = useMemo(() => {
    if (!amountOut || !buyToken) return "0";
    return formatUnits(amountOut, buyToken.decimals);
  }, [amountOut, buyToken]);

  const syncFromBuy = (v: string) => {
    setEthAmount(v);
    // calculate buy amount and set it
  };

  const saleStats = useMemo(() => {
    if (!sale) {
      return {
        progress: 0,
        remaining: "0",
        remainingFormatted: "0",
        sold: "0",
        soldFormatted: "0",
        ethRaised: "0",
        pricePerToken: "0",
        initialSaleSupply: "0",
        initialSaleSupplyFormatted: "0",
        totalSupplyFormatted: "0",
        isIntelligentTracking: false,
      };
    }

    // Format numbers for display
    const formatLargeNumber = (num: string) => {
      const n = Number(num);
      if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
      if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
      if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
      return n.toFixed(2);
    };

    const remaining = sale.zicoInventory;

    // Intelligent OTC supply calculation
    // If we have totalSupply, we know the actual total minted
    // The initial OTC sale supply would be the current inventory + what's been sold
    // But since we can't easily get historical data, we'll estimate based on patterns

    // Calculate sold tokens based on ETH raised and initial rate
    // This is accurate because ethRate is fixed at creation
    let sold: bigint = 0n;
    let initialOTCSupply: bigint;
    let progress: number = 0;
    let isIntelligentTracking = false;

    if (sale.ethRate > 0n) {
      // Calculate tokens sold: ETH raised * tokens per ETH
      // Note: ethRate is already in wei (tokens * 10^18 per 1 ETH)
      sold = (sale.reserveEth * sale.ethRate) / (10n ** 18n);

      // Initial OTC supply = current remaining + sold
      initialOTCSupply = remaining + sold;

      // This is now accurate: we know both sold and initial
      if (initialOTCSupply > 0n) {
        progress = (Number(formatEther(sold)) / Number(formatEther(initialOTCSupply))) * 100;
        isIntelligentTracking = true;
      }
    } else {
      // Fallback if no ethRate (shouldn't happen for OTC sales)
      initialOTCSupply = remaining;
      sold = 0n;
      progress = 0;
    }

    // Calculate price per token in ETH
    // ethRate is tokens per 1 ETH (stored as tokens * 10^18)
    let pricePerToken = "0";
    let pricePerTokenNum = 0;
    let pricePerTokenUSD = "0";

    if (sale.ethRate > 0n) {
      // ethRate is tokens per 1 ETH with 18 decimals
      // So price per token = 1 ETH / ethRate
      const tokensPerEth = Number(formatEther(sale.ethRate));
      if (tokensPerEth > 0) {
        pricePerTokenNum = 1 / tokensPerEth;
        // Show more decimals for small prices
        if (pricePerTokenNum < 0.000001) {
          pricePerToken = pricePerTokenNum.toExponential(2);
        } else if (pricePerTokenNum < 0.001) {
          pricePerToken = pricePerTokenNum.toFixed(9);
        } else {
          pricePerToken = pricePerTokenNum.toFixed(6);
        }

        // Calculate USD price
        if (ethPrice?.priceUSD) {
          const usdPrice = pricePerTokenNum * ethPrice.priceUSD;
          if (usdPrice < 0.000001) {
            pricePerTokenUSD = usdPrice.toExponential(2);
          } else if (usdPrice < 0.01) {
            pricePerTokenUSD = usdPrice.toFixed(6);
          } else {
            pricePerTokenUSD = usdPrice.toFixed(4);
          }
        }
      }
    } else if (sale.ethPerCoinX18 > 0n) {
      // Fallback to ethPerCoinX18 if ethRate is not available
      pricePerTokenNum = Number(formatEther(sale.ethPerCoinX18));
      pricePerToken = pricePerTokenNum.toFixed(6);

      if (ethPrice?.priceUSD) {
        const usdPrice = pricePerTokenNum * ethPrice.priceUSD;
        pricePerTokenUSD = usdPrice.toFixed(4);
      }
    }

    // Calculate tokens per ETH for display
    let tokensPerEth = "0";
    if (sale.ethRate > 0n) {
      const tokensPerEthNum = Number(formatEther(sale.ethRate));
      tokensPerEth = formatLargeNumber(tokensPerEthNum.toString());
    }

    return {
      progress: Math.min(progress, 100), // Cap at 100%
      remaining: formatEther(remaining),
      remainingFormatted: formatLargeNumber(formatEther(remaining)),
      sold: formatEther(sold),
      soldFormatted: formatLargeNumber(formatEther(sold)),
      ethRaised: formatEther(sale.reserveEth || 0n),
      pricePerToken,
      pricePerTokenUSD,
      tokensPerEth,
      initialSaleSupply: formatEther(initialOTCSupply),
      initialSaleSupplyFormatted: formatLargeNumber(formatEther(initialOTCSupply)),
      totalSupplyFormatted: totalSupply ? formatLargeNumber(formatEther(totalSupply)) : "21M",
      isIntelligentTracking,
    };
  }, [sale, totalSupply, ethPrice]);

  return (
    <Card
      className={`w-full max-w-xl mx-auto shadow-lg rounded-2xl ${className ?? ""}`}
    >
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xl font-semibold">Buy OTC</div>
          <div className="flex items-center gap-2">
            {sale && sale.lpBps > 0 && (
              <div className="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-md">
                {(sale.lpBps / 100).toFixed(0)}% LP
              </div>
            )}
            <div className="text-sm font-medium text-muted-foreground">
              {saleStats.remainingFormatted} available
            </div>
          </div>
        </div>

        {/* Accurate progress bar based on calculated initial supply */}
        {saleStats.progress > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{saleStats.soldFormatted} sold</span>
              <span>{saleStats.progress.toFixed(1)}% complete</span>
            </div>
            <Progress value={saleStats.progress} className="h-2" />
            <div className="text-xs text-center text-muted-foreground">
              Est. initial: {saleStats.initialSaleSupplyFormatted} tokens
            </div>
          </div>
        )}

        {/* Sale Statistics Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-muted/50 space-y-1">
            <div className="flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Available</span>
            </div>
            <div className="font-semibold text-sm" title="Tokens currently available for purchase">
              {saleStats.remainingFormatted}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-muted/50 space-y-1">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Rate</span>
            </div>
            <div className="font-semibold text-sm" title={`1 ETH = ${saleStats.tokensPerEth} tokens`}>
              {saleStats.tokensPerEth}/ETH
            </div>
          </div>

          <div className="p-3 rounded-lg bg-muted/50 space-y-1">
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Price</span>
            </div>
            <div className="space-y-0.5">
              <div className="font-semibold text-sm" title="Price per token">
                {saleStats.pricePerTokenUSD !== "0" ? `$${saleStats.pricePerTokenUSD}` : `${saleStats.pricePerToken} Ξ`}
              </div>
              <div className="text-xs text-muted-foreground">
                {saleStats.pricePerTokenUSD !== "0" && `${saleStats.pricePerToken} Ξ`}
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <TradePanel
          title={"Sell"}
          selectedToken={sellToken}
          tokens={tokens}
          onSelect={() => {}}
          amount={ethAmount}
          onAmountChange={syncFromBuy}
          className="pt-4 rounded-t-2xl"
          locked={true}
          onMax={() => {
            if (!ethBalance) return;
            syncFromBuy(formatEther(ethBalance.value));
          }}
          showMaxButton={
            !!(sellToken.balance !== undefined && sellToken.balance > 0n)
          }
        />
        {/* Trade Panel: lock only buy token selection per spec */}
        <TradePanel
          title={"Buy"}
          selectedToken={buyToken}
          tokens={tokens}
          onSelect={() => {}}
          amount={formattedOut}
          onAmountChange={() => {}}
          className="pt-4 rounded-b-2xl"
          locked={true}
          readOnly={true}
        />

        {/* Quote row */}
        <div className="flex items-center justify-between text-sm bg-muted/50 rounded-xl px-3 py-2">
          <span className="text-muted-foreground">You receive (est.)</span>
          <div className="flex items-center gap-2">
            {quoteLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span className="font-medium">
                {formattedOut} {buyToken?.symbol}
              </span>
            )}
          </div>
        </div>

        {/* Errors (quote) */}
        {quoteError && (
          <div className="text-xs text-red-500">
            Quote failed: {quoteError.message ?? String(quoteError)}
          </div>
        )}

        {/* Transaction status */}
        {txHash && (
          <div className="text-xs text-muted-foreground break-all">
            Submitted: {txHash}
          </div>
        )}
        {isSuccess && (
          <div className="text-xs text-green-600">
            Success! Tokens purchased.
          </div>
        )}
        {isError && writeError && (
          <div className="text-xs text-red-500">
            Tx failed: {writeError.message}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button
          onClick={onBuy}
          disabled={!canSubmit}
          className="w-full h-11 rounded-2xl"
        >
          {isWriting || isMining ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Processing...
            </span>
          ) : (
            "Buy"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
