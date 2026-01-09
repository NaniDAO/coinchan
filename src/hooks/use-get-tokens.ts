import { TokenMetadata } from "@/lib/pools";
import { useQuery } from "@tanstack/react-query";
import { zeroAddress, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { getTokenBalances } from "@/lib/get-token-balances";
import { useCustomTokens } from "@/hooks/use-custom-tokens";
import { useMemo } from "react";

type TokenListItem = {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
  extensions: {
    standard: "ERC20" | "ERC6909";
    id?: string | number; // for ERC6909
    ai?: { description?: string; tags?: string[] };
  };
};

const keyOf = (t: Pick<TokenMetadata, "address" | "id">) => `${t.address.toLowerCase()}:${t.id.toString()}`;

export const useGetTokens = (owner?: Address) => {
  const publicClient = usePublicClient();
  const { customTokens } = useCustomTokens();

  const queryResult = useQuery({
    queryKey: ["token-list-with-balances", owner],
    queryFn: async (): Promise<TokenMetadata[]> => {
      const response = await fetch("https://assets.zamm.finance/tokenlist.json");
      const data = await response.json();

      const tokens: TokenMetadata[] = (data.tokens as TokenListItem[]).map((token) => {
        if (token.extensions.standard === "ERC20") {
          return {
            address: token.address,
            id: 0n,
            standard: "ERC20",
            name: token.name,
            symbol: token.symbol,
            decimals: token.decimals,
            description: token.extensions?.ai?.description,
            tags: token.extensions?.ai?.tags || [],
            imageUrl: token.logoURI,
          };
        } else {
          let logoUri = token.logoURI;
          const idBig = BigInt(token.extensions.id ?? 0);
          if (token.address === zeroAddress && idBig === 0n) {
            logoUri = "https://assets.coingecko.com/coins/images/279/standard/ethereum.png?1727872989";
          }
          return {
            address: token.address,
            id: idBig,
            standard: "ERC6909",
            name: token.name,
            symbol: token.symbol,
            decimals: token.decimals,
            description: token.extensions?.ai?.description,
            tags: token.extensions?.ai?.tags || [],
            imageUrl: logoUri,
          };
        }
      });

      // ✅ Uniq by address:id (first occurrence wins; stable order)
      const seen = new Set<string>();
      const uniqTokens = tokens.filter((t) => {
        const k = keyOf(t);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      // No owner or no client? return uniq list (no balances)
      if (!owner || !publicClient) return uniqTokens;

      const balances = await getTokenBalances({
        publicClient,
        owner,
        tokens: uniqTokens, // fetch only for unique tokens
      });

      const tokensWithBalances = uniqTokens.map((t) => {
        const balance = balances.get(keyOf(t)) ?? 0n;
        return { ...t, balance };
      });

      // Sort by balance desc, then by symbol asc for deterministic ties
      tokensWithBalances.sort((a, b) => {
        if (a.balance !== b.balance) return a.balance > b.balance ? -1 : 1;
        return a.symbol.localeCompare(b.symbol);
      });

      return tokensWithBalances;
    },
    staleTime: 60_000,
    gcTime: 30 * 60_000,
  });

  // Convert custom tokens to TokenMetadata format and merge
  const customTokensAsMetadata: TokenMetadata[] = useMemo(
    () =>
      customTokens.map((t) => ({
        address: t.token1 as Address,
        id: t.id ?? 0n,
        name: t.name,
        symbol: t.symbol,
        imageUrl: t.imageUrl || "",
        decimals: t.decimals || 18,
        standard: "ERC20" as const,
        balance: t.balance ?? 0n,
      })),
    [customTokens],
  );

  const mergedData = useMemo(
    () => (queryResult.data ? [...queryResult.data, ...customTokensAsMetadata] : customTokensAsMetadata),
    [queryResult.data, customTokensAsMetadata],
  );

  return {
    ...queryResult,
    data: mergedData,
  };
};
