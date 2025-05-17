import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "@tanstack/react-router";
import {
  CoinData,
  formatImageURL,
  getAlternativeImageUrls,
} from "@/hooks/metadata/coin-utils";
import { ArrowRightIcon, TrendingUp, ArrowUp, ArrowDown } from "lucide-react";

interface CoinCardProps {
  coin: any;
}

export const CoinCard = ({ coin }: CoinCardProps) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const alternativeUrlsRef = useRef<string[]>([]);
  const attemptedUrlsRef = useRef<Set<string>>(new Set());

  // Reset states when coin changes
  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
    setCurrentImageUrl(null);
    alternativeUrlsRef.current = [];
    attemptedUrlsRef.current = new Set();
  }, [coin.coinId]);

  // Simple function to get a color based on token ID
  const getColorForId = (id: bigint) => {
    const colors = [
      "bg-destructive",
      "bg-primary",
      "bg-chart-2",
      "bg-chart-5",
      "bg-chart-4",
      "bg-chart-3",
      "bg-primary",
      "bg-chart-1",
    ];
    const index = Number(id % BigInt(colors.length));
    return colors[index];
  };

  // Display values with fallbacks
  const displayName = coin.name || `Token ${coin.coinId.toString()}`;
  const displaySymbol = coin.symbol || "TKN";
  // FIX: Centralized image URL resolution logic for clarity and maintainability.
  // Consolidates multiple potential sources (coin.imageUrl, metadata.image, etc.) into a single prioritized check.
  // Improves render consistency and simplifies fallback image handling.
  function resolveImageUrl(coin: CoinData): {
    primaryUrl: string | null;
    baseForFallbacks: string | null;
  } {
    const candidates = [
      coin.imageUrl,
      coin.metadata?.image,
      coin.metadata?.image_url,
      coin.metadata?.imageUrl,
    ];

    for (const rawUrl of candidates) {
      if (rawUrl) {
        return { primaryUrl: formatImageURL(rawUrl), baseForFallbacks: rawUrl };
      }
    }

    return { primaryUrl: null, baseForFallbacks: null };
  }
  // On coin update, resolve and set the best image URL, and reset fallback tracking
  useEffect(() => {
    // Reset state and tracking for the new coin
    setImageLoaded(false);
    setImageError(false);
    setCurrentImageUrl(null);
    alternativeUrlsRef.current = [];
    attemptedUrlsRef.current = new Set();

    // Get the primary image and a base URL for fallbacks (if needed)
    const { primaryUrl, baseForFallbacks } = resolveImageUrl(coin);

    // Generate alternative URLs from the base (e.g., multiple IPFS gateways)
    if (baseForFallbacks) {
      alternativeUrlsRef.current = getAlternativeImageUrls(baseForFallbacks);
    }

    // Set initial image URL if available, and track it as attempted
    if (primaryUrl) {
      setCurrentImageUrl(primaryUrl);
      attemptedUrlsRef.current.add(primaryUrl);
    } else {
      console.warn(`No valid image found for coin ${coin.coinId.toString()}`);
    }
  }, [coin]);

  // Handle image load error with fallback attempt
  const handleImageError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
      console.error(
        `Image failed to load for coin ${coin.coinId.toString()}:`,
        e,
      );

      // Try next alternative URL if available
      if (alternativeUrlsRef.current.length > 0) {
        // Find the first URL we haven't tried yet
        const nextUrl = alternativeUrlsRef.current.find(
          (url) => !attemptedUrlsRef.current.has(url),
        );

        if (nextUrl) {
          attemptedUrlsRef.current.add(nextUrl);
          setCurrentImageUrl(nextUrl);
          // Don't set error yet, we're trying an alternative
          return;
        }
      }

      // If we've exhausted all alternatives, mark as error
      setImageError(true);
    },
    [coin.coinId],
  );
  // Format price change for display
  const formatPriceChange = (pctChange: number | undefined): string => {
    if (pctChange === undefined || isNaN(pctChange)) return "";
    
    // For very small changes (between -0.1 and 0.1), show as 0.0%
    if (Math.abs(pctChange) < 0.1) return "0.0%";
    
    // For other values, format with 1 decimal place
    return pctChange > 0 
      ? `+${pctChange.toFixed(1)}%` 
      : `${pctChange.toFixed(1)}%`;
  };

  // Determine price change indicator color
  const getPriceChangeColor = (pctChange: number | undefined): string => {
    if (pctChange === undefined || isNaN(pctChange)) return "text-muted-foreground";
    if (Math.abs(pctChange) < 0.1) return "text-muted-foreground"; // Basically no change
    if (pctChange > 0) return "text-green-500";
    if (pctChange < 0) return "text-red-500";
    return "text-muted-foreground";
  };

  return (
    <div className="flex border-2 border-primary/50 rounded-md bg-card w-full flex-col items-right gap-2 shadow-md hover:shadow-lg transition-all duration-200 relative">
      {/* Add trending indicator with enhanced visual feedback */}
      {coin.isTrending && (
        <div 
          className={`absolute top-1 right-1 ${
            coin.velocityScore && coin.velocityScore > 0.8 ? 'bg-chart-2 animate-pulse' : 'bg-chart-2/90'
          } text-background rounded-full p-1`} 
          title={`Trending${
            coin.movementScore && coin.movementScore > 0.5 ? ' (Strong Buy Pressure)' : 
            coin.movementScore && coin.movementScore < -0.5 ? ' (Strong Sell Pressure)' : 
            coin.velocityScore && coin.velocityScore > 0.7 ? ' (High Activity)' : 
            coin.recencyFactor && coin.recencyFactor > 0.7 ? ' (Recent Activity)' : ''
          }`}
        >
          <TrendingUp size={12} />
        </div>
      )}
      
      {/* Add 4h price change indicator */}
      {coin.hasPriceChangeData && coin.priceChangePct4h !== undefined && !isNaN(coin.priceChangePct4h) && (
        <div 
          className={`absolute top-1 left-1 ${getPriceChangeColor(coin.priceChangePct4h)} bg-background/70 rounded-md px-1 py-0.5 text-xs font-bold flex items-center`}
          title="4 hour price change"
        >
          {coin.priceChangePct4h > 0.1 && <ArrowUp size={10} className="mr-0.5" />}
          {coin.priceChangePct4h < -0.1 && <ArrowDown size={10} className="mr-0.5" />}
          {formatPriceChange(coin.priceChangePct4h)}
        </div>
      )}
      <div className="flex flex-col items-center justify-center space-y-2">
        <h3 className="p-2 text-center font-extrabold text-xs sm:text-sm truncate w-full">
          {displayName} [{displaySymbol}]
        </h3>

        <div className="p-1 w-16 h-16 sm:w-20 sm:h-20 relative">
          {/* Base colored circle (always visible) */}
          <div
            className={`absolute inset-0 flex ${getColorForId(coin.coinId)} text-background justify-center items-center rounded-full`}
          >
            {displaySymbol.slice(0, 3)}
          </div>

          {/* Image (displayed on top if available and loaded successfully) */}
          {!imageError && currentImageUrl && (
            <img
              src={currentImageUrl}
              alt={`${displaySymbol} logo`}
              className={`absolute inset-0 w-full h-full rounded-full object-cover transition-opacity duration-200 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
              style={{ zIndex: 1 }}
              onLoad={() => setImageLoaded(true)}
              onError={handleImageError}
              loading="lazy"
            />
          )}
        </div>

        <Link
          to={`/c/$coinId`}
          params={{
            coinId: coin.coinId.toString(),
          }}
          className="flex flex-row items-center justify-between m-0 rounded-t-none rounded-b-sm w-full bg-primary/10 py-1 px-3 text-primary-foreground font-extrabold hover:bg-primary/50 transition-all duration-200 text-sm touch-manipulation shadow-sm"
        >
          <span>Trade</span>
          <ArrowRightIcon size={16} />
        </Link>
      </div>
    </div>
  );
};
