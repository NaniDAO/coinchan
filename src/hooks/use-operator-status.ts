import { CoinsAbi, CoinsAddress } from "@/constants/Coins";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { ZAMMAddress } from "@/constants/ZAAM";
import type { Address } from "viem";
import { mainnet } from "viem/chains";
import { useReadContract } from "wagmi";

// PAMM contract for prediction market shares
const PAMMAddress = "0x000000000044bfe6c2BBFeD8862973E0612f07C0" as const;

// Simple ABI for PAMM isOperator check
const PAMMAbi = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    name: "isOperator",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export function useOperatorStatus({
  address,
  operator = ZAMMAddress,
  tokenId,
  contractOverride,
}: {
  address: Address | undefined;
  operator: Address;
  tokenId?: bigint;
  contractOverride?: Address;
}) {
  // Determine which contract to query
  // If contractOverride is provided (e.g., PAMM for PM orders), use that
  // Otherwise: Cookbook coins: ID < 1000000, ZAMM coins: ID >= 1000000
  const isZAMMToken = tokenId !== undefined && tokenId >= 1000000n;
  const isPAMM = contractOverride?.toLowerCase() === PAMMAddress.toLowerCase();

  const contractAddress = contractOverride ?? (isZAMMToken ? CoinsAddress : CookbookAddress);
  const contractAbi = isPAMM ? PAMMAbi : isZAMMToken ? CoinsAbi : CookbookAbi;

  return useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: "isOperator",
    args: address ? [address, operator] : undefined,
    chainId: mainnet.id,
    query: {
      // For PAMM, we don't need tokenId to be defined
      enabled: !!address && !!operator && (isPAMM || tokenId !== undefined),
    },
  });
}
