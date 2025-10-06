export interface TrustedResolver {
  address: string;
  name: string;
  description?: string;
}

export const TRUSTED_RESOLVERS: TrustedResolver[] = [
  {
    address: "0x1C0Aa8cCD568d90d61659F060D1bFb1e6f855A20",
    name: "Trusted Resolver #1",
    description: "Verified trusted resolver",
  },
  // Add more trusted resolvers here
];

export const isTrustedResolver = (address: string): boolean => {
  return TRUSTED_RESOLVERS.some(
    (resolver) => resolver.address.toLowerCase() === address.toLowerCase()
  );
};

export const getTrustedResolver = (
  address: string
): TrustedResolver | undefined => {
  return TRUSTED_RESOLVERS.find(
    (resolver) => resolver.address.toLowerCase() === address.toLowerCase()
  );
};
