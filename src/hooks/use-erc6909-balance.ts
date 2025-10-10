import { useReadContract } from "wagmi";
import { type Address } from "viem";
import { CoinsAbi, CoinsAddress } from "@/constants/Coins";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";

interface UseERC6909BalanceParams {
  address?: Address;
  tokenAddress?: Address;
  tokenId?: bigint;
  enabled?: boolean;
}

export function useERC6909Balance({ address, tokenAddress, tokenId, enabled = true }: UseERC6909BalanceParams) {
  // Determine which contract and ABI to use
  const isCoins = tokenAddress && tokenAddress.toLowerCase() === CoinsAddress.toLowerCase();
  const isCookbook = tokenAddress && tokenAddress.toLowerCase() === CookbookAddress.toLowerCase();

  const contractConfig = isCoins
    ? { address: CoinsAddress, abi: CoinsAbi }
    : isCookbook
      ? { address: CookbookAddress, abi: CookbookAbi }
      : null;

  return useReadContract({
    address: contractConfig?.address,
    abi: contractConfig?.abi,
    functionName: "balanceOf",
    args: address && tokenId !== undefined ? [address, tokenId] : undefined,
    query: {
      enabled: enabled && !!address && !!contractConfig && tokenId !== undefined,
    },
  });
}
