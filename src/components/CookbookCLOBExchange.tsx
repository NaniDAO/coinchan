import { useState, useMemo, useCallback } from "react";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { P2POrderCreation } from "./P2POrderCreation";
import { OrderCard } from "./OrderCard";
import { useTranslation } from "react-i18next";
import { useCookbookCoinP2PBalance } from "../hooks/use-cookbook-p2p-balances";
import { useQuery } from "@tanstack/react-query";
import { INDEXER_URL } from "../lib/indexer";
import { Order } from "./OrdersPage";

interface CookbookCLOBExchangeProps {
  cookbookCoinId: bigint;
  cookbookSymbol: string;
  cookbookName: string;
  isLaunchpadActive?: boolean; // Whether the launchpad sale is still active
}

interface OrderBookEntry {
  price: string;
  amount: string;
  total: string;
  orders: Order[];
}

export function CookbookCLOBExchange({
  cookbookCoinId,
  cookbookSymbol,
  cookbookName,
  isLaunchpadActive = false,
}: CookbookCLOBExchangeProps) {
  const { t } = useTranslation();
  const { address } = useAccount();
  const [activeTab, setActiveTab] = useState<"orderbook" | "create" | "myorders">("orderbook");
  const [selectedPair, setSelectedPair] = useState<"ETH" | "USDT">("ETH");
  
  const { balance: cookbookBalance, isEligibleForP2P } = useCookbookCoinP2PBalance(cookbookCoinId);

  // Fetch P2P orders for this cookbook coin
  const { data: p2pOrders = [], isLoading: isLoadingOrders, refetch: refetchOrders } = useQuery({
    queryKey: ["cookbookP2POrders", cookbookCoinId, selectedPair],
    queryFn: async (): Promise<Order[]> => {
      const query = `
        query GetCookbookP2POrders($coinId: String!, $pairedToken: String!) {
          orders(
            where: {
              OR: [
                { tokenIn: "${import.meta.env.VITE_COOKBOOK_ADDRESS}", idIn: "${cookbookCoinId.toString()}" },
                { tokenOut: "${import.meta.env.VITE_COOKBOOK_ADDRESS}", idOut: "${cookbookCoinId.toString()}" }
              ],
              status: "ACTIVE"
            },
            orderBy: "createdAt",
            orderDirection: "desc",
            limit: 100
          ) {
            items {
              id
              maker
              tokenIn
              idIn
              amtIn
              tokenOut
              idOut
              amtOut
              deadline
              partialFill
              inDone
              outDone
              status
              createdAt
              updatedAt
              txHash
              blockNumber
            }
          }
        }
      `;

      const response = await fetch(INDEXER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch P2P orders");
      }

      const data = await response.json();
      return data.data?.orders?.items || [];
    },
    enabled: true,
    staleTime: 10_000, // 10 seconds
    refetchInterval: 15_000, // Refresh every 15 seconds
  });

  // Filter and separate buy/sell orders
  const { buyOrders, sellOrders, userOrders } = useMemo(() => {
    const buy: Order[] = [];
    const sell: Order[] = [];
    const user: Order[] = [];

    p2pOrders.forEach(order => {
      // Check if user is the maker
      if (address && order.maker.toLowerCase() === address.toLowerCase()) {
        user.push(order);
      }

      // Determine if it's a buy or sell order for the cookbook coin
      const isSellOrder = order.tokenIn.toLowerCase() === import.meta.env.VITE_COOKBOOK_ADDRESS?.toLowerCase() 
        && order.idIn === cookbookCoinId.toString();
      
      if (isSellOrder) {
        sell.push(order);
      } else {
        buy.push(order);
      }
    });

    return { buyOrders: buy, sellOrders: sell, userOrders: user };
  }, [p2pOrders, cookbookCoinId, address]);

  // Aggregate orders by price for order book display
  const aggregateOrdersByPrice = useCallback((orders: Order[], isSell: boolean): OrderBookEntry[] => {
    const priceMap = new Map<string, { amount: bigint; orders: Order[] }>();

    orders.forEach(order => {
      const amountIn = BigInt(order.amtIn);
      const amountOut = BigInt(order.amtOut);
      
      // Calculate price (output amount / input amount)
      const price = isSell 
        ? (amountOut * BigInt(10**18)) / amountIn  // Price in terms of output token
        : (amountIn * BigInt(10**18)) / amountOut; // Price in terms of input token
        
      const priceStr = formatUnits(price, 18);
      const amount = isSell ? amountIn : amountOut;

      if (priceMap.has(priceStr)) {
        const existing = priceMap.get(priceStr)!;
        priceMap.set(priceStr, {
          amount: existing.amount + amount,
          orders: [...existing.orders, order],
        });
      } else {
        priceMap.set(priceStr, {
          amount,
          orders: [order],
        });
      }
    });

    return Array.from(priceMap.entries())
      .map(([price, { amount, orders }]) => ({
        price,
        amount: formatUnits(amount, 18),
        total: formatUnits(BigInt(price) * amount / BigInt(10**18), 18),
        orders,
      }))
      .sort((a, b) => parseFloat(b.price) - parseFloat(a.price)); // Sort by price descending
  }, []);

  const buyOrderBook = useMemo(() => aggregateOrdersByPrice(buyOrders, false), [buyOrders, aggregateOrdersByPrice]);
  const sellOrderBook = useMemo(() => aggregateOrdersByPrice(sellOrders, true), [sellOrders, aggregateOrdersByPrice]);

  const spreadInfo = useMemo(() => {
    if (buyOrderBook.length === 0 || sellOrderBook.length === 0) return null;
    
    const bestBid = Math.max(...buyOrderBook.map(o => parseFloat(o.price)));
    const bestAsk = Math.min(...sellOrderBook.map(o => parseFloat(o.price)));
    const spread = bestAsk - bestBid;
    const spreadPercent = (spread / bestAsk) * 100;

    return { bestBid, bestAsk, spread, spreadPercent };
  }, [buyOrderBook, sellOrderBook]);

  const handleOrderCreated = useCallback(() => {
    refetchOrders();
  }, [refetchOrders]);

  const handleQuickBuy = useCallback((_entry: OrderBookEntry) => {
    // Switch to create order tab and pre-fill with buy order at this price
    setActiveTab("create");
    // You could also pass this data to the order creation component
  }, []);

  const handleQuickSell = useCallback((_entry: OrderBookEntry) => {
    // Switch to create order tab and pre-fill with sell order at this price
    setActiveTab("create");
    // You could also pass this data to the order creation component
  }, []);

  return (
    <div className="space-y-6">
      {/* Header with coin info and P2P status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{cookbookName} ({cookbookSymbol}) P2P Exchange</CardTitle>
              <CardDescription>
                {isLaunchpadActive 
                  ? t("Trade during launchpad sale period") 
                  : t("Peer-to-peer trading for {{symbol}}", { symbol: cookbookSymbol })
                }
              </CardDescription>
            </div>
            <div className="flex space-x-2">
              <Badge variant={isEligibleForP2P ? "default" : "secondary"}>
                {t("Balance: {{balance}} {{symbol}}", { 
                  balance: formatUnits(cookbookBalance, 18), 
                  symbol: cookbookSymbol 
                })}
              </Badge>
              {isLaunchpadActive && (
                <Badge variant="outline">{t("Launchpad Active")}</Badge>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Trading pair selector */}
      <div className="flex space-x-2">
        <Button
          variant={selectedPair === "ETH" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedPair("ETH")}
        >
          {cookbookSymbol}/ETH
        </Button>
        <Button
          variant={selectedPair === "USDT" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedPair("USDT")}
        >
          {cookbookSymbol}/USDT
        </Button>
      </div>

      {/* Main tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="orderbook">{t("Order Book")}</TabsTrigger>
          <TabsTrigger value="create">{t("Create Order")}</TabsTrigger>
          <TabsTrigger value="myorders">{t("My Orders")} ({userOrders.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="orderbook" className="space-y-4">
          {/* Market Summary - EtherDelta Style */}
          <Card className="bg-gradient-to-r from-primary/5 to-secondary/5">
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-muted-foreground text-xs">{t("Last Price")}</div>
                  <div className="font-mono text-lg font-bold">
                    {spreadInfo ? ((spreadInfo.bestBid + spreadInfo.bestAsk) / 2).toFixed(6) : '0.000000'}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-muted-foreground text-xs">{t("Best Bid")}</div>
                  <div className="font-mono text-lg font-bold text-green-600">
                    {spreadInfo ? spreadInfo.bestBid.toFixed(6) : '0.000000'}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-muted-foreground text-xs">{t("Best Ask")}</div>
                  <div className="font-mono text-lg font-bold text-red-600">
                    {spreadInfo ? spreadInfo.bestAsk.toFixed(6) : '0.000000'}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-muted-foreground text-xs">{t("Spread")}</div>
                  <div className="font-mono text-lg font-bold">
                    {spreadInfo ? `${spreadInfo.spreadPercent.toFixed(2)}%` : '0.00%'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Sell Orders (Asks) - Show at top like EtherDelta */}
            <Card>
              <CardHeader>
                <CardTitle className="text-red-600">{t("Sell Orders (Asks)")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">{t("Price")} ({selectedPair})</TableHead>
                      <TableHead className="text-right">{t("Amount")} ({cookbookSymbol})</TableHead>
                      <TableHead className="text-right">{t("Total")} ({selectedPair})</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sellOrderBook.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          {t("No sell orders")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      sellOrderBook.slice(0, 10).map((entry, idx) => (
                        <TableRow key={idx} className="hover:bg-red-50 dark:hover:bg-red-950 cursor-pointer">
                          <TableCell className="text-red-600 text-right font-mono">{parseFloat(entry.price).toFixed(6)}</TableCell>
                          <TableCell className="text-right font-mono">{parseFloat(entry.amount).toFixed(4)}</TableCell>
                          <TableCell className="text-right font-mono">{parseFloat(entry.total).toFixed(6)}</TableCell>
                          <TableCell>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-red-600 hover:bg-red-50"
                              onClick={() => handleQuickBuy(entry)}
                            >
                              {t("Buy")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Buy Orders (Bids) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-green-600">{t("Buy Orders (Bids)")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">{t("Price")} ({selectedPair})</TableHead>
                      <TableHead className="text-right">{t("Amount")} ({cookbookSymbol})</TableHead>
                      <TableHead className="text-right">{t("Total")} ({selectedPair})</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {buyOrderBook.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          {t("No buy orders")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      buyOrderBook.slice(0, 10).map((entry, idx) => (
                        <TableRow key={idx} className="hover:bg-green-50 dark:hover:bg-green-950 cursor-pointer">
                          <TableCell className="text-green-600 text-right font-mono">{parseFloat(entry.price).toFixed(6)}</TableCell>
                          <TableCell className="text-right font-mono">{parseFloat(entry.amount).toFixed(4)}</TableCell>
                          <TableCell className="text-right font-mono">{parseFloat(entry.total).toFixed(6)}</TableCell>
                          <TableCell>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-green-600 hover:bg-green-50"
                              onClick={() => handleQuickSell(entry)}
                            >
                              {t("Sell")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {isLoadingOrders && (
            <div className="text-center text-muted-foreground py-8">
              {t("Loading order book...")}
            </div>
          )}
        </TabsContent>

        <TabsContent value="create">
          <P2POrderCreation
            cookbookCoinId={cookbookCoinId}
            cookbookSymbol={cookbookSymbol}
            cookbookName={cookbookName}
            onOrderCreated={handleOrderCreated}
          />
        </TabsContent>

        <TabsContent value="myorders" className="space-y-4">
          {userOrders.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                {t("You have no active orders for {{symbol}}", { symbol: cookbookSymbol })}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {userOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  currentUser={address}
                  onOrderUpdate={handleOrderCreated}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}