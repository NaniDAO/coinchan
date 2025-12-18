// Market categories for onchain event markets
export type MarketCategory =
  | "governance" // DAO voting outcomes
  | "price" // Token/asset prices
  | "balance" // Token/NFT balance tracking
  | "network" // Gas, block data, network metrics
  | "supply" // Token supply milestones
  | "protocol" // Protocol-specific events
  | "random" // Provably fair randomness
  | "custom"; // User-created via Resolver singleton

export interface TrustedResolver {
  address: string;
  name: string;
  description?: string;
  isPerpetualOracle?: boolean; // Special flag for programmatic perpetual oracle resolvers
  category?: MarketCategory; // Market category for filtering
}

// Resolver Singleton - the universal onchain oracle contract
export const RESOLVER_SINGLETON_ADDRESS = "0x00000000002205020E387b6a378c05639047BcFB" as const;

// GasPM Resolver - Gas price prediction markets
export const GASPM_RESOLVER_ADDRESS = "0x0000000000ee3d4294438093EaA34308f47Bc0b4" as const;

// PnkPM Resolver - Uniswap V4 Fee Switch prediction market
export const PNKPM_RESOLVER_ADDRESS = "0xF92007bFaF3B3738922c33f2F44Cd445a684257E" as const;

export const TRUSTED_RESOLVERS: TrustedResolver[] = [
  // ===== RESOLVER SINGLETON (Gold Badge) =====
  {
    address: RESOLVER_SINGLETON_ADDRESS,
    name: "Resolver",
    description: "Universal onchain oracle for verifiable condition markets",
    isPerpetualOracle: true,
    category: "custom", // Actual category determined by market condition
  },
  // ===== GAS MARKETS =====
  {
    address: GASPM_RESOLVER_ADDRESS,
    name: "GasPM",
    description: "Gas price prediction oracle",
    isPerpetualOracle: true,
    category: "network",
  },
  // ===== BALANCE MARKETS =====
  {
    address: PNKPM_RESOLVER_ADDRESS,
    name: "PnkPM",
    description: "PNKSTR CryptoPunks treasury balance markets",
    isPerpetualOracle: false,
    category: "balance",
  },
];

export const isTrustedResolver = (address: string): boolean => {
  return TRUSTED_RESOLVERS.some((resolver) => resolver.address.toLowerCase() === address.toLowerCase());
};

/**
 * External PAMM market sites by resolver address
 */
export const PAMM_EXTERNAL_SITES: Record<string, { url: string; name: string; logo: { textTop: string; colorTop: string } }> = {
  [PNKPM_RESOLVER_ADDRESS.toLowerCase()]: {
    url: "https://pnkpm.eth.limo/",
    name: "PnkPM",
    logo: { textTop: "Pnk", colorTop: "#ec4899" },
  },
  [GASPM_RESOLVER_ADDRESS.toLowerCase()]: {
    url: "https://gaspm.eth.limo/",
    name: "GasPM",
    logo: { textTop: "Gas", colorTop: "#22c55e" },
  },
};

/**
 * Get external PAMM site info for a resolver address
 */
export const getPAMMExternalSite = (resolverAddress: string) => {
  return PAMM_EXTERNAL_SITES[resolverAddress.toLowerCase()] ?? null;
};

export const getTrustedResolver = (address: string): TrustedResolver | undefined => {
  return TRUSTED_RESOLVERS.find((resolver) => resolver.address.toLowerCase() === address.toLowerCase());
};

export const isPerpetualOracleResolver = (address: string): boolean => {
  const resolver = getTrustedResolver(address);
  return resolver?.isPerpetualOracle === true;
};

/**
 * Check if a resolver is the Resolver Singleton (universal onchain oracle)
 * Markets using this resolver get a gold badge
 */
export const isResolverSingleton = (address: string): boolean => {
  return address.toLowerCase() === RESOLVER_SINGLETON_ADDRESS.toLowerCase();
};

/**
 * Get the category for a resolver address
 */
export const getResolverCategory = (address: string): MarketCategory | undefined => {
  const resolver = getTrustedResolver(address);
  return resolver?.category;
};

/**
 * Keywords for detecting market categories from descriptions
 */
const CATEGORY_KEYWORDS: Record<MarketCategory, string[]> = {
  governance: ["vote", "voting", "proposal", "dao", "governance", "election", "quorum"],
  price: ["price", "eth", "btc", "usd", "chainlink", "oracle", "went up", "went down", "above", "below"],
  balance: ["balance", "punk", "cryptopunk", "nft", "holdings", "treasury", "wallet", "owns"],
  network: ["gas", "gwei", "block", "basefee", "twap", "network", "fee"],
  supply: ["supply", "burn", "mint", "total", "circulating", "inflation", "deflation"],
  protocol: ["uniswap", "fee switch", "protocol", "bounty", "bunni", "aave", "compound"],
  random: ["coinflip", "random", "flip", "dice", "lottery", "blockhash"],
  custom: [], // Catch-all for unmatched
};

/**
 * Detect market category from description text
 * Used for Resolver singleton markets where category depends on the condition
 */
export const detectCategoryFromDescription = (description: string): MarketCategory => {
  const lowerDesc = description.toLowerCase();

  // Check each category's keywords
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [MarketCategory, string[]][]) {
    if (category === "custom") continue; // Skip custom, it's the fallback
    for (const keyword of keywords) {
      if (lowerDesc.includes(keyword)) {
        return category;
      }
    }
  }

  return "custom"; // Default fallback
};

/**
 * Get the display category for a market
 * For Resolver singleton, detects from description; otherwise uses resolver's category
 */
export const getMarketCategory = (resolverAddress: string, description: string): MarketCategory => {
  // Resolver singleton: detect from description
  if (isResolverSingleton(resolverAddress)) {
    return detectCategoryFromDescription(description);
  }

  // Known resolver: use its assigned category
  const resolverCategory = getResolverCategory(resolverAddress);
  if (resolverCategory) {
    return resolverCategory;
  }

  // Unknown resolver: try to detect from description
  return detectCategoryFromDescription(description);
};

/**
 * Category display info for UI
 */
export const CATEGORY_INFO: Record<
  MarketCategory,
  { label: string; icon: string; color: string; description: string }
> = {
  governance: {
    label: "Governance",
    icon: "🗳️",
    color: "text-purple-500",
    description: "DAO voting & proposals",
  },
  price: {
    label: "Price",
    icon: "📈",
    color: "text-green-500",
    description: "Asset price movements",
  },
  balance: {
    label: "Balance",
    icon: "💰",
    color: "text-pink-500",
    description: "Token & NFT holdings",
  },
  network: {
    label: "Network",
    icon: "⛽",
    color: "text-amber-500",
    description: "Gas & network metrics",
  },
  supply: {
    label: "Supply",
    icon: "🔥",
    color: "text-orange-500",
    description: "Token supply changes",
  },
  protocol: {
    label: "Protocol",
    icon: "🔧",
    color: "text-blue-500",
    description: "Protocol events",
  },
  random: {
    label: "Random",
    icon: "🎲",
    color: "text-cyan-500",
    description: "Provably fair games",
  },
  custom: {
    label: "Custom",
    icon: "⚡",
    color: "text-gray-400",
    description: "Custom conditions",
  },
};
