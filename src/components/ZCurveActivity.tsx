import { useTranslation } from "react-i18next";
import { formatEther } from "viem";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatTimeAgo } from "@/lib/date";
import { getEtherscanAddressUrl, getEtherscanTxUrl } from "@/lib/explorer";
import { cn } from "@/lib/utils";
import { useZCurvePurchases, useZCurveSells } from "@/hooks/use-zcurve-sale";
import { AddressIcon } from "./AddressIcon";
import { LoadingLogo } from "./ui/loading-logo";
import { useMemo, useState } from "react";

interface ZCurveActivityProps {
  coinId: string;
  coinSymbol: string;
}

type ActivityEvent = {
  type: "BUY" | "SELL";
  timestamp: string;
  ethAmount: string;
  tokenAmount: string;
  pricePerToken: string;
  maker: string;
  txHash: string;
};

export function ZCurveActivity({ coinId, coinSymbol }: ZCurveActivityProps) {
  const { t } = useTranslation();
  const [limit, setLimit] = useState(10);
  
  const { data: purchases, isLoading: purchasesLoading } = useZCurvePurchases(coinId, limit);
  const { data: sells, isLoading: sellsLoading } = useZCurveSells(coinId, limit);
  
  const isLoading = purchasesLoading || sellsLoading;
  
  // Combine and sort events by timestamp
  const events = useMemo(() => {
    const allEvents: ActivityEvent[] = [];
    
    if (purchases) {
      purchases.forEach(purchase => {
        allEvents.push({
          type: "BUY",
          timestamp: purchase.timestamp,
          ethAmount: purchase.ethIn,
          tokenAmount: purchase.coinsOut,
          pricePerToken: purchase.pricePerToken,
          maker: purchase.buyer,
          txHash: purchase.txHash,
        });
      });
    }
    
    if (sells) {
      sells.forEach(sell => {
        allEvents.push({
          type: "SELL",
          timestamp: sell.timestamp,
          ethAmount: sell.ethOut,
          tokenAmount: sell.coinsIn,
          pricePerToken: sell.pricePerToken,
          maker: sell.seller,
          txHash: sell.txHash,
        });
      });
    }
    
    // Sort by timestamp descending (newest first)
    return allEvents.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
  }, [purchases, sells]);
  
  // Format price with appropriate precision
  const formatPrice = (price: string) => {
    const priceNum = Number(formatEther(BigInt(price)));
    // Handle very small numbers
    if (priceNum === 0) return "0";
    if (priceNum < 1e-12) return priceNum.toExponential(2);
    if (priceNum < 1e-9) return priceNum.toFixed(12);
    if (priceNum < 1e-6) return priceNum.toFixed(9);
    if (priceNum < 0.01) return priceNum.toFixed(8);
    if (priceNum < 1) return priceNum.toFixed(6);
    return priceNum.toFixed(4);
  };
  
  // Format amount with appropriate precision
  const formatAmount = (amount: string, decimals = 6) => {
    const num = Number(formatEther(BigInt(amount)));
    if (num < 0.000001) return num.toExponential(2);
    if (num < 1) return num.toFixed(decimals);
    if (num < 1000) return num.toFixed(4);
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingLogo className="h-8 w-8" />
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">{t("trade.time", "Time")}</TableHead>
              <TableHead className="w-[80px]">{t("trade.type", "Type")}</TableHead>
              <TableHead className="text-right">{t("trade.eth_amount", "ETH")}</TableHead>
              <TableHead className="text-right">{coinSymbol}</TableHead>
              <TableHead className="text-right">{t("trade.price_per_token", "Price")}</TableHead>
              <TableHead className="text-center">{t("trade.trader", "Trader")}</TableHead>
              <TableHead className="text-center">{t("trade.transaction", "Txn")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  {t("trade.no_activity", "No trading activity yet")}
                </TableCell>
              </TableRow>
            ) : (
              events.map((event, idx) => (
                <TableRow key={`${event.txHash}-${idx}`}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {formatTimeAgo(Number(event.timestamp))}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={event.type === "BUY" ? "default" : "destructive"}
                      className={cn(
                        "font-semibold",
                        event.type === "BUY" 
                          ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                          : "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                      )}
                    >
                      {event.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatAmount(event.ethAmount)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatAmount(event.tokenAmount)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatPrice(event.pricePerToken)} ETH
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <AddressIcon address={event.maker as `0x${string}`} className="h-5 w-5 rounded-full" />
                      <a
                        href={getEtherscanAddressUrl(event.maker)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-xs"
                      >
                        {event.maker.slice(0, 4)}...{event.maker.slice(-4)}
                      </a>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <a
                      href={getEtherscanTxUrl(event.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-xs"
                    >
                      {event.txHash.slice(0, 6)}...
                    </a>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      
      {events.length >= limit && (
        <div className="flex justify-center">
          <button
            onClick={() => setLimit(limit + 10)}
            className="text-sm text-primary hover:underline"
          >
            {t("common.load_more", "Load more")}
          </button>
        </div>
      )}
    </div>
  );
}