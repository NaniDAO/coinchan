import { keccak256, encodePacked, type Address } from "viem";

// Z AMM address from zCurve contract
const Z_ADDRESS = "0x000000000000040470635EB91b7CE4D132D616eD" as Address;

export interface PoolKey {
  id0: bigint; // Always 0 for ETH
  id1: bigint; // Coin ID
  token0: Address; // Always address(0) for ETH
  token1: Address; // Always Z address
  feeOrHook: bigint; // Fee in bps or hook address
}

/**
 * Compute the pool ID for a zCurve finalized sale
 * This matches the contract's _computePoolId function
 */
export function computeZCurvePoolId(coinId: bigint, feeOrHook: bigint): string {
  const poolKey: PoolKey = {
    id0: 0n, // ETH
    id1: coinId, // Coin ID
    token0: "0x0000000000000000000000000000000000000000" as Address, // ETH
    token1: Z_ADDRESS, // Z AMM token contract
    feeOrHook: feeOrHook, // Fee from sale params
  };

  // Encode the struct according to Solidity ABI encoding
  // PoolKey is 5 * 32 bytes = 160 bytes (0xa0 in hex)
  const encoded = encodePacked(
    ["uint256", "uint256", "address", "address", "uint256"],
    [poolKey.id0, poolKey.id1, poolKey.token0, poolKey.token1, poolKey.feeOrHook],
  );

  return keccak256(encoded);
}

/**
 * Get the expected pool ID from a zCurve sale
 */
export function getExpectedPoolId(sale: { coinId: string; feeOrHook: string }): string {
  return computeZCurvePoolId(BigInt(sale.coinId), BigInt(sale.feeOrHook));
}
