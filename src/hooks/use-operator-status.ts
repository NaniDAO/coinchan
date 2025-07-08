import { CoinsAbi, CoinsAddress } from "@/constants/Coins";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { ZAMMAddress } from "@/constants/ZAAM";
import type { Address } from "viem";
import { mainnet } from "viem/chains";
import { useReadContract } from "wagmi";

export function useOperatorStatus({
  address,
  operator = ZAMMAddress,
  tokenId,
}: {
  address: Address | undefined;
  operator: Address;
  tokenId?: bigint;
}) {
  // Determine which contract to query based on token ID
  // Cookbook coins: ID < 1000000, ZAMM coins: ID >= 1000000
  const isZAMMToken = tokenId !== undefined && tokenId >= 1000000n;
  const contractAddress = isZAMMToken ? CoinsAddress : CookbookAddress;
  const contractAbi = isZAMMToken ? CoinsAbi : CookbookAbi;

  return useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: "isOperator",
    args: address ? [address, operator] : undefined,
    chainId: mainnet.id,
    query: {
      enabled: !!address && !!operator && tokenId !== undefined,
    },
  });
}
