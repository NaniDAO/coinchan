// hooks/coin-utils.ts
import { formatEther, formatUnits } from "viem";
import { formatImageURL } from "./use-global-coins-data";

export type RawCoinData = {
  coinId: bigint;
  tokenURI: string;
  reserve0: bigint;
  reserve1: bigint;
  poolId: bigint;
  liquidity: bigint;
};

export type CoinData = RawCoinData & {
  name: string | null;
  symbol: string | null;
  description: string | null;
  imageUrl: string | null;
  metadata: Record<string, any> | null;
  priceInEth: number | null;
};

export function hydrateRawCoin(raw: RawCoinData): CoinData {
  const cd: CoinData = {
    ...raw,
    name: null,
    symbol: null,
    description: null,
    imageUrl: null,
    metadata: null,
    priceInEth:
      raw.reserve0 > 0n && raw.reserve1 > 0n
        ? Number(formatEther(raw.reserve0)) /
          Number(formatUnits(raw.reserve1, 18))
        : null,
  };
  return cd;
}

// Async metadata fetch shared between hooks
export async function enrichMetadata(coin: CoinData): Promise<CoinData> {
  if (!coin.tokenURI || coin.metadata) return coin;
  try {
    const uri = coin.tokenURI.startsWith("ipfs://")
      ? `https://content.wrappr.wtf/ipfs/${coin.tokenURI.slice(7)}`
      : coin.tokenURI;
    const resp = await fetch(uri, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const meta = await resp.json();
    const normalized = normalizeMetadata(meta);
    const updated: CoinData = {
      ...coin,
      metadata: normalized,
      name: normalized.name ?? null,
      symbol: normalized.symbol ?? null,
      description: normalized.description ?? null,
      imageUrl: normalized.image ? formatImageURL(normalized.image) : null,
    };
    return updated;
  } catch {
    return coin;
  }
}

// Function to normalize metadata fields
function normalizeMetadata(metadata: Record<string, any>): Record<string, any> {
  // Create a copy to avoid modifying the original
  const normalized = { ...metadata };

  // Check for possible image field names if standard one is missing
  if (!normalized.image) {
    // Common variations of image field names
    const possibleImageFields = [
      "image_url",
      "imageUrl",
      "image_uri",
      "imageUri",
      "img",
      "avatar",
      "thumbnail",
      "logo",
      "icon",
      "media",
      "artwork",
      "picture",
      "url",
    ];

    // Find the first matching field
    for (const field of possibleImageFields) {
      if (normalized[field] && typeof normalized[field] === "string") {
        normalized.image = normalized[field];
        break;
      }
    }

    // Check if image is in a nested field like 'properties.image'
    if (!normalized.image && normalized.properties) {
      for (const field of ["image", ...possibleImageFields]) {
        if (
          normalized.properties[field] &&
          typeof normalized.properties[field] === "string"
        ) {
          normalized.image = normalized.properties[field];
          break;
        } else if (
          normalized.properties[field]?.url &&
          typeof normalized.properties[field].url === "string"
        ) {
          normalized.image = normalized.properties[field].url;
          break;
        }
      }
    }

    // Check for media arrays
    if (!normalized.image && Array.isArray(normalized.media)) {
      const mediaItem = normalized.media.find(
        (item: any) =>
          item &&
          (item.type?.includes("image") || item.mimeType?.includes("image")),
      );
      if (mediaItem?.uri || mediaItem?.url) {
        normalized.image = mediaItem.uri || mediaItem.url;
      }
    }
  }

  return normalized;
}
