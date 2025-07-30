import { memo } from "react";
import { Link } from "@tanstack/react-router";
import { formatImageURL } from "@/hooks/metadata";
import { formatEther } from "viem";
import { useZCurveSaleSummary } from "@/hooks/use-zcurve-sale";
import { Sale } from "@/hooks/use-zcurve-sales";
import { zeroAddress } from "viem";

interface CoinSaleReelItemProps {
  sale: Sale;
  index: number;
  visibleIndex: number;
}

export const CoinSaleReelItem = memo(({ sale, index, visibleIndex }: CoinSaleReelItemProps) => {
  // Fetch real-time on-chain data for active sales
  const { data: onchainData } = useZCurveSaleSummary(
    sale.status === "ACTIVE" ? sale.coinId : undefined,
    zeroAddress
  );

  // Use on-chain data if available, otherwise fall back to indexer data
  const ethEscrow = onchainData?.ethEscrow !== undefined 
    ? BigInt(onchainData.ethEscrow) 
    : BigInt(sale.ethEscrow || 0);
  
  const ethTarget = onchainData?.ethTarget !== undefined 
    ? BigInt(onchainData.ethTarget) 
    : BigInt(sale.ethTarget || 0);

  // Calculate funding percentage using the same formula as the coin page
  const fundedPercentage = ethTarget > 0n
    ? Number((ethEscrow * 10000n) / ethTarget) / 100
    : 0;

  return (
    <Link
      key={sale.coinId}
      to="/c/$coinId"
      params={{ coinId: sale.coinId.toString() }}
      className={`absolute inset-0 transition-all duration-1000 ${
        index === visibleIndex 
          ? 'opacity-100 scale-100 z-10' 
          : 'opacity-0 scale-95 z-0'
      }`}
    >
      <div className="relative w-full h-full">
        {/* Main coin image */}
        <div className="w-full h-full overflow-hidden border-2 border-border hover:border-primary transition-all duration-300 bg-background transform hover:scale-105 hover:rotate-3">
          <img
            src={formatImageURL(sale.coin!.imageUrl!)}
            alt={sale.coin?.symbol || "Coin"}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          
          {/* Status indicator */}
          {sale.status === "ACTIVE" && (
            <div className="absolute top-2 right-2 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
          )}
          
          {/* Progress bar for active sales */}
          {sale.status === "ACTIVE" && index === visibleIndex && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-background/80">
              <div 
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${fundedPercentage}%` }}
              />
            </div>
          )}
        </div>
        
        {/* Hover overlay with info */}
        <div className="absolute inset-0 bg-background/95 opacity-0 hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center p-2">
          <div className="text-base font-bold">{sale.coin?.symbol}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {sale.status === "ACTIVE" 
              ? `${fundedPercentage.toFixed(1)}% funded` 
              : "Finalized"}
          </div>
          {(sale.status === "ACTIVE" && ethEscrow > 0n) ? (
            <div className="text-xs mt-1 font-mono">
              {parseFloat(formatEther(ethEscrow)).toFixed(3)} ETH raised
            </div>
          ) : sale.status === "FINALIZED" && sale.finalization?.ethLp ? (
            <div className="text-xs mt-1 font-mono">
              {parseFloat(formatEther(BigInt(sale.finalization.ethLp))).toFixed(3)} ETH liquidity
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );
});

CoinSaleReelItem.displayName = "CoinSaleReelItem";