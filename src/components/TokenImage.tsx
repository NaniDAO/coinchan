import type { TokenMeta } from "@/lib/coins";
import { memo, useCallback, useEffect, useState } from "react";
import { EthereumIcon } from "./EthereumIcon";

const getInitials = (symbol: string) => {
  return symbol?.slice(0, 2).toUpperCase() ?? "";
};

// Color map for token initials - matching your screenshot
const getColorForSymbol = (symbol: string) => {
  const symbolKey = symbol?.toLowerCase() ?? "";
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

    // Check if this is the ENS token (custom pool with ENS symbol)
    const isEnsToken = token.isCustomPool && token.symbol === "ENS";

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

        // Handle direct image URLs (local or external)
        if (
          (token.tokenUri.startsWith("http") || token.tokenUri.startsWith("/")) &&
          (token.tokenUri.includes(".jpg") ||
            token.tokenUri.includes(".png") ||
            token.tokenUri.includes(".gif") ||
            token.tokenUri.includes(".webp"))
        ) {
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

    // If this is ETH, use the theme-aware Ethereum icon
    if (isEthToken) {
      return <EthereumIcon className="w-8 h-8 rounded-full" />;
    }

    // If this is ENS token, use the custom SVG
    if (isEnsToken) {
      return (
        <div className="w-8 h-8 rounded-full overflow-hidden bg-white flex items-center justify-center">
          <svg
            width="32"
            height="32"
            viewBox="0 0 202 231"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-6 h-6"
          >
            <path
              d="M98.3592 2.80337L34.8353 107.327C34.3371 108.147 33.1797 108.238 32.5617 107.505C26.9693 100.864 6.13478 72.615 31.9154 46.8673C55.4403 23.3726 85.4045 6.62129 96.5096 0.831705C97.7695 0.174847 99.0966 1.59007 98.3592 2.80337Z"
              fill="#011A25"
            />
            <path
              d="M94.8459 230.385C96.1137 231.273 97.6758 229.759 96.8261 228.467C82.6374 206.886 35.4713 135.081 28.9559 124.302C22.5295 113.67 9.88976 96.001 8.83534 80.8842C8.7301 79.3751 6.64332 79.0687 6.11838 80.4879C5.27178 82.7767 4.37045 85.5085 3.53042 88.6292C-7.07427 128.023 8.32698 169.826 41.7753 193.238L94.8459 230.386V230.385Z"
              fill="#011A25"
            />
            <path
              d="M103.571 228.526L167.095 124.003C167.593 123.183 168.751 123.092 169.369 123.825C174.961 130.465 195.796 158.715 170.015 184.463C146.49 207.957 116.526 224.709 105.421 230.498C104.161 231.155 102.834 229.74 103.571 228.526Z"
              fill="#011A25"
            />
            <path
              d="M107.154 0.930762C105.886 0.0433954 104.324 1.5567 105.174 2.84902C119.363 24.4301 166.529 96.2354 173.044 107.014C179.471 117.646 192.11 135.315 193.165 150.432C193.27 151.941 195.357 152.247 195.882 150.828C196.728 148.539 197.63 145.808 198.47 142.687C209.074 103.293 193.673 61.4905 160.225 38.078L107.154 0.930762Z"
              fill="#011A25"
            />
          </svg>
        </div>
      );
    }

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
    // Only re-render if token ID, URI, or symbol changes
    return (
      prevProps.token.id === nextProps.token.id &&
      prevProps.token.tokenUri === nextProps.token.tokenUri &&
      prevProps.token.symbol === nextProps.token.symbol
    );
  },
);
