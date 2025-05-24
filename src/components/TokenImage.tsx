import { TokenMeta } from "@/lib/coins";
import { memo, useCallback, useEffect, useState } from "react";
import { EthereumIcon } from "./EthereumIcon";

const getInitials = (symbol: string) => {
  return symbol.slice(0, 2).toUpperCase();
};

// Color map for token initials - matching your screenshot
const getColorForSymbol = (symbol: string) => {
  const symbolKey = symbol.toLowerCase();
  const colorMap: Record<string, { bg: string; text: string }> = {
    eth: { bg: "bg-black", text: "text-white" },
    za: { bg: "bg-red-500", text: "text-white" },
    pe: { bg: "bg-green-700", text: "text-white" },
    ro: { bg: "bg-red-700", text: "text-white" },
    "..": { bg: "bg-gray-800", text: "text-white" },
  };

  const initials = symbolKey.slice(0, 2);
  return colorMap[initials] || { bg: "bg-yellow-500", text: "text-white" };
};

export const TokenImage = memo(
  ({ token }: { token: TokenMeta }) => {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [actualImageUrl, setActualImageUrl] = useState<string | null>(null);
    const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());
    const [alternativeUrls, setAlternativeUrls] = useState<string[]>([]);
    const { bg, text } = getColorForSymbol(token.symbol);

    // Check if this is the ETH token
    const isEthToken = token.id === null && token.symbol === "ETH";

    // If this is ETH, use the theme-aware Ethereum icon
    if (isEthToken) {
      return (
        <EthereumIcon className="w-8 h-8 rounded-full" />
      );
    }

    // Cache images in sessionStorage to prevent repeated fetches
    const cacheKey = `token-image-${token.id ?? "eth"}-url`;

    // Use sessionStorage to speed up image URL loading
    useEffect(() => {
      // First check if we have a cached version
      try {
        const cachedUrl = sessionStorage.getItem(cacheKey);
        if (cachedUrl) {
          setActualImageUrl(cachedUrl);
          return;
        }
      } catch (e) {
        // Ignore sessionStorage errors
      }

      const fetchMetadata = async () => {
        if (!token.tokenUri) return;

        // Skip for data URIs like the ETH SVG
        if (token.tokenUri.startsWith("data:")) {
          setActualImageUrl(token.tokenUri);
          try {
            sessionStorage.setItem(cacheKey, token.tokenUri);
          } catch (e) {
            // Ignore sessionStorage errors
          }
          return;
        }

        try {
          // Handle IPFS URIs
          const uri = token.tokenUri.startsWith("ipfs://")
            ? `https://content.wrappr.wtf/ipfs/${token.tokenUri.slice(7)}`
            : token.tokenUri;

          // Generate alternative URLs for fallbacks
          if (token.tokenUri.startsWith("ipfs://")) {
            const hash = token.tokenUri.slice(7);
            setAlternativeUrls([
              `https://cloudflare-ipfs.com/ipfs/${hash}`,
              `https://ipfs.io/ipfs/${hash}`,
              `https://gateway.pinata.cloud/ipfs/${hash}`,
              `https://ipfs.fleek.co/ipfs/${hash}`,
            ]);
          }

          // Try to fetch as JSON (might be metadata)
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000); // Shorter timeout

          try {
            const response = await fetch(uri, {
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            const contentType = response.headers.get("content-type");

            // If it's JSON, try to extract image URL
            if (contentType && contentType.includes("application/json")) {
              const data = await response.json();
              let imageUrl = null;

              // Try multiple image field variations
              if (data.image) {
                imageUrl = data.image;
              } else if (data.image_url) {
                imageUrl = data.image_url;
              } else if (data.imageUrl) {
                imageUrl = data.imageUrl;
              } else if (data.properties?.image) {
                imageUrl = data.properties.image;
              }

              if (imageUrl) {
                // Handle IPFS image URL
                const formattedUrl = imageUrl.startsWith("ipfs://")
                  ? `https://content.wrappr.wtf/ipfs/${imageUrl.slice(7)}`
                  : imageUrl;

                setActualImageUrl(formattedUrl);
                try {
                  sessionStorage.setItem(cacheKey, formattedUrl);
                } catch (e) {
                  // Ignore sessionStorage errors
                }
                return;
              }
            }

            // If not valid JSON or no image field, use the URI directly
            setActualImageUrl(uri);
            try {
              sessionStorage.setItem(cacheKey, uri);
            } catch (e) {
              // Ignore sessionStorage errors
            }
          } catch (err) {
            clearTimeout(timeoutId);
            // Error fetching metadata
            // Don't mark as error yet, try alternate URLs
            setFailedUrls((prev) => new Set([...prev, uri]));
          }
        } catch (err) {
          // Error handling metadata
          setImageError(true);
        }
      };

      fetchMetadata();
    }, [token.tokenUri, token.symbol, token.id, cacheKey]);

    // If image fails to load, try alternatives
    const tryNextAlternative = useCallback(() => {
      if (alternativeUrls.length > 0) {
        // Find the next URL that hasn't been tried
        const nextUrl = alternativeUrls.find((url) => !failedUrls.has(url));
        if (nextUrl) {
          // Try alternative URL
          setActualImageUrl(nextUrl);
          return;
        }
      }

      // If we've exhausted all alternatives or have none, show error
      setImageError(true);
    }, [alternativeUrls, failedUrls, token.symbol]);

    // Handle image load error by trying an alternative URL
    const handleImageError = useCallback(() => {
      if (actualImageUrl) {
        setFailedUrls((prev) => new Set([...prev, actualImageUrl]));
      }
      tryNextAlternative();
    }, [actualImageUrl, tryNextAlternative]);

    // If token has no URI, show colored initial
    if (!token.tokenUri) {
      // Use token ID as a cache key to maintain stable identities
      const cacheKey = `token-initial-${token.id ?? "eth"}`;

      // Check if we have this component cached in sessionStorage
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached === "true") {
          // We know this token has no URI, use the optimized render path
          return (
            <div className={`w-8 h-8 flex ${bg} ${text} justify-center items-center rounded-full text-xs font-medium`}>
              {getInitials(token.symbol)}
            </div>
          );
        }
        // Cache this result for future renders
        sessionStorage.setItem(cacheKey, "true");
      } catch (e) {
        // Ignore sessionStorage errors
      }

      return (
        <div className={`w-8 h-8 flex ${bg} ${text} justify-center items-center rounded-full text-xs font-medium`}>
          {getInitials(token.symbol)}
        </div>
      );
    }

    // Show loading placeholder if we don't have the actual image URL yet
    if (!actualImageUrl && !imageError) {
      return (
        <div className="relative w-8 h-8 rounded-full overflow-hidden">
          <div className={`w-8 h-8 flex ${bg} ${text} justify-center items-center rounded-full`}>
            {getInitials(token.symbol)}
          </div>
        </div>
      );
    }

    // Otherwise, try to load the token image
    return (
      <div className="relative w-8 h-8 rounded-full overflow-hidden">
        {/* Show colored initials while loading or on error */}
        {(!imageLoaded || imageError) && (
          <div
            className={`absolute inset-0 w-8 h-8 flex ${bg} ${text} justify-center items-center rounded-full text-xs font-medium`}
          >
            {getInitials(token.symbol)}
          </div>
        )}

        {/* Actual token image */}
        {actualImageUrl && !imageError && (
          <img
            src={actualImageUrl}
            alt={`${token.symbol} logo`}
            className={`w-8 h-8 object-cover rounded-full ${imageLoaded ? "opacity-100" : "opacity-0"} transition-opacity duration-200`}
            onLoad={() => setImageLoaded(true)}
            onError={handleImageError}
            loading="lazy"
          />
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Only re-render if token ID or URI changes
    return prevProps.token.id === nextProps.token.id && prevProps.token.tokenUri === nextProps.token.tokenUri;
  },
);
