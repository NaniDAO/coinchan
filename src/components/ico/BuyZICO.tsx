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
import { Loader2 } from "lucide-react";
import { zICOAbi, zICOAddress } from "@/constants/zICO";
import { TradePanel } from "../trade/TradePanel";
import { ETH_TOKEN, TokenMetadata } from "@/lib/pools";
import { ZICOSaleStatus } from "@/hooks/use-otc-sale-status";
import { mainnet } from "viem/chains";
import { Progress } from "../ui/progress";

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
  const { address, isConnected } = useAccount();

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

  const progress = useMemo(() => {
    if (!sale || !sale.zicoInventory || !totalSupply) return 0;
    return (
      ((Number(formatEther(totalSupply)) -
        Number(formatEther(sale.zicoInventory))) /
        Number(formatEther(totalSupply))) *
      100
    );
  }, [sale, totalSupply]);

  return (
    <Card
      className={`w-full max-w-xl mx-auto shadow-lg rounded-2xl ${className ?? ""}`}
    >
      <CardHeader className="flex items-center justify-between gap-2">
        <div className="text-xl font-semibold">Buy OTC</div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Progress value={progress}></Progress>
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
