import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { type Address } from "viem";
import { getTokenBalances } from "@/lib/get-token-balances";
import type { Token } from "@/lib/pools";

interface UseTokenBalanceProps {
  address?: Address;
  token: Token;
}

export const keyOf = (t: Token) => `${t.address.toLowerCase()}:${t.id.toString()}`;

export const useTokenBalance = ({ address, token }: UseTokenBalanceProps) => {
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: ["token-balance", address, token.address, token.id.toString()],
    enabled: Boolean(publicClient && address),
    queryFn: async () => {
      if (!publicClient) throw new Error("Public client is not available");
      if (!address) throw new Error("Address is not available");

      const balances = await getTokenBalances({
        publicClient,
        owner: address,
        tokens: [token],
      });

      const balance = balances.get(keyOf(token));

      return balance !== 0n ? balance : 0n;
    },
  });
};
