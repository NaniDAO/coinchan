import { useReadContract } from "wagmi";
import { Address } from "viem";
import { CoinsAbi, CoinsAddress } from "@/constants/Coins";
import { ZAMMAddress } from "@/constants/ZAAM";
import { mainnet } from "viem/chains";

export function useOperatorStatus(address: Address | undefined) {
  return useReadContract({
    address: CoinsAddress,
    abi: CoinsAbi,
    functionName: "isOperator",
    args: address ? [address, ZAMMAddress] : undefined,
    chainId: mainnet.id, // Default to mainnet
  });
}
