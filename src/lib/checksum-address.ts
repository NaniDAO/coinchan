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
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${checksummed}/logo.png`;
}

/**
 * Alternative Trust Wallet CDN URLs for fallback
 */
export function getTrustWalletCdnUrl(address: string): string {
  const checksummed = toChecksumAddress(address);
  return `https://assets-cdn.trustwallet.com/blockchains/ethereum/assets/${checksummed}/logo.png`;
}