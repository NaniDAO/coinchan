import type { TokenMeta } from "@/lib/coins";
import { memo, useEffect, useState } from "react";
import { EthereumIcon } from "./EthereumIcon";
import { formatImageURL } from "@/hooks/metadata";

const getInitials = (symbol: string) => {
  return symbol?.slice(0, 2).toUpperCase() ?? "";
};

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

// Generate a unique key for each token to avoid React key collisions
export const getTokenKey = (token: TokenMeta) => {
  const parts = [
    token.id?.toString() ?? "null",
    token.symbol ?? "unknown",
    token.name ?? "unknown",
    token.source ?? "default",
    token.poolId?.toString() ?? "no-pool",
    token.tokenUri ?? "no-uri",
    token.imageUrl ?? "no-image",
  ];
  return parts.join("-");
};

export const TokenImage = memo(({ token }: { token: TokenMeta }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const { bg, text } = getColorForSymbol(token.symbol);

  useEffect(() => {
    const loadImage = async () => {
      // If we have imageUrl, use it directly
      if (token.imageUrl) {
        setImageUrl(formatImageURL(token.imageUrl));
        return;
      }

      // If no imageUrl but we have tokenUri, try to extract image from metadata
      if (token.tokenUri) {
        try {
          // Handle direct image URLs
          if (
            token.tokenUri.startsWith("data:") ||
            token.tokenUri.match(/\.(jpg|png|gif|webp)$/i)
          ) {
            setImageUrl(token.tokenUri);
            return;
          }

          // Handle IPFS URIs - convert to gateway URL
          const uri = token.tokenUri.startsWith("ipfs://")
            ? `https://content.wrappr.wtf/ipfs/${token.tokenUri.slice(7)}`
            : token.tokenUri;

          // Try to fetch metadata
          const response = await fetch(uri);
          if (
            response.ok &&
            response.headers.get("content-type")?.includes("json")
          ) {
            const metadata = await response.json();
            const extractedImageUrl =
              metadata.image || metadata.image_url || metadata.imageUrl;

            if (extractedImageUrl) {
              setImageUrl(formatImageURL(extractedImageUrl));
              return;
            }
          }

          // If metadata fetch fails or no image found, use URI directly
          setImageUrl(formatImageURL(uri));
        } catch {
          // If everything fails, we'll show the fallback
          setImageError(true);
        }
      }
    };

    loadImage();
  }, [token.imageUrl, token.tokenUri]);

  // Hardcoded images
  if (token.id === null && token.symbol === "ETH") {
    return <EthereumIcon className="w-8 h-8 rounded-full" />;
  }

  if (token.isCustomPool && token.symbol === "ENS") {
    return (
      <img
        src="/ens.svg"
        alt="ENS"
        className="w-8 h-8 rounded-full object-cover"
      />
    );
  }

  if (token.symbol === "CULT" && (token.isCustomPool || token.id === 999999n)) {
    return (
      <img
        src="/cult.jpg"
        alt="CULT"
        className="w-8 h-8 rounded-full object-cover"
      />
    );
  }

  // Fallback to colored initials
  const fallback = (
    <div
      className={`w-8 h-8 flex ${bg} ${text} justify-center items-center rounded-full text-xs font-medium`}
    >
      {getInitials(token.symbol)}
    </div>
  );

  // If no image URL or error, show fallback
  if (!imageUrl || imageError) {
    return fallback;
  }

  return (
    <img
      src={imageUrl}
      alt={`${token.symbol} logo`}
      className="w-8 h-8 object-cover rounded-full"
      onError={() => setImageError(true)}
      loading="lazy"
    />
  );
});
