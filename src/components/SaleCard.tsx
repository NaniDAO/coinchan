import { formatImageURL } from "@/hooks/metadata";
import { Sale } from "@/hooks/use-zcurve-sales";
import { Link } from "@tanstack/react-router";
import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CreatorDisplay } from "./CreatorDisplay";
import { ZCurveMiniChart } from "./ZCurveMiniChart";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";
import { calculateFundedPercentage } from "./ZCurveSales";
import { ZCURVE_STANDARD_PARAMS } from "@/lib/zCurveHelpers";
import { ApeButton } from "./ApeButton";

/* helper for time left / duration */
function renderTimeInfo(sale: Sale): string {
  if (!sale.deadline) return "→ Unknown";

  const deadline = new Date(Number(sale.deadline) * 1000);
  const now = new Date();

  if (sale.status === "ACTIVE" && deadline > now) {
    const diff = deadline.getTime() - now.getTime();
    const d = Math.floor(diff / 86_400_000);
    const h = Math.floor((diff % 86_400_000) / 3_600_000);
    if (d) return `→ ${d}d ${h}h left`;
    const m = Math.floor((diff % 3_600_000) / 60_000);
    return `→ ${h ? `${h}h ` : ""}${m}m left`;
  }

  if (sale.createdAt) {
    const created = new Date(Number(sale.createdAt) * 1000);
    const days = Math.round((deadline.getTime() - created.getTime()) / 86_400_000);
    if (days === 14) return "→ 2-week sale";
    if (days === 7) return "→ 1-week sale";
    return `→ ${days}-day sale`;
  }

  return "→ Unknown";
}

/**
 * Helper to format coins per ETH
 */
const formatCoinsPerEth = (priceInWei: bigint): string => {
  if (priceInWei === 0n) return "";

  const oneEth = BigInt(1e18);
  // priceInWei is the price per whole token in wei
  // To get tokens per ETH: 1 ETH / price per token
  const tokensPerEth = Number(oneEth) / Number(priceInWei);

  if (tokensPerEth >= 1e9) {
    return `${(tokensPerEth / 1e9).toFixed(2)}B per ETH`;
  } else if (tokensPerEth >= 1e6) {
    return `${(tokensPerEth / 1e6).toFixed(2)}M per ETH`;
  } else if (tokensPerEth >= 1e3) {
    return `${(tokensPerEth / 1e3).toFixed(2)}K per ETH`;
  } else if (tokensPerEth >= 1) {
    return `${tokensPerEth.toFixed(2)} per ETH`;
  } else {
    return `${tokensPerEth.toFixed(6)} per ETH`;
  }
};

/**
 * Nicely formats a price given in wei
 * (uses BigInt internally so we never overflow JS Number)
 */
