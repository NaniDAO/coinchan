/**
 * Trusted token list utilities
 * Loads and validates tokens from the Trust Wallet token list
 */

import { type Address, getAddress } from "viem";

interface TrustedToken {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  logoURI: string | null;
}

interface TokenListData {
  generated: string;
  source: string;
  chainId: number;
  count: number;
  tokens: TrustedToken[];
}

let tokenListCache: TokenListData | null = null;

/**
 * Load the trusted token list (with caching)
 */
async function loadTrustedTokenList(): Promise<TokenListData> {
  if (tokenListCache) {
    return tokenListCache;
  }

  try {
    // Try to load from public directory
    const response = await fetch("/trust-eth-erc20.tokens.json");
    if (!response.ok) {
      throw new Error(`Failed to load token list: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log("Loaded Trust Wallet token list:", { count: data.count, tokens: data.tokens?.length });
    tokenListCache = data;
    return data;
  } catch (error) {
    console.error("Failed to load trusted token list:", error);
  }

  // Fallback to empty list
  tokenListCache = {
    generated: new Date().toISOString(),
    source: "Fallback",
    chainId: 1,
    count: 0,
    tokens: [],
  };

  return tokenListCache;
}

/**
 * Get trusted token info by address
 */
export async function getTrustedTokenInfo(address: Address): Promise<TrustedToken | null> {
  const tokenList = await loadTrustedTokenList();

  try {
    const checksumAddress = getAddress(address);
    const lowerAddress = address.toLowerCase();

    // Try both checksummed and lowercase addresses since Trust Wallet list might have either
    const token = tokenList.tokens.find(
      (token) => token.address.toLowerCase() === lowerAddress || token.address === checksumAddress,
    );

    if (token) {
      console.log("Found token:", token.symbol, "at address:", token.address);
    }

    return token || null;
  } catch {
    return null;
  }
}

/**
 * Check if a token address is in the trusted list
 */
export async function isTrustedToken(address: Address): Promise<boolean> {
  const tokenInfo = await getTrustedTokenInfo(address);
  return tokenInfo !== null;
}

/**
 * Get all trusted tokens
 */
export async function getAllTrustedTokens(): Promise<TrustedToken[]> {
  const tokenList = await loadTrustedTokenList();
  return tokenList.tokens;
}

/**
 * Search trusted tokens by symbol or name
 */
export async function searchTrustedTokens(query: string): Promise<TrustedToken[]> {
  const tokenList = await loadTrustedTokenList();
  const lowerQuery = query.toLowerCase();

  console.log("Searching tokens with query:", query, "in list of", tokenList.tokens.length, "tokens");

  const results = tokenList.tokens.filter(
    (token) => token.symbol.toLowerCase().includes(lowerQuery) || token.name.toLowerCase().includes(lowerQuery),
  );

  console.log(
    "Found",
    results.length,
    "matching tokens:",
    results.map((t) => t.symbol),
  );

  return results;
}

/**
 * Get token list metadata
 */
export async function getTokenListMetadata(): Promise<{ generated: string; source: string; count: number }> {
  const tokenList = await loadTrustedTokenList();
  return {
    generated: tokenList.generated,
    source: tokenList.source,
    count: tokenList.count,
  };
}

/**
 * Validate that a token has reasonable metadata
 */
export function validateTokenMetadata(token: TrustedToken): boolean {
  return !!(
    token.address &&
    token.symbol &&
    token.name &&
    typeof token.decimals === "number" &&
    token.decimals >= 0 &&
    token.decimals <= 255
  );
}

// Export type for use in other modules
export type { TrustedToken };
