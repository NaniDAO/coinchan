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
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TradeModal } from "./TradeModal";
import { MarketCountdown } from "./MarketCountdown";
import { ResolverControls } from "./ResolverControls";
import { PredictionMarketAddress, PredictionMarketAbi } from "@/constants/PredictionMarket";
import { PredictionAMMAbi } from "@/constants/PredictionMarketAMM";
import { ExternalLink, BadgeCheck, ArrowUpRight } from "lucide-react";
import { formatImageURL } from "@/hooks/metadata";
import { isTrustedResolver } from "@/constants/TrustedResolvers";
import ReactMarkdown from "react-markdown";

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
  marketType?: "parimutuel" | "amm";
  contractAddress?: `0x${string}`;
  rYes?: bigint;
  rNo?: bigint;
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
  marketType = "parimutuel",
  contractAddress = PredictionMarketAddress,
  rYes,
  rNo,
  onClaimSuccess,
}) => {
  const [metadata, setMetadata] = useState<MarketMetadata | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const { address } = useAccount();

  const { writeContract, data: claimHash, error: claimError } = useWriteContract();
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

  // Fetch market details to get closing time and canAccelerateClosing
  const { data: marketData, refetch: refetchMarketData } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: marketType === "amm" ? PredictionAMMAbi : PredictionMarketAbi,
    functionName: "markets",
    args: [marketId],
  });

  const closingTime = marketData ? Number(marketData[4]) : undefined;
  const canAccelerateClosing = marketData ? Boolean(marketData[5]) : false;
  const isClosed = closingTime ? Date.now() / 1000 >= closingTime : false;
  const isTradingDisabled = resolved || isClosed;

  const hasPosition = userYesBalance > 0n || userNoBalance > 0n;
  const canClaim = resolved && userClaimable > 0n;

  // Calculate NO token ID for AMM markets (YES ID = marketId, NO ID = marketId | (1 << 255))
  const getNoTokenId = (yesId: bigint): bigint => {
    return yesId | (1n << 255n);
  };

  // Generate ZAMM swap URL for AMM markets
  const getZammUrl = (): string => {
    const ammContractAddress = "0x000000000088B4B43A69f8CDa34d93eD1d6f1431";
    const yesId = marketId.toString();
    const noId = getNoTokenId(marketId).toString();
    return `https://www.zamm.finance/swap?tokenA=${ammContractAddress}&idA=${encodeURIComponent(yesId)}&tokenB=${ammContractAddress}&idB=${encodeURIComponent(noId)}`;
  };

  const handleClaim = () => {
    if (!address) {
      toast.error("Please connect your wallet");
      return;
    }
    writeContract({
      address: contractAddress as `0x${string}`,
      abi: marketType === "amm" ? PredictionAMMAbi : PredictionMarketAbi,
      functionName: "claim",
      args: [marketId, address],
    });
  };

  useEffect(() => {
    if (isClaimSuccess && onClaimSuccess) {
      toast.success("Claim successful!");
      onClaimSuccess();
    }
  }, [isClaimSuccess, onClaimSuccess]);

  useEffect(() => {
    if (claimError) {
      // Handle wallet rejection gracefully
      if ((claimError as any)?.code === 4001 || (claimError as any)?.code === "ACTION_REJECTED") {
        toast.info("Transaction cancelled");
        return;
      }

      // Handle user rejection messages
      const errorMessage = (claimError as any)?.shortMessage ?? claimError?.message ?? "";
      if (
        errorMessage.toLowerCase().includes("user rejected") ||
        errorMessage.toLowerCase().includes("user denied") ||
        errorMessage.toLowerCase().includes("user cancelled") ||
        errorMessage.toLowerCase().includes("rejected by user")
      ) {
        toast.info("Transaction cancelled");
        return;
      }

      // Other errors
      toast.error(errorMessage || "Claim failed");
    }
  }, [claimError]);

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
                if (
                  !href.startsWith("data:") &&
                  !href.startsWith("http://") &&
                  !href.startsWith("https://") &&
                  href !== ".." &&
                  href !== "." &&
                  !href.endsWith("/")
                ) {
                  files.push(href);
                }
              }

              let filePath = null;

              // First try with common image extensions
              filePath = files.find((f) => /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(f));

              // If no match, try to find files with "image" in the name (common pattern)
              if (!filePath) {
                filePath = files.find((f) => /image/i.test(f));
              }

              // If still no match, take the first file
              if (!filePath && files.length > 0) {
                filePath = files[0];
              }

              if (filePath) {
                // Check if the path is absolute (starts with /)
                if (filePath.startsWith("/")) {
                  // Use the gateway base URL + the absolute path
                  const gatewayBase = imageUrl.split("/ipfs/")[0];
                  imageUrl = gatewayBase + filePath;
                } else {
                  // Relative path, append to the directory URL
                  imageUrl = imageUrl.endsWith("/") ? imageUrl + filePath : imageUrl + "/" + filePath;
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

  // For AMM markets, use pool reserves for odds; for parimutuel, use total supply
  const useYes = marketType === "amm" && rYes !== undefined ? rYes : yesSupply;
  const useNo = marketType === "amm" && rNo !== undefined ? rNo : noSupply;

  const totalSupply = useYes + useNo;
  const yesPercent = totalSupply > 0n ? Number((useYes * 100n) / totalSupply) : 50;
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
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-sm line-clamp-2">{metadata.name}</h3>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    marketType === "amm"
                      ? "border-blue-500 text-blue-600 dark:text-blue-400"
                      : "border-purple-500 text-purple-600 dark:text-purple-400"
                  }`}
                >
                  {marketType === "amm" ? "Live Bets (AMM)" : "Pari-Mutuel"}
                </Badge>
              </div>
              {resolved && (
                <Badge
                  className={`shrink-0 ${
                    outcome
                      ? "bg-green-600 dark:bg-green-500 text-white hover:bg-green-700"
                      : "bg-red-600 dark:bg-red-500 text-white hover:bg-red-700"
                  }`}
                >
                  {outcome ? "YES" : "NO"}
                </Badge>
              )}
            </div>
            {metadata.description && (
              <div>
                <div
                  className={`text-xs text-muted-foreground markdown-content transition-all ${
                    isDescriptionExpanded ? "max-h-96 overflow-y-auto" : "line-clamp-3"
                  }`}
                >
                  <ReactMarkdown
                    components={{
                      // Customize rendering to fit card design
                      p: ({ children }: { children?: React.ReactNode }) => <p className="mb-1 last:mb-0">{children}</p>,
                      a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {children}
                        </a>
                      ),
                      strong: ({ children }: { children?: React.ReactNode }) => (
                        <strong className="font-semibold text-foreground">{children}</strong>
                      ),
                      em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
                      code: ({ children }: { children?: React.ReactNode }) => (
                        <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{children}</code>
                      ),
                      ul: ({ children }: { children?: React.ReactNode }) => (
                        <ul className="list-disc list-inside space-y-0.5">{children}</ul>
                      ),
                      ol: ({ children }: { children?: React.ReactNode }) => (
                        <ol className="list-decimal list-inside space-y-0.5">{children}</ol>
                      ),
                      li: ({ children }: { children?: React.ReactNode }) => <li className="text-xs">{children}</li>,
                      h1: ({ children }: { children?: React.ReactNode }) => (
                        <h1 className="text-base font-bold mt-2 mb-1">{children}</h1>
                      ),
                      h2: ({ children }: { children?: React.ReactNode }) => (
                        <h2 className="text-sm font-bold mt-2 mb-1">{children}</h2>
                      ),
                      h3: ({ children }: { children?: React.ReactNode }) => (
                        <h3 className="text-xs font-semibold mt-1 mb-0.5">{children}</h3>
                      ),
                      blockquote: ({ children }: { children?: React.ReactNode }) => (
                        <blockquote className="border-l-2 border-primary pl-2 italic my-1">{children}</blockquote>
                      ),
                    }}
                  >
                    {metadata.description}
                  </ReactMarkdown>
                </div>
                <button
                  onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                  className="text-xs text-primary hover:underline mt-1 focus:outline-none"
                >
                  {isDescriptionExpanded ? "Show less" : "Read more..."}
                </button>
              </div>
            )}
          </div>

          {closingTime && <MarketCountdown closingTime={closingTime} resolved={resolved} />}

          {!resolved && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-green-600 dark:text-green-400">YES {yesPercent.toFixed(2)}%</span>
                <span className="text-red-600 dark:text-red-400">NO {noPercent.toFixed(2)}%</span>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                <div className="bg-green-600 dark:bg-green-400" style={{ width: `${yesPercent}%` }} />
                <div className="bg-red-600 dark:bg-red-400" style={{ width: `${noPercent}%` }} />
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            {hasPosition && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded p-2 space-y-1">
                <div className="flex justify-between">
                  <span className="font-semibold text-blue-600 dark:text-blue-400">Your Position:</span>
                </div>
                {userYesBalance > 0n && (
                  <div className="flex justify-between">
                    <span>YES shares:</span>
                    <span className="font-mono">{Number(formatEther(userYesBalance)).toFixed(4)}</span>
                  </div>
                )}
                {userNoBalance > 0n && (
                  <div className="flex justify-between">
                    <span>NO shares:</span>
                    <span className="font-mono">{Number(formatEther(userNoBalance)).toFixed(4)}</span>
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
              <span className="font-mono">{Number(formatEther(pot)).toFixed(4)} wstETH</span>
            </div>
            {resolved && payoutPerShare > 0n && (
              <>
                <div className="flex justify-between">
                  <span>Winning Side:</span>
                  <span className="font-semibold">{outcome ? "YES" : "NO"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Winning Shares:</span>
                  <span className="font-mono">{Number(formatEther(outcome ? yesSupply : noSupply)).toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Payout Per Share:</span>
                  <span className="font-mono">{Number(formatEther(payoutPerShare)).toFixed(4)} wstETH</span>
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
                {isTrusted && <BadgeCheck className="h-4 w-4 text-blue-500 shrink-0" />}
                {isOracle && (
                  <Badge variant="outline" className="text-xs">
                    Oracle
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Resolver Controls - only shown to the resolver */}
          {closingTime && (
            <ResolverControls
              marketId={marketId}
              contractAddress={contractAddress}
              marketType={marketType}
              resolver={resolver}
              closingTime={closingTime}
              canAccelerateClosing={canAccelerateClosing}
              resolved={resolved}
              onSuccess={() => {
                refetchMarketData();
                if (onClaimSuccess) onClaimSuccess();
              }}
            />
          )}

          <div className="space-y-2">
            {canClaim ? (
              <Button onClick={handleClaim} className="w-full" size="sm" variant="default">
                Claim {Number(formatEther(userClaimable)).toFixed(4)} wstETH
              </Button>
            ) : (
              <Button onClick={() => setIsModalOpen(true)} className="w-full" size="sm" disabled={isTradingDisabled}>
                {resolved ? "Market Resolved" : isClosed ? "Market Closed" : "Trade"}
              </Button>
            )}

            {marketType === "amm" && !resolved && (
              <a
                href={getZammUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-500/50 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors"
              >
                Trade on ZAMM
                <ArrowUpRight className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>
      </div>

      <TradeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        marketId={marketId}
        marketName={metadata.name}
        yesSupply={yesSupply}
        noSupply={noSupply}
        marketType={marketType}
        contractAddress={contractAddress}
      />
    </>
  );
};
