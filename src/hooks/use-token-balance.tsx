import { CoinsAbi, CoinsAddress } from "@/constants/Coins";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { Token } from "@/lib/pools";
import { useQuery } from "@tanstack/react-query";
import { Address } from "blo";
import { erc20Abi, isAddressEqual, zeroAddress } from "viem";
import { usePublicClient } from "wagmi";

interface UseTokenBalanceProps {
  address?: Address;
  token: Token;
}

export const useTokenBalance = ({ address, token }: UseTokenBalanceProps) => {
  const publicClient = usePublicClient();
  return useQuery({
    queryKey: [
      "token-balance",
      address,
      token?.address?.toString(),
      token?.id?.toString(),
    ],
    queryFn: async () => {
      if (!publicClient) {
        throw new Error("Public client is not available");
      }

      if (!address) {
        throw new Error("Address is not available");
      }

      const isETH = token.address === zeroAddress && token.id === 0n;

      if (isETH) {
        const balance = await publicClient.getBalance({
          address,
        });

        return balance;
      } else if (isAddressEqual(token.address, CoinsAddress)) {
        const balance = await publicClient.readContract({
          address: CoinsAddress,
          abi: CoinsAbi,
          functionName: "balanceOf",
          args: [address, token.id],
        });

        return balance;
      } else if (isAddressEqual(token.address, CookbookAddress)) {
        const balance = await publicClient.readContract({
          address: CookbookAddress,
          abi: CookbookAbi,
          functionName: "balanceOf",
          args: [address, token.id],
        });

        return balance;
      }

      const balance = await publicClient.readContract({
        address: token.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      });

      return balance;
    },
  });
};
