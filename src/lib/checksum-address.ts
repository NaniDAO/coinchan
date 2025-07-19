import { getAddress } from "viem";

/**
 * Convert an address to EIP-55 checksummed format
 * This is required for Trust Wallet logo URLs
 */
export function toChecksumAddress(address: string): string {
  try {
    return getAddress(address);
  } catch {
    return address;
  }
}

/**
 * Generate Trust Wallet logo URL from an address
 * Trust Wallet requires checksummed addresses in the URL path
 */
export function getTrustWalletLogoUrl(address: string): string {
  const checksummed = toChecksumAddress(address);
  // Use the CDN URL as primary since it's more reliable
  return `https://assets-cdn.trustwallet.com/blockchains/ethereum/assets/${checksummed}/logo.png`;
}

/**
 * Alternative Trust Wallet GitHub raw URL for fallback
 */
export function getTrustWalletGithubUrl(address: string): string {
  const checksummed = toChecksumAddress(address);
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${checksummed}/logo.png`;
}

/**
 * Fix Trust Wallet logo URL to ensure it has the correct checksummed address
 */
export function fixTrustWalletLogoUrl(url: string): string {
  // Extract address from URL
  const match = url.match(/\/assets\/(0x[a-fA-F0-9]{40})\/logo\.png/);
  if (match) {
    const address = match[1];
    const checksummed = toChecksumAddress(address);
    // Replace the address in the URL with the checksummed version
    return url.replace(address, checksummed);
  }
  return url;
}
