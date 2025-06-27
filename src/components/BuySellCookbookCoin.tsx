import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { ZAMMLaunchAbi, ZAMMLaunchAddress } from "@/constants/ZAMMLaunch";
import { useReserves } from "@/hooks/use-reserves";
import {
  computePoolId,
  computePoolKey,
  CookbookPoolKey,
  DEADLINE_SEC,
  getAmountOut,
  SWAP_FEE,
  withSlippage,
} from "@/lib/swap";
import { nowSec } from "@/lib/utils";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { parseEther, parseUnits, formatEther, formatUnits } from "viem";
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useBalance, useReadContract } from "wagmi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mainnet } from "viem/chains";

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

  const poolId = useMemo(() => computePoolId(coinId, SWAP_FEE, CookbookAddress), [coinId]);

  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
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
        const inWei = parseEther(amount || "0");
        const rawOut = getAmountOut(inWei, reserves.reserve0, reserves.reserve1, SWAP_FEE);
        const minOut = withSlippage(rawOut);
        return formatUnits(minOut, 18);
      } else {
        const inUnits = parseUnits(amount || "0", 18);
        const rawOut = getAmountOut(inUnits, reserves.reserve1, reserves.reserve0, SWAP_FEE);
        const minOut = withSlippage(rawOut);
        return formatEther(minOut);
      }
    } catch {
      return "0";
    }
  }, [amount, reserves, tab]);

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
    } catch (error) {
      console.error(error);
      setErrorMessage(t("create.transaction_failed"));
    }
  };

  const handleMax = () => {
    if (tab === "buy" && ethBalance) {
      setAmount(formatEther(ethBalance.value));
    } else if (tab === "sell" && coinBalance) {
      setAmount(formatUnits(coinBalance, 18));
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
    } catch (error) {
      console.error(error);
      setErrorMessage(t("create.transaction_failed"));
    }
  };

  return (
    <div className="space-y-4">
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
            <span className="text-sm font-medium">
              {t("create.you_will_receive", { amount: estimated, token: symbol })}
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
            <span className="text-sm font-medium">
              {t("create.you_will_receive", { amount: estimated, token: "ETH" })}
            </span>
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
