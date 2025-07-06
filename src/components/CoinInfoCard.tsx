import { getAlternativeImageUrls } from "@/hooks/metadata";
import { CoinSource } from "@/lib/coins";
import { formatNumber } from "@/lib/utils";
import { useEffect, useState, useCallback, useRef } from "react";

interface CoinInfoCardProps {
  coinId: bigint;
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  swapFee: bigint[];
  isOwner: boolean;
  type: CoinSource;
  marketCapEth: number;
  marketCapUsd: number;
  isEthPriceData: boolean;
  tokenURI: string;
  isLoading: boolean;
}

export const CoinInfoCard = ({
  coinId,
  name,
  symbol,
  description,
  imageUrl,
  swapFee,
  isOwner,
  type,
  marketCapEth,
  marketCapUsd,
  isEthPriceData,
  tokenURI,
  isLoading,
}: CoinInfoCardProps) => {
  // State for tracking image loading and errors
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const alternativeUrlsRef = useRef<string[]>([]);
  const attemptedUrlsRef = useRef<Set<string>>(new Set());

  // Initialize image loading
  useEffect(() => {
    if (!imageUrl) return;

    setImageLoaded(false);
    setImageError(false);
    attemptedUrlsRef.current = new Set();

    // Generate alternative URLs for fallback
    alternativeUrlsRef.current = getAlternativeImageUrls(imageUrl);

    setCurrentImageUrl(imageUrl);
    attemptedUrlsRef.current.add(imageUrl);
  }, [imageUrl]);

  // Handle image load error with fallback attempt
  const handleImageError = useCallback(() => {
    console.error(`Image failed to load for coin ${coinId.toString()}`);

    // Try next alternative URL if available
    if (alternativeUrlsRef.current.length > 0) {
      // Find the first URL we haven't tried yet
      const nextUrl = alternativeUrlsRef.current.find((url) => !attemptedUrlsRef.current.has(url));

      if (nextUrl) {
        attemptedUrlsRef.current.add(nextUrl);
        setCurrentImageUrl(nextUrl);
        // Don't set error yet, we're trying an alternative
        return;
      }
    }

    // If we've exhausted all alternatives, mark as error
    setImageError(true);
  }, [coinId]);

  return (
    <div
      className={`flex items-start gap-4 mb-4 p-4 border-muted border-2 bg-muted/10 text-muted-foreground rounded-lg content-transition ${isLoading ? "loading" : "loaded fadeIn"}`}
    >
      <div className="flex-shrink-0">
        <div className="w-16 h-16 relative">
          {/* Base colored circle (always visible) */}
          <div
            className={`w-full h-full flex bg-destructive text-background justify-center items-center rounded-full ${isLoading ? "animate-pulse" : ""}`}
          >
            {isLoading ? "TKN" : symbol}
          </div>
          {/* Use enhanced image loading with fallbacks */}
          {!isLoading && !imageError && currentImageUrl && (
            <img
              src={currentImageUrl}
              alt={`${symbol} logo`}
              className={`absolute inset-0 w-full h-full rounded-full object-cover transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
              style={{ zIndex: 1 }}
              onLoad={() => setImageLoaded(true)}
              onError={handleImageError}
              loading="lazy"
            />
          )}
        </div>
      </div>
      <div className="flex flex-col flex-grow overflow-hidden">
        <div className="flex items-baseline space-x-2">
          {isLoading ? (
            <>
              <div className="h-6 bg-muted/50 rounded w-32 skeleton"></div>
              <div className="h-4 bg-muted/50 rounded w-14 skeleton"></div>
            </>
          ) : (
            <>
              <h3 className="text-lg font-medium truncate content-transition loaded">{name}</h3>
              <span className="text-sm font-medium text-accent dark:text-accent content-transition loaded">
                [{symbol}]
              </span>
            </>
          )}
        </div>

        {/* Token ID in hex format and Etherscan link */}
        <div className="flex items-center mt-1 text-xs">
          <span className="font-medium text-secondary dark:text-chart-2 mr-1">
            ID: {coinId.toString()} {type === "COOKBOOK" ? null : `(0x${coinId.toString(16)})`}
          </span>
          {type === "COOKBOOK" ? null : (
            <a
              href={`https://etherscan.io/token/0x${coinId.toString(16)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline ml-2"
            >
              View on Etherscan
            </a>
          )}
        </div>

        {/* Description */}
        {isLoading ? (
          <div className="mt-1 space-y-1">
            <div className="h-3 bg-muted/30 rounded w-full skeleton"></div>
            <div className="h-3 bg-muted/30 rounded w-3/4 skeleton"></div>
            <div className="h-3 bg-muted/30 rounded w-5/6 skeleton"></div>
          </div>
        ) : (
          <p className="text-sm font-medium description-text mt-1 overflow-y-auto max-h-20 content-transition loaded">
            {description || "No description available"}
          </p>
        )}

        {/* Market Cap Estimation and Swap Fee */}
        <div className="mt-2 text-xs">
          <div className="flex flex-col gap-1">
            {/* Always show the swap fee, independent of market cap calculation */}
            <div className="flex items-center gap-1">
              <span className="font-medium dark:text-chart-2">Swap Fee:</span>
              {isLoading ? (
                <div className="h-3 bg-muted/40 rounded w-10 skeleton"></div>
              ) : (
                <span className="font-medium text-primary transition-opacity duration-300">
                  {swapFee.map((s, i) => (
                    <>
                      {i > 0 && " | "}
                      {`${(Number(s) / 100).toFixed(2)}%`}
                    </>
                  ))}
                </span>
              )}
              {!isLoading && isOwner && <span className="text-xs text-chart-2">(You are the owner)</span>}
            </div>

            {/* Market Cap section */}
            {isLoading ? (
              <div className="flex items-center gap-1">
                <span className="font-medium market-cap-text">Est. Market Cap:</span>
                <div className="h-3 bg-muted/40 rounded w-24 skeleton"></div>
              </div>
            ) : (
              marketCapEth !== null && (
                <div className="flex items-center gap-1 transition-opacity duration-300">
                  <span className="font-medium market-cap-text">Est. Market Cap:</span>
                  <span className="market-cap-text">{marketCapEth ? formatNumber(marketCapEth, 2) : "N/A"} ETH</span>
                  {marketCapUsd !== null ? (
                    <span className="ml-1 market-cap-text">(~${formatNumber(marketCapUsd, 0)})</span>
                  ) : isEthPriceData ? (
                    <span className="ml-1 market-cap-text">(USD price processing...)</span>
                  ) : (
                    <span className="ml-1 market-cap-text">(ETH price unavailable)</span>
                  )}
                </div>
              )
            )}
          </div>

          {/* Token URI link if available */}
          {!isLoading && tokenURI && tokenURI !== "N/A" && (
            <div className="mt-1">
              <a
                href={
                  tokenURI.startsWith("ipfs://") ? `https://content.wrappr.wtf/ipfs/${tokenURI.slice(7)}` : tokenURI
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                View Token Metadata
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
