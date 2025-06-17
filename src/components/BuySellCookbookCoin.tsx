import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
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
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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
      const amountOutMin = withSlippage(getAmountOut(amountIn, reserves.reserve0, reserves.reserve1, SWAP_FEE));

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

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "buy" | "sell")}>
      <TabsList>
        <TabsTrigger value="buy">{t("create.buy_token", { token: symbol })}</TabsTrigger>
        <TabsTrigger value="sell">{t("create.sell_token", { token: symbol })}</TabsTrigger>
      </TabsList>

      <TabsContent value="buy">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t("create.using_token", { token: "ETH" })}</span>
          <Input
            type="number"
            placeholder={t("create.amount_token", { token: "ETH" })}
            value={amount}
            onChange={(e) => setAmount(e.currentTarget.value)}
          />
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
          <span className="text-sm font-medium">{t("create.using_token", { token: symbol })}</span>
          <Input
            type="number"
            placeholder={t("create.amount_token", { token: symbol })}
            value={amount}
            onChange={(e) => setAmount(e.currentTarget.value)}
          />
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
  );
};
