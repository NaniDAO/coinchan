import { useState, useEffect } from "react";

export const DisplayTokenUri = ({
  tokenUri,
  symbol,
  className = "",
}: {
  tokenUri: string;
  symbol: string;
  className?: string;
}) => {
  // State to track when image has loaded
  const [, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [actualImageUrl, setActualImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Get a background color based on symbol initials
  const getColorForSymbol = (symbol: string) => {
    const initials = (symbol || "XX").slice(0, 2).toUpperCase();
    const colorMap: Record<string, string> = {
      BT: "bg-orange-500",
      ET: "bg-blue-500",
      US: "bg-green-500",
      XR: "bg-purple-500",
    };
    return colorMap[initials] || "bg-red-500";
  };

  const bgColor = getColorForSymbol(symbol);

  // Use direct fetch approach like in SwapTile, which works reliably
  useEffect(() => {
    const fetchMetadata = async () => {
      if (!tokenUri || tokenUri === "N/A") {
        return;
      }

      setIsLoading(true);

      // Skip for data URIs (if any)
      if (tokenUri.startsWith("data:")) {
        setActualImageUrl(tokenUri);
        setIsLoading(false);
        return;
      }

      try {
        // Handle IPFS URIs - use the same gateway as SwapTile
        let uri;
        if (tokenUri.startsWith("ipfs://")) {
          uri = `https://content.wrappr.wtf/ipfs/${tokenUri.slice(7)}`;
        } else {
          uri = tokenUri;
        }

        // Try to fetch as JSON
        const response = await fetch(uri);

        if (!response.ok) {
          console.error(
            `DisplayTokenUri for ${symbol}: Fetch failed with status:`,
            response.status,
          );
          throw new Error(`Failed to fetch metadata: ${response.status}`);
        }

        const contentType = response.headers.get("content-type");

        // If it's JSON, try to extract image URL
        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();

          if (data && data.image) {
            // Handle IPFS image URL
            let imageUrl;
            if (data.image.startsWith("ipfs://")) {
              imageUrl = `https://content.wrappr.wtf/ipfs/${data.image.slice(7)}`;
            } else {
              imageUrl = data.image;
            }

            setActualImageUrl(imageUrl);
          } else {
            console.error(
              `DisplayTokenUri for ${symbol}: No image field in metadata:`,
              data,
            );
            throw new Error("No image in metadata");
          }
        } else {
          // If not JSON, use URI directly as image

          setActualImageUrl(uri);
        }
      } catch (err) {
        console.error(
          `DisplayTokenUri for ${symbol}: Error fetching metadata:`,
          err,
        );
        setImageError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetadata();
  }, [tokenUri, symbol]);

  // Fallback for invalid token URIs
  if (!tokenUri || tokenUri === "N/A") {
    return (
      <div
        className={`w-full h-full flex ${bgColor} text-white justify-center items-center rounded-full ${className}`}
      >
        {symbol?.slice(0, 3)}
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div
        className={`w-full h-full flex bg-gray-200 text-gray-700 justify-center items-center rounded-full animate-pulse ${className}`}
      >
        {symbol?.slice(0, 3)}
      </div>
    );
  }

  // Error or no image available
  if (imageError || !actualImageUrl) {
    return (
      <div
        className={`w-full h-full flex ${bgColor} text-white justify-center items-center rounded-full ${className}`}
      >
        {symbol?.slice(0, 3)}
      </div>
    );
  }

  // Successfully loaded image
  return (
    <div className="relative w-full h-full rounded-full overflow-hidden">
      {/* Fallback that's visible until image loads */}
      <div
        className={`absolute inset-0 flex ${bgColor} text-white justify-center items-center`}
      >
        {symbol?.slice(0, 3)}
      </div>

      {/* The actual image - with dark mode enhancement */}
      <img
        src={actualImageUrl}
        alt={`${symbol} logo`}
        className="absolute inset-0 w-full h-full object-cover dark:brightness-[0.95] dark:contrast-[1.05]"
        style={{ zIndex: 1 }}
        onLoad={() => {
          setImageLoaded(true);
        }}
        onError={(e) => {
          console.error(
            `DisplayTokenUri for ${symbol}: Image load error for URL:`,
            actualImageUrl,
            e,
          );
          setImageError(true);
        }}
        loading="eager" // Force eager loading instead of lazy
      />
    </div>
  );
};
