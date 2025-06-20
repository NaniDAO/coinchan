import { useState, useMemo } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits, Address } from "viem";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { useCookbookCoinP2PBalance } from "../hooks/use-cookbook-p2p-balances";
import { useAllCoins } from "../hooks/metadata/use-all-coins";
import { CookbookAddress } from "../constants/Cookbook";
import { CookbookAbi } from "../constants/Cookbook";
import { useTranslation } from "react-i18next";

interface P2POrderCreationProps {
  cookbookCoinId: bigint;
  cookbookSymbol: string;
  cookbookName: string;
  onOrderCreated?: (orderHash: string) => void;
}

export function P2POrderCreation({
  cookbookCoinId,
  cookbookSymbol,
  cookbookName,
  onOrderCreated,
}: P2POrderCreationProps) {
  const { t } = useTranslation();
  const { address } = useAccount();
  const { balance: cookbookBalance, isEligibleForP2P } = useCookbookCoinP2PBalance(cookbookCoinId);
  const { tokens: allCoins } = useAllCoins();
  
  const [orderType, setOrderType] = useState<"sell" | "buy">("sell");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [selectedToken, setSelectedToken] = useState<string>("");
  const [partialFill, setPartialFill] = useState(true);
  const [deadline, setDeadline] = useState("24"); // hours

  const { writeContractAsync, isPending: isCreatingOrder } = useWriteContract();
  const [txHash, setTxHash] = useState<string | null>(null);
  
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash as Address,
  });

  // Available tokens for trading (ETH, USDT, other coins with balance)
  const availableTokens = useMemo(() => {
    if (!allCoins) return [];
    return allCoins.filter(coin => 
      coin.id !== cookbookCoinId && // Exclude the cookbook coin itself
      (coin.balance || 0n) > 0n // Only show tokens with balance
    );
  }, [allCoins, cookbookCoinId]);

  const selectedTokenInfo = useMemo(() => {
    return availableTokens.find(token => 
      token.id === null ? "ETH" : token.id.toString() === selectedToken
    );
  }, [availableTokens, selectedToken]);

  const maxAmount = useMemo(() => {
    if (orderType === "sell") {
      return cookbookBalance;
    } else {
      return selectedTokenInfo?.balance || 0n;
    }
  }, [orderType, cookbookBalance, selectedTokenInfo]);

  const totalValue = useMemo(() => {
    if (!amount || !price) return "0";
    const amountBigInt = parseUnits(amount, 18);
    const priceBigInt = parseUnits(price, 18);
    const total = (amountBigInt * priceBigInt) / BigInt(10**18);
    return formatUnits(total, 18);
  }, [amount, price]);

  const handleCreateOrder = async () => {
    if (!address || !amount || !price || !selectedToken) return;

    try {
      const amountIn = parseUnits(amount, 18);
      const amountOut = parseUnits(totalValue, selectedTokenInfo?.id === null ? 18 : 18);
      const deadlineTimestamp = BigInt(Math.floor(Date.now() / 1000) + (parseInt(deadline) * 3600));

      const tokenIn = orderType === "sell" ? CookbookAddress : (selectedTokenInfo?.id === null ? "0x0000000000000000000000000000000000000000" : CookbookAddress);
      const tokenOut = orderType === "sell" ? (selectedTokenInfo?.id === null ? "0x0000000000000000000000000000000000000000" : CookbookAddress) : CookbookAddress;
      const idIn = orderType === "sell" ? cookbookCoinId : (selectedTokenInfo?.id || 0n);
      const idOut = orderType === "sell" ? (selectedTokenInfo?.id || 0n) : cookbookCoinId;

      const hash = await writeContractAsync({
        address: CookbookAddress,
        abi: CookbookAbi,
        functionName: "makeOrder",
        args: [
          tokenIn,
          idIn,
          amountIn,
          tokenOut, 
          idOut,
          amountOut,
          deadlineTimestamp,
          partialFill,
        ],
      });

      setTxHash(hash);
      onOrderCreated?.(hash);
    } catch (error) {
      console.error("Failed to create P2P order:", error);
    }
  };

  const handleSetMaxAmount = () => {
    if (maxAmount > 0n) {
      setAmount(formatUnits(maxAmount, 18));
    }
  };

  if (!isEligibleForP2P) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("P2P Trading")}</CardTitle>
          <CardDescription>
            {t("You need to hold some {{symbol}} tokens to create P2P orders", { symbol: cookbookSymbol })}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Create P2P Order")}</CardTitle>
        <CardDescription>
          {t("Trade your {{name}} ({{symbol}}) tokens with other users", { name: cookbookName, symbol: cookbookSymbol })}
        </CardDescription>
        <Badge variant="secondary">
          {t("Balance: {{balance}} {{symbol}}", { 
            balance: formatUnits(cookbookBalance, 18), 
            symbol: cookbookSymbol 
          })}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs value={orderType} onValueChange={(value) => setOrderType(value as "sell" | "buy")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="sell">{t("Sell {{symbol}}", { symbol: cookbookSymbol })}</TabsTrigger>
            <TabsTrigger value="buy">{t("Buy {{symbol}}", { symbol: cookbookSymbol })}</TabsTrigger>
          </TabsList>
          
          <TabsContent value="sell" className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Amount to Sell")}</Label>
              <div className="flex space-x-2">
                <Input
                  type="number"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <Button variant="outline" size="sm" onClick={handleSetMaxAmount}>
                  {t("Max")}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="buy" className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Amount to Buy")}</Label>
              <Input
                type="number"
                placeholder="0.0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-2">
          <Label>{t("Trading Pair")}</Label>
          <Select value={selectedToken} onValueChange={setSelectedToken}>
            <SelectTrigger>
              <SelectValue placeholder={t("Select token to trade with")} />
            </SelectTrigger>
            <SelectContent>
              {availableTokens.map((token) => (
                <SelectItem key={token.id?.toString() || "ETH"} value={token.id?.toString() || "ETH"}>
                  {token.symbol} - {t("Balance: {{balance}}", { 
                    balance: formatUnits(token.balance || 0n, 18) 
                  })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t("Price per {{symbol}}", { symbol: cookbookSymbol })}</Label>
          <Input
            type="number"
            placeholder="0.0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          {selectedTokenInfo && (
            <p className="text-sm text-muted-foreground">
              {t("in {{symbol}}", { symbol: selectedTokenInfo.symbol })}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>{t("Order Expiry")}</Label>
          <Select value={deadline} onValueChange={setDeadline}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">{t("1 hour")}</SelectItem>
              <SelectItem value="6">{t("6 hours")}</SelectItem>
              <SelectItem value="24">{t("24 hours")}</SelectItem>
              <SelectItem value="168">{t("7 days")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="partialFill"
              checked={partialFill}
              onCheckedChange={(checked) => setPartialFill(checked === true)}
            />
            <Label htmlFor="partialFill">{t("Allow partial fills")}</Label>
          </div>
        </div>

        {amount && price && selectedToken && (
          <div className="rounded-lg bg-muted p-4">
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span>{t("Total Value")}:</span>
                <span>{totalValue} {selectedTokenInfo?.symbol}</span>
              </div>
              <div className="flex justify-between">
                <span>{t("Order Type")}:</span>
                <span>{orderType === "sell" ? t("Sell") : t("Buy")} {cookbookSymbol}</span>
              </div>
            </div>
          </div>
        )}

        <Button 
          onClick={handleCreateOrder}
          disabled={!amount || !price || !selectedToken || isCreatingOrder || isConfirming}
          className="w-full"
        >
          {isCreatingOrder ? t("Creating Order...") : 
           isConfirming ? t("Confirming...") :
           isSuccess ? t("Order Created!") :
           t("Create P2P Order")}
        </Button>
      </CardContent>
    </Card>
  );
}