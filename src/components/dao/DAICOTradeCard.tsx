import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useBalance, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { DaicoAbi, DaicoAddress } from "@/constants/DAICO";
import { formatEther, parseEther, type Address } from "viem";
import { handleWalletError } from "@/lib/errors";
import { ArrowDownUp, Wallet } from "lucide-react";
import type { DAICOSale } from "@/types/daico";

interface DAICOTradeCardProps {
  daoAddress: string;
  sale: DAICOSale | null;
  chainId: number;
}

export function DAICOTradeCard({ daoAddress, sale, chainId }: DAICOTradeCardProps) {
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // Get user's ETH balance
  const { data: ethBalance } = useBalance({
    address: address,
  });

  // Get user's token balance (tribTkn from the DAO)
  const { data: tokenBalance } = useReadContract({
    address: sale?.tribTkn as Address,
    abi: [
      {
        inputs: [{ internalType: "address", name: "account", type: "address" }],
        name: "balanceOf",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
    ],
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!sale?.tribTkn,
    },
  });

  // Quote the buy amount
  const { data: quotedAmount } = useReadContract({
    address: DaicoAddress,
    abi: DaicoAbi,
    functionName: "quoteBuy",
    args: sale ? [daoAddress as Address, sale.tribTkn as Address, amount ? parseEther(amount) : 0n] : undefined,
    query: {
      enabled: !!sale && !!amount && parseFloat(amount) > 0,
    },
  });

  // Calculate price
  const price = useMemo(() => {
    if (!sale || !sale.tribAmt || !sale.forAmt) return null;
    return parseFloat(formatEther(BigInt(sale.tribAmt))) / parseFloat(formatEther(BigInt(sale.forAmt)));
  }, [sale]);

  // Calculate sale progress
  // BUG FIXED: totalSold is DAO tokens sold, forAmt is payment tokens to raise
  // Should use totalRaised (payment received) / forAmt (payment target)
  const progress = useMemo(() => {
    if (!sale || !sale.forAmt) return 0;
    const calculated =
      (parseFloat(formatEther(BigInt(sale.totalRaised))) / parseFloat(formatEther(BigInt(sale.forAmt)))) * 100;
    return Math.min(calculated, 100);
  }, [sale]);

  const handleBuy = useCallback(async () => {
    if (!address || !sale || !amount) return;

    setErrorMessage(null);

    try {
      const payAmount = parseEther(amount);
      const minBuyAmount = quotedAmount && quotedAmount > 0n ? (quotedAmount * 95n) / 100n : 0n; // 5% slippage

      const hash = await writeContractAsync({
        address: DaicoAddress,
        abi: DaicoAbi,
        functionName: "buy",
        args: [daoAddress as Address, sale.tribTkn as Address, payAmount, minBuyAmount],
        value: payAmount,
        chainId,
      });

      setTxHash(hash);
      setAmount("");
    } catch (error) {
      const errorMsg = handleWalletError(error);
      setErrorMessage(errorMsg);
    }
  }, [address, sale, amount, quotedAmount, writeContractAsync, daoAddress, chainId]);

  useEffect(() => {
    if (isSuccess) {
      setTxHash(undefined);
    }
  }, [isSuccess]);

  if (!sale || sale.status !== "ACTIVE") {
    return (
      <Card className="p-6 backdrop-blur-xl bg-background/60 border-primary/10 w-full flex items-center justify-center">
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <div className="p-3 rounded-full bg-muted/50">
            <Wallet className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold mb-1">{!sale ? "No Active Sale" : "Sale Ended"}</h3>
            <p className="text-sm text-muted-foreground">
              {!sale ? "This DAO doesn't have an active token sale" : "The token sale has ended or is no longer active"}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 backdrop-blur-xl bg-background/60 border-primary/10 w-full flex flex-col">
      <div className="space-y-4 flex flex-col">
        {/* Header */}
        <div>
          <h3 className="font-semibold text-lg mb-1">Buy Shares</h3>
          <p className="text-xs text-muted-foreground">Purchase DAO tokens from the sale</p>
        </div>

        {/* Sale Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-mono text-muted-foreground">
            <span>SALE_PROGRESS</span>
            <span>{progress.toFixed(1)}%</span>
          </div>
          <div className="relative border border-foreground/20 bg-background/50 p-1 font-mono">
            <div className="flex h-4 overflow-hidden">
              {Array.from({ length: 20 }).map((_, i) => {
                const threshold = (i / 20) * 100;
                const isFilled = progress > threshold;
                return (
                  <div
                    key={i}
                    className={`flex-1 mx-[1px] transition-all duration-300 ${isFilled ? "bg-primary" : "bg-muted/30"}`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Your Balance */}
        {isConnected && (
          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/30">
            <div>
              <div className="text-xs text-muted-foreground mb-1">ETH Balance</div>
              <div className="font-mono text-sm">
                {ethBalance ? `Ξ${parseFloat(formatEther(ethBalance.value)).toFixed(4)}` : "0.0000"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Token Balance</div>
              <div className="font-mono text-sm">
                {tokenBalance !== undefined && tokenBalance > 0n
                  ? parseFloat(formatEther(tokenBalance)).toFixed(2)
                  : "0.00"}
              </div>
            </div>
          </div>
        )}

        {/* Price Info */}
        {price && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Token Price</span>
              <span className="font-semibold">Ξ{price.toFixed(6)}</span>
            </div>
          </div>
        )}

        {/* Buy Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Amount to Pay (ETH)</label>
          <Input
            type="number"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={!isConnected || isPending}
            className="text-lg h-12"
          />
        </div>

        {/* Estimated Output */}
        {quotedAmount !== undefined && quotedAmount > 0n && amount && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30">
            <ArrowDownUp className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">You'll receive</div>
              <div className="font-semibold">{parseFloat(formatEther(quotedAmount)).toFixed(2)} tokens</div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {errorMessage && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">{errorMessage}</div>
        )}

        {/* Buy Button */}
        <Button
          onClick={handleBuy}
          disabled={!isConnected || !amount || parseFloat(amount) <= 0 || isPending}
          className="w-full h-12"
          size="lg"
        >
          {isPending ? (
            <>
              <LoadingLogo className="mr-2" />
              Buying...
            </>
          ) : !isConnected ? (
            "Connect Wallet"
          ) : (
            "Buy Shares"
          )}
        </Button>

        {/* Success Message */}
        {isSuccess && (
          <div className="text-sm text-green-600 dark:text-green-400 bg-green-500/10 p-3 rounded-lg text-center">
            Purchase successful!
          </div>
        )}
      </div>
    </Card>
  );
}
