import type { TokenMeta } from "@/lib/coins";
import { memo, useCallback, useEffect, useState } from "react";
import { EthereumIcon } from "./EthereumIcon";

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
    usdt: { bg: "bg-green-500", text: "text-white" },
    cult: { bg: "bg-red-600", text: "text-white" },
    "..": { bg: "bg-gray-800", text: "text-white" },
  };

  const initials = symbolKey.slice(0, 2);
  return colorMap[initials] || { bg: "bg-blue-500", text: "text-white" };
};

// Enhanced image cache with error tracking
class ImageCache {
  private cache = new Map<string, { url: string | null; timestamp: number }>();
  private failedUrls = new Set<string>();
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  get(key: string): string | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.url;
    }
    return null;
  }

  set(key: string, url: string | null): void {
    this.cache.set(key, { url, timestamp: Date.now() });
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(`token-image-${key}`, JSON.stringify({ url, timestamp: Date.now() }));
      } catch (e) {
        // Ignore storage errors
      }
    }
  }

  hasFailed(url: string): boolean {
    return this.failedUrls.has(url);
  }

  markFailed(url: string): void {
    this.failedUrls.add(url);
  }

  loadFromStorage(key: string): string | null {
    if (typeof window === "undefined") return null;

    try {
      const stored = sessionStorage.getItem(`token-image-${key}`);
      if (stored) {
        const { url, timestamp } = JSON.parse(stored);
        if (Date.now() - timestamp < this.CACHE_DURATION) {
          this.cache.set(key, { url, timestamp });
          return url;
        }
      }
    } catch (e) {
      // Ignore storage errors
    }
    return null;
  }
}

const imageCache = new ImageCache();

// Optimized image loading with retry logic
const loadImageWithFallbacks = async (tokenUri: string, cacheKey: string): Promise<string | null> => {
  // Check cache first
  const cached = imageCache.get(cacheKey);
  if (cached !== null) {
    return cached;
  }

  // Load from sessionStorage
  const fromStorage = imageCache.loadFromStorage(cacheKey);
  if (fromStorage) {
    return fromStorage;
  }

  if (!tokenUri) {
    imageCache.set(cacheKey, null);
    return null;
  }

  // Handle data URIs
  if (tokenUri.startsWith("data:")) {
    imageCache.set(cacheKey, tokenUri);
    return tokenUri;
  }

  // Handle direct image URLs
  if (
    (tokenUri.startsWith("http") || tokenUri.startsWith("/")) &&
    (tokenUri.includes(".jpg") || tokenUri.includes(".png") || tokenUri.includes(".gif") || tokenUri.includes(".webp"))
  ) {
    if (!imageCache.hasFailed(tokenUri)) {
      try {
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = resolve;
          img.onerror = reject;
          img.src = tokenUri;
        });
        imageCache.set(cacheKey, tokenUri);
        return tokenUri;
      } catch {
        imageCache.markFailed(tokenUri);
      }
    }
    imageCache.set(cacheKey, null);
    return null;
  }

  // Handle IPFS URIs with multiple gateway fallbacks
  if (tokenUri.startsWith("ipfs://")) {
    const hash = tokenUri.slice(7);
    const gateways = [
      `https://content.wrappr.wtf/ipfs/${hash}`,
      `https://cloudflare-ipfs.com/ipfs/${hash}`,
      `https://ipfs.io/ipfs/${hash}`,
      `https://gateway.pinata.cloud/ipfs/${hash}`,
    ];

    for (const gateway of gateways) {
      if (imageCache.hasFailed(gateway)) continue;

      try {
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = resolve;
          img.onerror = reject;
          img.src = gateway;
        });
        imageCache.set(cacheKey, gateway);
        return gateway;
      } catch {
        imageCache.markFailed(gateway);
      }
    }
  }

  // Try to fetch metadata JSON
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // Shorter timeout

    const uri = tokenUri.startsWith("ipfs://") ? `https://content.wrappr.wtf/ipfs/${tokenUri.slice(7)}` : tokenUri;

    if (imageCache.hasFailed(uri)) {
      imageCache.set(cacheKey, null);
      return null;
    }

    const response = await fetch(uri, { signal: controller.signal });
    clearTimeout(timeoutId);

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      let imageUrl = data.image || data.image_url || data.imageUrl || data.properties?.image;

      if (imageUrl) {
        const formattedUrl = imageUrl.startsWith("ipfs://")
          ? `https://content.wrappr.wtf/ipfs/${imageUrl.slice(7)}`
          : imageUrl;

        if (!imageCache.hasFailed(formattedUrl)) {
          try {
            await new Promise((resolve, reject) => {
              const img = new Image();
              img.onload = resolve;
              img.onerror = reject;
              img.src = formattedUrl;
            });
            imageCache.set(cacheKey, formattedUrl);
            return formattedUrl;
          } catch {
            imageCache.markFailed(formattedUrl);
          }
        }
      }
    }
  } catch (error) {
    // Ignore fetch errors
  }

  imageCache.set(cacheKey, null);
  return null;
};

export const EnhancedTokenImage = memo(
  ({ token, size = "default" }: { token: TokenMeta; size?: "sm" | "default" | "lg" }) => {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [imageError, setImageError] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const { bg, text } = getColorForSymbol(token.symbol);
    const isEthToken = token.id === null && token.symbol === "ETH";
    const cacheKey = `${token.id ?? "eth"}-${token.symbol}`;

    const sizeClasses = {
      sm: "w-6 h-6 text-xs",
      default: "w-8 h-8 text-sm",
      lg: "w-12 h-12 text-base",
    };

    const loadImage = useCallback(async () => {
      setIsLoading(true);
      try {
        const url = await loadImageWithFallbacks(token.tokenUri || "", cacheKey);
        setImageUrl(url);
        setImageError(url === null);
      } catch (error) {
        setImageError(true);
        setImageUrl(null);
      } finally {
        setIsLoading(false);
      }
    }, [token.tokenUri, cacheKey]);

    useEffect(() => {
      // Check cache first for immediate display
      const cached = imageCache.get(cacheKey);
      if (cached !== null) {
        setImageUrl(cached);
        setImageError(cached === null);
        setIsLoading(false);
        return;
      }

      // Load from storage
      const fromStorage = imageCache.loadFromStorage(cacheKey);
      if (fromStorage) {
        setImageUrl(fromStorage);
        setImageError(false);
        setIsLoading(false);
        return;
      }

      // Load image asynchronously
      loadImage();
    }, [loadImage, cacheKey]);

    if (isEthToken) {
      return (
        <div className={`${sizeClasses[size]} flex items-center justify-center rounded-full bg-black`}>
          <EthereumIcon className="w-full h-full text-white p-1" />
        </div>
      );
    }

    if (isLoading) {
      return <div className={`${sizeClasses[size]} rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse`} />;
    }

    if (imageUrl && !imageError) {
      return (
        <img
          src={imageUrl}
          alt={token.symbol}
          className={`${sizeClasses[size]} rounded-full object-cover bg-gray-100 dark:bg-gray-800`}
          onError={() => {
            setImageError(true);
            imageCache.markFailed(imageUrl);
          }}
        />
      );
    }

    // Fallback to initials
    return (
      <div className={`${sizeClasses[size]} rounded-full ${bg} ${text} flex items-center justify-center font-bold`}>
        {getInitials(token.symbol)}
      </div>
    );
  },
);

EnhancedTokenImage.displayName = "EnhancedTokenImage";
