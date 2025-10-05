import React, { useState, useEffect } from "react";
import { formatEther } from "viem";
import { useEnsName, useReadContract } from "wagmi";
import { mainnet } from "wagmi/chains";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TradeModal } from "./TradeModal";
import { MarketCountdown } from "./MarketCountdown";
import {
  PredictionMarketAddress,
  PredictionMarketAbi,
} from "@/constants/PredictionMarket";
import { ExternalLink } from "lucide-react";
import { formatImageURL } from "@/hooks/metadata";

interface MarketMetadata {
  name: string;
  symbol: string;
  description?: string;
  image: string;
}

interface MarketCardProps {
  marketId: bigint;
  yesSupply: bigint;
  noSupply: bigint;
  resolver: string;
  resolved: boolean;
  outcome: boolean;
  pot: bigint;
  payoutPerShare: bigint;
  description: string;
  closingTime?: number;
}

export const MarketCard: React.FC<MarketCardProps> = ({
  marketId,
  yesSupply,
  noSupply,
  resolver,
  resolved,
  outcome,
  pot,
  description,
}) => {
  const [metadata, setMetadata] = useState<MarketMetadata | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

  const { data: ensName } = useEnsName({
    address: resolver as `0x${string}`,
    chainId: mainnet.id,
  });

  // Fetch market details to get closing time
  const { data: marketData } = useReadContract({
    address: PredictionMarketAddress as `0x${string}`,
    abi: PredictionMarketAbi,
    functionName: "markets",
    args: [marketId],
  });

  const closingTime = marketData ? Number(marketData[4]) : undefined;

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        if (!description) return;

        let url = formatImageURL(description);

        const response = await fetch(url);
        const data = await response.json();

        let imageUrl = formatImageURL(data.image || "");

        setMetadata({
          name: data.name || "Unnamed Market",
          symbol: data.symbol || "",
          description: data.description || "",
          image: imageUrl,
        });
      } catch (error) {
        console.error("Failed to fetch metadata:", error);
        setMetadata({
          name: "Market #" + marketId.toString(),
          symbol: "",
          description: "",
          image: "",
        });
      }
    };

    fetchMetadata();
  }, [description, marketId]);

  if (!metadata) {
    return (
      <div className="bg-card border border-border rounded-lg p-4 animate-pulse">
        <div className="h-32 bg-muted rounded-lg mb-3" />
        <div className="h-4 bg-muted rounded w-3/4 mb-2" />
        <div className="h-3 bg-muted rounded w-1/2" />
      </div>
    );
  }

  const totalSupply = yesSupply + noSupply;
  const yesPercent =
    totalSupply > 0n ? Number((yesSupply * 100n) / totalSupply) : 50;
  const noPercent = 100 - yesPercent;

  return (
    <>
      <div className="bg-card border border-border rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
        {metadata.image && !imageError ? (
          <img
            src={metadata.image}
            alt={metadata.name}
            className="w-full h-32 object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-32 bg-gradient-to-br from-purple-400 via-pink-400 to-blue-400 flex items-center justify-center">
            <span className="text-4xl">🔮</span>
          </div>
        )}

        <div className="p-4 space-y-3">
          <div>
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="font-bold text-sm line-clamp-2">
                {metadata.name}
              </h3>
              {resolved && (
                <Badge
                  variant={outcome ? "default" : "secondary"}
                  className="shrink-0"
                >
                  {outcome ? "YES" : "NO"}
                </Badge>
              )}
            </div>
            {metadata.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {metadata.description}
              </p>
            )}
          </div>

          {closingTime && (
            <MarketCountdown closingTime={closingTime} resolved={resolved} />
          )}

          {!resolved && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-green-600 dark:text-green-400">
                  YES {yesPercent.toFixed(1)}%
                </span>
                <span className="text-red-600 dark:text-red-400">
                  NO {noPercent.toFixed(1)}%
                </span>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                <div
                  className="bg-green-600 dark:bg-green-400"
                  style={{ width: `${yesPercent}%` }}
                />
                <div
                  className="bg-red-600 dark:bg-red-400"
                  style={{ width: `${noPercent}%` }}
                />
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between">
              <span>Total Pool:</span>
              <span className="font-mono">
                {Number(formatEther(pot)).toFixed(4)} wstETH
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Resolver:</span>
              <a
                href={`https://etherscan.io/address/${resolver}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-primary transition-colors font-mono"
              >
                {ensName || `${resolver.slice(0, 6)}...${resolver.slice(-4)}`}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          <Button
            onClick={() => setIsModalOpen(true)}
            className="w-full"
            size="sm"
            disabled={resolved}
          >
            {resolved ? "Market Resolved" : "Trade"}
          </Button>
        </div>
      </div>

      <TradeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        marketId={marketId}
        marketName={metadata.name}
        yesSupply={yesSupply}
        noSupply={noSupply}
      />
    </>
  );
};
