export interface TrustedResolver {
  address: string;
  name: string;
  description?: string;
  isPerpetualOracle?: boolean; // Special flag for programmatic perpetual oracle resolvers
}

export const ETH_WENT_UP_RESOLVER_ADDRESS = "0x904EB96808704d0dB0469640188FCA86B762912b" as const;
export const COINFLIP_RESOLVER_ADDRESS = "0xeAd4D6A7C5C0D8ff7bFbe3ab1b4b4bc596C1FD1c" as const;
export const NOUNS_PASS_VOTING_RESOLVER_ADDRESS = "0x1637047F090D6b38D81DA0C589D4D8B9D3C7F32e" as const;
export const BETH_PM_RESOLVER_ADDRESS = "0x9E52F272bACf991FC842704593c86820Ab3e0dB8" as const;

export const TRUSTED_RESOLVERS: TrustedResolver[] = [
  {
    address: ETH_WENT_UP_RESOLVER_ADDRESS,
    name: "EthWentUpResolver",
    description: "Perpetual oracle resolver for ETH price movements using Chainlink feeds",
    isPerpetualOracle: true,
  },
  {
    address: COINFLIP_RESOLVER_ADDRESS,
    name: "CoinflipResolver",
    description: "Perpetual oracle resolver for provably fair coinflips using blockhashes",
    isPerpetualOracle: true,
  },
  {
    address: NOUNS_PASS_VOTING_RESOLVER_ADDRESS,
    name: "NounsPassVotingResolver",
    description: "Perpetual oracle resolver for Nouns DAO proposal voting outcomes",
    isPerpetualOracle: true,
  },
  {
    address: BETH_PM_RESOLVER_ADDRESS,
    name: "BETHPM",
    description: "Perpetual oracle resolver for BETH (BasedETH) burn milestones",
    isPerpetualOracle: true,
  },
  {
    address: "0x1C0Aa8cCD568d90d61659F060D1bFb1e6f855A20",
    name: "Trusted Resolver #1",
    description: "Verified trusted resolver",
  },
  {
    address: "0x2117bf88b4Cb0186eaA87500A045fc998290E42a",
    name: "Trusted Resolver #2",
    description: "Verified trusted resolver",
  },
  {
    address: "0xA23dfEA786465E0Ef51eD6C288c9f0070d047ef7",
    name: "Trusted Resolver #3",
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
