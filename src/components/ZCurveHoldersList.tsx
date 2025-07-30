import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatEther } from "viem";
import { useEnsName } from "wagmi";
import { mainnet } from "viem/chains";
import { useZCurvePurchases, useZCurveSells } from "@/hooks/use-zcurve-sale";
import { AddressIcon } from "./AddressIcon";
import { LoadingLogo } from "./ui/loading-logo";
import { getEtherscanAddressUrl } from "@/lib/explorer";
import { ExternalLink } from "lucide-react";

interface ZCurveHoldersListProps {
  coinId: string;
  coinSymbol: string;
}

interface Holder {
  address: string;
  balance: bigint;
  percentOfSupply: number;
  buyCount: number;
  sellCount: number;
}

// Component to display a single holder with ENS resolution
function HolderRow({ holder, rank, coinSymbol }: { holder: Holder; rank: number; coinSymbol: string }) {
  const { data: ensName } = useEnsName({
    address: holder.address as `0x${string}`,
    chainId: mainnet.id,
  });

  const formatBalance = (balance: bigint): string => {
    const num = Number(formatEther(balance));
    if (num < 0.000001) return num.toExponential(2);
    if (num < 1) return num.toFixed(4);
    if (num < 1000) return num.toFixed(2);
    if (num < 1000000) return Math.round(num).toLocaleString();
    return `${(num / 1000000).toFixed(1)}M`;
  };

  return (
    <div className="flex items-center gap-2 sm:gap-3 py-2 px-2 sm:px-3 hover:bg-muted/50 transition-colors">
      {/* Rank */}
      <div className="w-6 sm:w-8 text-center font-mono text-xs sm:text-sm text-muted-foreground">
        {rank}
      </div>

      {/* Address with icon */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
        <AddressIcon address={holder.address as `0x${string}`} className="h-5 w-5 sm:h-6 sm:w-6 rounded-full flex-shrink-0" />
        <a
          href={getEtherscanAddressUrl(holder.address)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs sm:text-sm font-mono hover:underline text-foreground truncate flex items-center gap-1 group"
          title="View on Etherscan"
        >
          <span className="truncate">{ensName || `${holder.address.slice(0, 4)}...${holder.address.slice(-3)}`}</span>
          <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 hidden sm:inline" />
        </a>
      </div>

      {/* Balance and percentage - stacked on mobile */}
      <div className="text-right">
        <div className="font-mono text-xs sm:text-sm text-foreground">
          {formatBalance(holder.balance)}
          <span className="hidden sm:inline"> {coinSymbol}</span>
        </div>
        <div className="text-[10px] sm:text-xs text-muted-foreground">
          {holder.percentOfSupply.toFixed(1)}%
        </div>
      </div>

      {/* Trade counts - more compact on mobile */}
      <div className="flex gap-1 sm:gap-2 text-[10px] sm:text-xs">
        <span className="text-green-600 dark:text-green-400">
          {holder.buyCount}<span className="hidden sm:inline">B</span>
        </span>
        <span className="text-muted-foreground hidden sm:inline">/</span>
        <span className="text-red-600 dark:text-red-400">
          {holder.sellCount}<span className="hidden sm:inline">S</span>
        </span>
      </div>
    </div>
  );
}

export function ZCurveHoldersList({ coinId, coinSymbol }: ZCurveHoldersListProps) {
  const { t } = useTranslation();
  
  // Fetch all purchases and sells (increase limit to get all holders)
  const { data: purchases, isLoading: purchasesLoading } = useZCurvePurchases(coinId, 1000);
  const { data: sells, isLoading: sellsLoading } = useZCurveSells(coinId, 1000);

  const isLoading = purchasesLoading || sellsLoading;

  // Calculate holder balances from buy/sell events
  const holders = useMemo(() => {
    const balanceMap = new Map<string, { 
      balance: bigint, 
      buyCount: number, 
      sellCount: number 
    }>();

    // Process purchases (adds to balance)
    if (purchases) {
      purchases.forEach((purchase) => {
        const buyer = purchase.buyer.toLowerCase();
        const current = balanceMap.get(buyer) || { balance: 0n, buyCount: 0, sellCount: 0 };
        balanceMap.set(buyer, {
          balance: current.balance + BigInt(purchase.coinsOut),
          buyCount: current.buyCount + 1,
          sellCount: current.sellCount,
        });
      });
    }

    // Process sells (subtracts from balance)
    if (sells) {
      sells.forEach((sell) => {
        const seller = sell.seller.toLowerCase();
        const current = balanceMap.get(seller) || { balance: 0n, buyCount: 0, sellCount: 0 };
        balanceMap.set(seller, {
          balance: current.balance - BigInt(sell.coinsIn),
          buyCount: current.buyCount,
          sellCount: current.sellCount + 1,
        });
      });
    }

    // Convert to array and filter out zero balances
    const holdersArray: Holder[] = [];
    let totalSupply = 0n;

    // First pass: calculate total supply and create holder objects
    balanceMap.forEach((data, address) => {
      if (data.balance > 0n) {
        totalSupply += data.balance;
        holdersArray.push({
          address,
          balance: data.balance,
          percentOfSupply: 0, // Will calculate after we know total
          buyCount: data.buyCount,
          sellCount: data.sellCount,
        });
      }
    });

    // Second pass: calculate percentage of supply
    holdersArray.forEach((holder) => {
      holder.percentOfSupply = totalSupply > 0n 
        ? (Number(holder.balance) / Number(totalSupply)) * 100 
        : 0;
    });

    // Sort by balance descending
    return holdersArray.sort((a, b) => {
      if (a.balance > b.balance) return -1;
      if (a.balance < b.balance) return 1;
      return 0;
    });
  }, [purchases, sells]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6 sm:py-8">
        <LoadingLogo className="h-5 w-5 sm:h-6 sm:w-6" />
      </div>
    );
  }

  if (holders.length === 0) {
    return (
      <div className="text-center py-6 sm:py-8 text-xs sm:text-sm text-muted-foreground">
        {t("holders.no_holders", "No holders yet")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between px-2 sm:px-3 py-2 border-b border-border">
        <h4 className="text-xs sm:text-sm font-semibold text-foreground">
          {t("holders.title", "Holders")} ({holders.length})
        </h4>
        <div className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">
          {t("holders.legend", "B=Buys, S=Sells")}
        </div>
      </div>

      {/* Column headers for mobile clarity */}
      <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-1 text-[10px] sm:text-xs text-muted-foreground border-b border-border sm:hidden">
        <div className="w-6 text-center">#</div>
        <div className="flex-1">Address</div>
        <div className="text-right">Balance</div>
        <div className="text-center w-12">Trades</div>
      </div>

      {/* Holders list */}
      <div className="max-h-[300px] sm:max-h-[400px] overflow-y-auto">
        {holders.map((holder, index) => (
          <HolderRow
            key={holder.address}
            holder={holder}
            rank={index + 1}
            coinSymbol={coinSymbol}
          />
        ))}
      </div>

      {/* Summary */}
      <div className="px-2 sm:px-3 py-2 border-t border-border text-[10px] sm:text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>{t("holders.unique_holders", "Unique holders")}</span>
          <span className="font-mono">{holders.length}</span>
        </div>
        <div className="flex justify-between mt-1">
          <span>{t("holders.total_trades", "Total trades")}</span>
          <span className="font-mono">
            {(purchases?.length || 0) + (sells?.length || 0)}
          </span>
        </div>
      </div>
    </div>
  );
}