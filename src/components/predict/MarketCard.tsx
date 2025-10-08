import React, { useState, useEffect } from "react";
import { formatEther } from "viem";
import {
  useEnsName,
  useReadContract,
  useBytecode,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
} from "wagmi";
import { mainnet } from "wagmi/chains";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TradeModal } from "./TradeModal";
import { MarketCountdown } from "./MarketCountdown";
import {
  PredictionMarketAddress,
  PredictionMarketAbi,
} from "@/constants/PredictionMarket";
import { ExternalLink, BadgeCheck } from "lucide-react";
import { formatImageURL } from "@/hooks/metadata";
import { isTrustedResolver } from "@/constants/TrustedResolvers";

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
  userYesBalance?: bigint;
  userNoBalance?: bigint;
  userClaimable?: bigint;
  onClaimSuccess?: () => void;
}

export const MarketCard: React.FC<MarketCardProps> = ({
  marketId,
  yesSupply,
  noSupply,
  resolver,
  resolved,
  outcome,
  pot,
  payoutPerShare,
  description,
  userYesBalance = 0n,
  userNoBalance = 0n,
  userClaimable = 0n,
  onClaimSuccess,
}) => {
  const [metadata, setMetadata] = useState<MarketMetadata | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const { address } = useAccount();

  const { writeContract, data: claimHash } = useWriteContract();
  const { isSuccess: isClaimSuccess } = useWaitForTransactionReceipt({
    hash: claimHash,
  });

  const { data: ensName } = useEnsName({
    address: resolver as `0x${string}`,
    chainId: mainnet.id,
  });

  // Check if resolver is a contract (oracle)
  const { data: bytecode } = useBytecode({
    address: resolver as `0x${string}`,
    chainId: mainnet.id,
  });

  const isOracle = bytecode && bytecode !== "0x";
  const isTrusted = isTrustedResolver(resolver);

  // Fetch market details to get closing time
  const { data: marketData } = useReadContract({
    address: PredictionMarketAddress as `0x${string}`,
    abi: PredictionMarketAbi,
    functionName: "markets",
    args: [marketId],
  });

  const closingTime = marketData ? Number(marketData[4]) : undefined;
  const isClosed = closingTime ? Date.now() / 1000 >= closingTime : false;
  const isTradingDisabled = resolved || isClosed;

  const hasPosition = userYesBalance > 0n || userNoBalance > 0n;
  const canClaim = resolved && userClaimable > 0n;

  const handleClaim = () => {
    if (!address) return;
    writeContract({
      address: PredictionMarketAddress as `0x${string}`,
      abi: PredictionMarketAbi,
      functionName: "claim",
      args: [marketId, address],
    });
  };

  useEffect(() => {
    if (isClaimSuccess && onClaimSuccess) {
      onClaimSuccess();
    }
  }, [isClaimSuccess, onClaimSuccess]);

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        if (!description) return;

        let url = formatImageURL(description);

        const response = await fetch(url);
        const data = await response.json();

        let imageUrl = formatImageURL(data.image || "");

        // Check if the image URL might be another JSON metadata file or IPFS directory
        // This happens with some NFT metadata standards where image field points to more metadata
        if (imageUrl && !imageUrl.match(/\.(jpg|jpeg|png|gif|svg|webp)$/i)) {
          try {
            const imageResponse = await fetch(imageUrl);
            const contentType = imageResponse.headers.get("content-type");

            // Check if it's JSON metadata
            if (contentType && contentType.includes("application/json")) {
              const imageData = await imageResponse.json();

              if (imageData.image) {
                imageUrl = formatImageURL(imageData.image);
              }
            }
            // Check if it's an IPFS directory listing (HTML)
            else if (contentType && contentType.includes("text/html")) {
              const html = await imageResponse.text();

              // Extract all href values that are not data URIs, parent directories, or the current directory
              const hrefMatches = html.matchAll(/href="([^"]+)"/gi);
              const files: string[] = [];

              for (const match of hrefMatches) {
                const href = match[1];
                // Skip data URIs, parent directory (..), current directory (.), directories (ending with /), and full URLs
                if (!href.startsWith('data:') &&
                    !href.startsWith('http://') &&
                    !href.startsWith('https://') &&
                    href !== '..' &&
                    href !== '.' &&
                    !href.endsWith('/')) {
                  files.push(href);
                }
              }

              let filePath = null;

              // First try with common image extensions
              filePath = files.find(f => /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(f));

              // If no match, try to find files with "image" in the name (common pattern)
              if (!filePath) {
                filePath = files.find(f => /image/i.test(f));
              }

              // If still no match, take the first file
              if (!filePath && files.length > 0) {
                filePath = files[0];
              }

              if (filePath) {
                // Check if the path is absolute (starts with /)
                if (filePath.startsWith('/')) {
                  // Use the gateway base URL + the absolute path
                  const gatewayBase = imageUrl.split('/ipfs/')[0];
                  imageUrl = gatewayBase + filePath;
                } else {
                  // Relative path, append to the directory URL
                  imageUrl = imageUrl.endsWith('/') ? imageUrl + filePath : imageUrl + '/' + filePath;
                }
              }
            }
          } catch (nestedError) {
            // If fetching as JSON fails, the URL is likely a direct image, use it as-is
          }
        }

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
              <p className="text-xs text-muted-foreground">
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
            {hasPosition && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded p-2 space-y-1">
                <div className="flex justify-between">
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    Your Position:
                  </span>
                </div>
                {userYesBalance > 0n && (
                  <div className="flex justify-between">
                    <span>YES shares:</span>
                    <span className="font-mono">
                      {Number(formatEther(userYesBalance)).toFixed(4)}
                    </span>
                  </div>
                )}
                {userNoBalance > 0n && (
                  <div className="flex justify-between">
                    <span>NO shares:</span>
                    <span className="font-mono">
                      {Number(formatEther(userNoBalance)).toFixed(4)}
                    </span>
                  </div>
                )}
                {canClaim && (
                  <div className="flex justify-between">
                    <span className="font-semibold">Claimable:</span>
                    <span className="font-mono font-semibold text-green-600 dark:text-green-400">
                      {Number(formatEther(userClaimable)).toFixed(4)} wstETH
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-between">
              <span>Total Pool:</span>
              <span className="font-mono">
                {Number(formatEther(pot)).toFixed(4)} wstETH
              </span>
            </div>
            {resolved && payoutPerShare > 0n && (
              <>
                <div className="flex justify-between">
                  <span>Winning Side:</span>
                  <span className="font-semibold">
                    {outcome ? "YES" : "NO"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Winning Shares:</span>
                  <span className="font-mono">
                    {Number(formatEther(outcome ? yesSupply : noSupply)).toFixed(
                      4
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Payout Per Share:</span>
                  <span className="font-mono">
                    {Number(formatEther(payoutPerShare)).toFixed(4)} wstETH
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between items-center">
              <span>Resolver:</span>
              <div className="flex items-center gap-1">
                <a
                  href={`https://etherscan.io/address/${resolver}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-primary transition-colors font-mono"
                >
                  {ensName || `${resolver.slice(0, 6)}...${resolver.slice(-4)}`}
                  <ExternalLink className="h-3 w-3" />
                </a>
                {isTrusted && (
                  <BadgeCheck className="h-4 w-4 text-blue-500 shrink-0" />
                )}
                {isOracle && (
                  <Badge variant="outline" className="text-xs">
                    Oracle
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {canClaim ? (
            <Button
              onClick={handleClaim}
              className="w-full"
              size="sm"
              variant="default"
            >
              Claim {Number(formatEther(userClaimable)).toFixed(4)} wstETH
            </Button>
          ) : (
            <Button
              onClick={() => setIsModalOpen(true)}
              className="w-full"
              size="sm"
              disabled={isTradingDisabled}
            >
              {resolved
                ? "Market Resolved"
                : isClosed
                  ? "Market Closed"
                  : "Trade"}
            </Button>
          )}
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
