import { useReadContract } from "wagmi";
import { Address } from "viem";
import { CoinsAbi, CoinsAddress } from "@/constants/Coins";
import { ZAAMAddress } from "@/constants/ZAAM";
import { mainnet } from "viem/chains";

export function useOperatorStatus(address: Address | undefined) {
  return useReadContract({
    address: CoinsAddress,
    abi: CoinsAbi,
    functionName: "isOperator",
    args: address ? [address, ZAAMAddress] : undefined,
    chainId: mainnet.id, // Default to mainnet
  });
}
