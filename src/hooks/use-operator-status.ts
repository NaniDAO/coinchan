import { useReadContract } from "wagmi";
import { Address } from "viem";
import { CoinsAbi, CoinsAddress } from "@/constants/Coins";
import { ZAMMAddress } from "@/constants/ZAAM";
import { mainnet } from "viem/chains";

export function useOperatorStatus({
  address,
  operator = ZAMMAddress,
}: {
  address: Address | undefined;
  operator: Address;
}) {
  return useReadContract({
    address: CoinsAddress,
    abi: CoinsAbi,
    functionName: "isOperator",
    args: address ? [address, operator] : undefined,
    chainId: mainnet.id, // Default to mainnet
  });
}
