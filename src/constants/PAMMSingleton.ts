import { keccak256, encodePacked } from "viem";

// PAMM V1 Singleton - ERC6909 prediction market shares
export const PAMMSingletonAddress = "0x000000000044bfe6c2BBFeD8862973E0612f07C0" as const;

// ZAMM address used by PAMM
export const ZAMM_ADDRESS = "0x000000000000040470635EB91b7CE4D132D616eD" as const;

// ABI for PAMM singleton - minimal subset needed for pool detection
export const PAMMSingletonAbi = [
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "getNoId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "getMarket",
    outputs: [
      { internalType: "address", name: "resolver", type: "address" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "bool", name: "resolved", type: "bool" },
      { internalType: "bool", name: "outcome", type: "bool" },
      { internalType: "bool", name: "canClose", type: "bool" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "uint256", name: "collateralLocked", type: "uint256" },
      { internalType: "uint256", name: "yesSupply", type: "uint256" },
      { internalType: "uint256", name: "noSupply", type: "uint256" },
      { internalType: "string", name: "description", type: "string" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "id", type: "uint256" }],
    name: "markets",
    outputs: [
      { internalType: "address", name: "resolver", type: "address" },
      { internalType: "bool", name: "resolved", type: "bool" },
      { internalType: "bool", name: "outcome", type: "bool" },
      { internalType: "bool", name: "canClose", type: "bool" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "uint256", name: "collateralLocked", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "id", type: "uint256" }],
    name: "descriptions",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "totalSupplyId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
    ],
    name: "getPoolState",
    outputs: [
      { internalType: "uint256", name: "rYes", type: "uint256" },
      { internalType: "uint256", name: "rNo", type: "uint256" },
      { internalType: "uint256", name: "pYesNum", type: "uint256" },
      { internalType: "uint256", name: "pYesDen", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "tradingOpen",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Derives the NO token id from a market id (matches PAMM.sol getNoId)
 * noId = keccak256("PMARKET:NO", marketId)
 */
export function deriveNoId(marketId: bigint): bigint {
  return BigInt(
    keccak256(
      encodePacked(["string", "uint256"], ["PMARKET:NO", marketId])
    )
  );
}

/**
 * Checks if a token id could be a YES market id by verifying the corresponding
 * NO id derivation. This is a heuristic since we can't reverse the hash.
 */
export function isPotentialMarketId(id: bigint, otherId: bigint): boolean {
  // Check if id is the marketId (YES) and otherId is the noId (NO)
  const derivedNoId = deriveNoId(id);
  return derivedNoId === otherId;
}

/**
 * Given two token ids from a pool, determines which is YES (marketId) and which is NO (noId)
 * Returns { marketId, noId, yesIsId0 } or null if neither is a valid YES/NO pair
 */
export function identifyYesNoIds(
  id0: bigint,
  id1: bigint
): { marketId: bigint; noId: bigint; yesIsId0: boolean } | null {
  // Check if id0 is marketId and id1 is noId
  if (isPotentialMarketId(id0, id1)) {
    return { marketId: id0, noId: id1, yesIsId0: true };
  }
  // Check if id1 is marketId and id0 is noId
  if (isPotentialMarketId(id1, id0)) {
    return { marketId: id1, noId: id0, yesIsId0: false };
  }
  return null;
}

/**
 * Calculates YES probability from pool reserves
 * YES% = rNo / (rYes + rNo)
 * This is because lower YES reserves means higher YES price (more demand)
 */
export function calculateYesProbability(
  rYes: bigint,
  rNo: bigint
): { yesPercent: number; noPercent: number } {
  const total = rYes + rNo;
  if (total === 0n) {
    return { yesPercent: 50, noPercent: 50 };
  }
  // YES probability = rNo / total (inverse relationship in AMM)
  const yesPercent = (Number(rNo) / Number(total)) * 100;
  return {
    yesPercent,
    noPercent: 100 - yesPercent,
  };
}
