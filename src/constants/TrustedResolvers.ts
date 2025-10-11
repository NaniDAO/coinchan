export interface TrustedResolver {
  address: string;
  name: string;
  description?: string;
  isPerpetualOracle?: boolean; // Special flag for programmatic perpetual oracle resolvers
}

export const ETH_WENT_UP_RESOLVER_ADDRESS = "0x40cc6F9ca737a0aA746b645cFc92a67942162CC3" as const;

export const TRUSTED_RESOLVERS: TrustedResolver[] = [
  {
    address: ETH_WENT_UP_RESOLVER_ADDRESS,
    name: "EthWentUpResolver",
    description: "Perpetual oracle resolver for ETH price movements using Chainlink feeds",
    isPerpetualOracle: true,
  },
  {
    address: "0x1C0Aa8cCD568d90d61659F060D1bFb1e6f855A20",
    name: "Trusted Resolver #1",
    description: "Verified trusted resolver",
  },
  // Add more trusted resolvers here
];

export const isTrustedResolver = (address: string): boolean => {
  return TRUSTED_RESOLVERS.some((resolver) => resolver.address.toLowerCase() === address.toLowerCase());
};

export const getTrustedResolver = (address: string): TrustedResolver | undefined => {
  return TRUSTED_RESOLVERS.find((resolver) => resolver.address.toLowerCase() === address.toLowerCase());
};

export const isPerpetualOracleResolver = (address: string): boolean => {
  const resolver = getTrustedResolver(address);
  return resolver?.isPerpetualOracle === true;
};