const formatPrice = (sale: Sale): { price: string; perEth: string } => {
  try {
    // Handle both string and number types for currentPrice
    let priceWei = sale.currentPrice ? BigInt(sale.currentPrice) : 0n;

    if (sale.status === "FINALIZED" && priceWei === 0n) {
      /* Calculate final price from LP amounts if available */
      if (sale.finalization?.ethLp && sale.finalization?.coinLp) {
        const ethLp = BigInt(sale.finalization.ethLp);
        const coinLp = BigInt(sale.finalization.coinLp);
        if (coinLp !== 0n) {
          // Both ethLp and coinLp are in their smallest units (wei and smallest token units with 18 decimals)
          // Price per smallest token unit in wei = ethLp / coinLp
          // To get price per whole token in wei, multiply by 10^18
          priceWei = (ethLp * BigInt(1e18)) / coinLp;
        }
      } else {
        /* Fallback to average price from total raised */
        const tokensSold = BigInt(sale.netSold ?? 0);
        const ethRaised = BigInt(sale.ethEscrow ?? 0);
        if (tokensSold !== 0n) {
          // tokensSold is in smallest units (with 18 decimals)
          // ethRaised is in wei
          // Price per whole token in wei = (ethRaised / tokensSold) * 10^18
          priceWei = (ethRaised * BigInt(1e18)) / tokensSold;
        }
      }
    }

    if (priceWei === 0n) return { price: "0", perEth: "" };

    let priceStr = "";

    // Handle different price ranges with appropriate units
    if (priceWei < 1000n) {
      // Less than 1000 wei - show as wei
      priceStr = `${priceWei.toString()} wei`;
    } else if (priceWei < 1000000000n) {
      // Less than 1 gwei - show as thousands of wei or gwei with decimals
      const gwei = Number(priceWei) / 1e9;
      if (gwei < 0.001) {
        priceStr = `${(Number(priceWei) / 1000).toFixed(1)}K wei`;
      } else {
        priceStr = `${gwei.toFixed(3)} gwei`;
      }
    } else if (priceWei < BigInt(1e15)) {
      // Less than 0.001 ETH - show as gwei
      const gwei = Number(priceWei) / 1e9;
      if (gwei >= 1000000) {
        priceStr = `${(gwei / 1e6).toFixed(3)}M gwei`;
      } else if (gwei >= 1000) {
        priceStr = `${(gwei / 1000).toFixed(3)}K gwei`;
      } else {
        priceStr = `${gwei.toFixed(3)} gwei`;
      }
    } else if (priceWei < BigInt(1e16)) {
      // Less than 0.01 ETH - show as μETH
      const microEth = Number(priceWei) / 1e12;
      priceStr = `${microEth.toFixed(3)} μETH`;
    } else if (priceWei < BigInt(1e18)) {
      // Less than 1 ETH
      const eth = Number(priceWei) / 1e18;
      priceStr = `${eth.toFixed(6)} ETH`;
    } else {
      // 1 ETH or more
      const eth = Number(priceWei) / 1e18;
      priceStr = `${eth.toFixed(4)} ETH`;
    }

    const perEth = formatCoinsPerEth(priceWei);
    return { price: priceStr, perEth };
  } catch (err) {
    console.error("formatPrice()", err, sale);
    return { price: "—", perEth: "" };
  }
};

