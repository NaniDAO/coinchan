import { formatEther, formatUnits } from "viem";

// Define the CoinData type based on our contract
export type RawCoinData = {
  coinId: bigint;
  tokenURI: string;
  reserve0: bigint; // ETH reserve
  reserve1: bigint; // Coin reserve
  poolId: bigint;
  liquidity: bigint;
};

// Extended type with derived fields that we'll populate
export type CoinData = RawCoinData & {
  // Derived fields from metadata
  name: string | null;
  symbol: string | null;
  description: string | null;
  imageUrl: string | null;
  metadata: Record<string, any> | null;
  // Additional derived fields
  priceInEth: number | null;
  votes?: bigint;
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
  // No change needed in function body as votes is now optional in CoinData type
  return cd;
}

// Define IPFS gateways at module level for consistency
const IPFS_GATEWAYS = [
  "https://content.wrappr.wtf/ipfs/", // Primary gateway
  "https://cloudflare-ipfs.com/ipfs/", // Cloudflare gateway is very reliable
  "https://gateway.pinata.cloud/ipfs/", // Pinata gateway (often fast)
  "https://ipfs.io/ipfs/", // Standard gateway
  "https://dweb.link/ipfs/", // Protocol Labs gateway
  "https://ipfs.fleek.co/ipfs/", // Fleek gateway
];

// Get alternative IPFS URLs for fallback handling
export function getAlternativeImageUrls(imageURL: string): string[] {
  if (!imageURL) {
    return [];
  }

  // Extract IPFS hash if present
  let ipfsHash = "";

  // Handle IPFS URLs
  if (imageURL.startsWith("ipfs://")) {
    ipfsHash = imageURL.slice(7);
  }
  // Handle direct IPFS gateway references
  else if (imageURL.includes("/ipfs/")) {
    const parts = imageURL.split("/ipfs/");
    if (parts.length >= 2) {
      ipfsHash = parts[1];
    }
  }
  // Handle ipfs.io URLs which sometimes have rate limits
  else if (imageURL.includes("ipfs.io")) {
    const ipfsMatch = imageURL.match(/\/ipfs\/([a-zA-Z0-9]+)/);
    if (ipfsMatch && ipfsMatch[1]) {
      ipfsHash = ipfsMatch[1];
    }
  }

  // If we found an IPFS hash, generate URLs for all gateways
  if (ipfsHash) {
    // Skip the first gateway as it's used as the primary one in formatImageURL
    return IPFS_GATEWAYS.slice(1).map((gateway) => `${gateway}${ipfsHash}`);
  }

  // Return an empty array if no IPFS hash was found
  return [];
}

// Process token URI to get metadata
export async function processTokenURI(
  tokenURI: string,
): Promise<Record<string, any> | null> {
  if (!tokenURI || tokenURI === "N/A") {
    return null;
  }

  try {
    // Handle IPFS URIs with multiple gateway fallbacks
    let uri = tokenURI;

    // First attempt with primary gateway
    if (uri.startsWith("ipfs://")) {
      uri = `${IPFS_GATEWAYS[0]}${uri.slice(7)}`;
    }

    // Skip if it's not an HTTP or HTTPS URI
    if (!uri.startsWith("http")) {
      return null;
    }

    // Try to fetch with timeout to avoid hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    // Fetch the metadata
    let response;
    try {
      response = await fetch(uri, { signal: controller.signal });
    } catch (fetchError) {
      console.warn(`Primary fetch failed for ${uri}:`, fetchError);

      // If the URI is IPFS and the primary gateway failed, try alternative gateways
      if (tokenURI.startsWith("ipfs://")) {
        const ipfsHash = tokenURI.slice(7);

        // Try alternative gateways
        for (let i = 1; i < IPFS_GATEWAYS.length; i++) {
          const altUri = `${IPFS_GATEWAYS[i]}${ipfsHash}`;

          try {
            clearTimeout(timeoutId);
            const altController = new AbortController();
            const altTimeoutId = setTimeout(() => altController.abort(), 5000);

            response = await fetch(altUri, { signal: altController.signal });
            clearTimeout(altTimeoutId);

            if (response.ok) {
              break;
            }
          } catch (altError) {
            console.warn(
              `Alternative gateway ${IPFS_GATEWAYS[i]} failed:`,
              altError,
            );
          }
        }
      }

      // If still no valid response after trying alternatives
      if (!response || !response.ok) {
        throw new Error("All gateway attempts failed");
      }
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response || !response.ok) {
      throw new Error(`HTTP error! status: ${response?.status || "unknown"}`);
    }

    // Parse the JSON response
    try {
      const text = await response.text();

      let metadata;
      try {
        metadata = JSON.parse(text);
      } catch (jsonError) {
        console.error("Error parsing JSON metadata:", jsonError);

        // Try to clean the text response and parse again
        // Some metadata services return invalid JSON with extra characters
        const cleanedText = text.trim().replace(/^\s*[\r\n]/gm, "");
        try {
          metadata = JSON.parse(cleanedText);
        } catch (secondJsonError) {
          console.error(
            "Failed to parse JSON even after cleaning:",
            secondJsonError,
          );
          return null;
        }
      }

      // Check for non-standard image field names
      const normalizedMetadata = normalizeMetadata(metadata);

      return normalizedMetadata;
    } catch (error) {
      console.error("Error processing metadata response:", error);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching metadata from ${tokenURI}:`, error);
    return null;
  }
}

// Format image URL (handle IPFS URLs)
export function formatImageURL(imageURL: string): string {
  if (!imageURL) {
    return "";
  }

  // Extract IPFS hash if present
  let ipfsHash = "";

  // Handle IPFS URLs
  if (imageURL.startsWith("ipfs://")) {
    ipfsHash = imageURL.slice(7);
  }
  // Handle direct IPFS gateway references
  else if (imageURL.includes("/ipfs/")) {
    const parts = imageURL.split("/ipfs/");
    if (parts.length >= 2) {
      ipfsHash = parts[1];
    }
  }
  // Handle ipfs.io URLs which sometimes have rate limits
  else if (imageURL.includes("ipfs.io")) {
    const ipfsMatch = imageURL.match(/\/ipfs\/([a-zA-Z0-9]+)/);
    if (ipfsMatch && ipfsMatch[1]) {
      ipfsHash = ipfsMatch[1];
    }
  }

  // If we found an IPFS hash, use the primary gateway
  if (ipfsHash) {
    return `${IPFS_GATEWAYS[0]}${ipfsHash}`;
  }

  // Return the original URL if no IPFS hash was found
  return imageURL;
}

// Async metadata fetch shared between hooks
export async function enrichMetadata(coin: CoinData): Promise<CoinData> {
  if (!coin.tokenURI || coin.metadata) return coin;
  try {
    const uri = coin.tokenURI.startsWith("ipfs://")
      ? `https://content.wrappr.wtf/ipfs/${coin.tokenURI.slice(7)}`
      : coin.tokenURI;

    if (uri.includes("coinit.app")) {
      // @TODO for now disabling because requests to coinit throw CORS error
      return coin;
    }

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
  } catch (e) {
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
