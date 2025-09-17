import { getTokenBalances } from "@/lib/get-token-balances";
import { Token, TokenMetadata } from "@/lib/pools";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { keyOf } from "./use-token-balance";

export const useGetToken = ({ token }: { token: Token }) => {
  const publicClient = usePublicClient();
  const { address } = useAccount();
  return useQuery({
    queryKey: ["get-token", token.address.toString(), token.id.toString()],
    queryFn: async () => {
      const res = await fetch(import.meta.env.VITE_INDEXER_URL + "/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
            query GetCoin($id: BigInt!, $token: String!) {
              coin(id: $id, token: $token) {
                createdAt
                creationTxHash
                decimals
                description
                id
                imageUrl
                name
                owner
                source
                symbol
                token
                tokenURI
                totalSupply
                updatedAt
              }
            }
          `,
          variables: {
            id: token.id.toString(),
            token: token.address.toString(),
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.statusText}`);
      }

      const { data, errors } = await res.json();
      if (errors) {
        throw new Error(errors.map((e: any) => e.message).join(", "));
      }

      const coin: TokenMetadata = {
        address: data.coin.token,
        id: data.coin.id,
        name: data.coin.name,
        symbol: data.coin.symbol,
        decimals: data.coin.decimals,
        imageUrl: data.coin.imageUrl,
        description: data.coin.description,
        standard: data.coin.source === "ERC20" ? "ERC20" : "ERC6909",
        balance: 0n,
      };

      if (publicClient && address) {
        const balances = await getTokenBalances({
          publicClient,
          owner: address,
          tokens: [token],
        });

        const balance = balances.get(keyOf(token));

        coin.balance = balance !== 0n ? balance : 0n;
      }

      return coin;
    },
  });
};