export const SaleCard = memo(({ sale }: { sale: Sale }) => {
  const { t } = useTranslation();

  /* bail-out if data is incomplete */
  if (!sale?.coinId) return null;

  /* memoised expensive bits with error handling */
  const funded = useMemo(() => {
    try {
      return calculateFundedPercentage(sale);
    } catch (error) {
      console.error("Error calculating funded percentage:", error);
      return 0;
    }
  }, [sale.percentFunded, sale.ethEscrow, sale.ethTarget, sale.status]);
  
  const priceData = useMemo(() => {
    try {
      return formatPrice(sale);
    } catch (error) {
      console.error("Error formatting price:", error);
      return { price: "—", perEth: "" };
    }
  }, [sale.currentPrice, sale.status, sale.finalization, sale.netSold, sale.ethEscrow]);
  
  const wallets = useMemo(() => {
    try {
      const buyers = sale.purchases?.items?.map((p) => p.buyer) ?? [];
      const sellers = sale.sells?.items?.map((s) => s.seller) ?? [];
      return new Set([...buyers, ...sellers]).size;
    } catch (err) {
      console.error("wallet count", err);
      return 0;
    }
  }, [sale.purchases, sale.sells]);

  const isStandard =
    sale.ethTarget === ZCURVE_STANDARD_PARAMS.ETH_TARGET.toString() &&
    sale.saleCap === ZCURVE_STANDARD_PARAMS.SALE_CAP.toString() &&
    sale.quadCap === ZCURVE_STANDARD_PARAMS.QUAD_CAP.toString();

  return (
    <Link 
      to="/c/$coinId" 
      params={{ coinId: String(sale.coinId) }}
      className="block rounded focus:outline-none focus:ring-2 focus:ring-primary/50"
      aria-label={`View sale of ${sale.coin?.name ?? "coin"}`}
    >
      <div
          className={cn(
            "relative overflow-hidden border p-3 transition-all",
            "bg-card hover:bg-accent/5 hover:shadow-lg cursor-pointer",
            "border-border hover:border-primary active:border-primary/80 active:scale-[0.99]",
            sale.status === "FINALIZED" ? "bg-amber-50/5 dark:bg-amber-900/5" : "bg-green-50/5  dark:bg-green-900/5",
          )}
        >
          {/* funding background tint */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                sale.status === "FINALIZED"
                  ? "linear-gradient(to right,rgba(245,158,11,.1) 0%,rgba(245,158,11,.05) 100%)"
                  : `linear-gradient(to right,rgba(34,197,94,.1) 0%,rgba(34,197,94,.1) ${funded}%,transparent ${funded}%)`,
            }}
          />

          <div className="relative z-10 flex items-start gap-4">
            {/* image / fallback */}
            <div className="flex-shrink-0">
              <div className="h-8 w-8 overflow-hidden rounded-full border border-border bg-muted">
                {sale.coin?.imageUrl ? (
                  <img
                    src={formatImageURL(sale.coin.imageUrl)}
                    alt={sale.coin?.name ?? "coin"}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      const el = e.target as HTMLImageElement;
                      el.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-bold text-muted-foreground">
                    {sale.coin?.symbol?.[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
              </div>
            </div>

            {/* text block */}
            <div className="flex-1 text-sm font-mono">
              <div className="font-bold transition-colors group-hover:text-primary">
                {sale.coin?.name ?? "Unknown"} ({sale.coin?.symbol ?? "???"})
              </div>
              <div className="mt-1 line-clamp-2 text-muted-foreground">
                {sale.coin?.description ?? t("sale.no_desc", "No description")}
              </div>

              <div className="mt-2 space-y-2 text-[11px]">
                {/* price / funding */}
                <div className="grid grid-cols-2 gap-x-3">
                  <div>
                    <span className="text-muted-foreground">
                      {sale.status === "FINALIZED"
                        ? t("sale.final_price_label", "Final Price")
                        : t("sale.price_label", "Current Price")}
                    </span>
                    <div className="font-medium">{priceData.price}</div>
                    {priceData.perEth && <div className="text-[10px] text-muted-foreground">{priceData.perEth}</div>}
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t("sale.funded_label", "Funded")}</span>
                    <div className="font-medium">
                      {funded.toFixed(1)}%{isStandard && " of 10 ETH"}
                    </div>
                  </div>
                </div>

                {/* trade activity */}
                <div className="border-t border-border/30 pt-1">
                  <span className="font-medium">
                    {t("sale.buys_label", "Buys")} {sale.purchases?.totalCount ?? 0} | {t("sale.sells_label", "Sells")}{" "}
                    {sale.sells?.totalCount ?? 0} | {t("sale.wallets_label", "Wallets")} {wallets}
                  </span>
                </div>

                {/* creator */}
                <div className="flex items-center gap-1 border-t border-border/30 pt-1">
                  <span>{t("sale.creator_label", "Creator")}:</span>
                  {sale.creator ? (
                    <CreatorDisplay address={sale.creator} size="sm" showLabel={false} />
                  ) : (
                    <span className="text-muted-foreground">{t("common.unknown", "Unknown")}</span>
                  )}
                </div>
              </div>
            </div>

            {/* mini-chart */}
            <div className="w-32 flex-shrink-0">
              <div className="rounded-sm border border-border bg-muted/20 p-1">
                <ZCurveMiniChart sale={sale} className="h-16 w-full" />
              </div>
            </div>

            {/* status & time info */}
            <div className="text-right text-xs font-mono space-y-2">
              <Badge
                className={cn(
                  "border border-border px-2 py-1",
                  sale.status === "ACTIVE"
                    ? "bg-green-500 text-white"
                    : sale.status === "FINALIZED"
                      ? "bg-amber-500 text-white"
                      : "bg-gray-200 text-gray-600",
                )}
              >
                {sale.status}
              </Badge>

              <div className="text-[11px] text-muted-foreground">
                <div>{sale.createdAt ? new Date(Number(sale.createdAt) * 1000).toLocaleDateString() : "Unknown"}</div>
                <div>{renderTimeInfo(sale)}</div>
              </div>
              
              {/* Ape button for active sales */}
              {sale.status === "ACTIVE" && (
                <div onClick={(e) => e.preventDefault()}>
                  <ApeButton 
                    coinId={sale.coinId.toString()} 
                    coinSymbol={sale.coin?.symbol}
                    className="w-full"
                  />
                </div>
              )}
            </div>
          </div>

          {/* bottom progress bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-border/20">
            <div
              className={cn(
                "h-full transition-all duration-300",
                sale.status === "FINALIZED" ? "bg-amber-500/50" : "bg-green-500/50",
              )}
              style={{ width: `${Math.min(funded, 100)}%` }}
            />
          </div>
        </div>
    </Link>
  );
});

SaleCard.displayName = "SaleCard";
