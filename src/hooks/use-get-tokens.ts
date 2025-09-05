import { TokenMetadata } from "@/lib/pools";
import { useQuery } from "@tanstack/react-query";
import { zeroAddress } from "viem";

export const useGetTokens = () => {
  return useQuery({
    queryKey: ["token-list"],
    queryFn: async (): Promise<TokenMetadata[]> => {
      const response = await fetch(
        "https://assets.zamm.finance/tokenlist.json",
      );
      const data = await response.json();

      return data.tokens.map((token: any) => {
        if (token.extensions.standard === "ERC20") {
          return {
            address: token.address,
            id: 0n,
            standard: "ERC20",
            name: token.name,
            symbol: token.symbol,
            decimals: token.decimals,
            description: token?.extensions?.ai?.description,
            tags: token?.extensions?.ai?.tags || [],
            imageUrl: token.logoURI,
          };
        } else {
          // insert eth logo
          let logoUri = token.logoURI;
          if (
            token.address === zeroAddress &&
            BigInt(token.extensions.id) === 0n
          ) {
            logoUri =
              "https://assets.coingecko.com/coins/images/279/standard/ethereum.png?1727872989";
          }

          return {
            address: token.address,
            id: BigInt(token.extensions.id),
            standard: "ERC6909",
            name: token.name,
            symbol: token.symbol,
            decimals: token.decimals,
            description: token?.extensions?.ai?.description,
            tags: token?.extensions?.ai?.tags || [],
            imageUrl: logoUri,
          };
        }
      });
    },
  });
};
