import { keccak256, encodeAbiParameters, parseAbiParameters, type Address } from "viem";
import { CookbookAddress } from "@/constants/Cookbook";

// Default fee in bps (30 = 0.3%)
const DEFAULT_FEE_BPS = 30n;

export interface PoolKey {
  id0: bigint; // Always 0 for ETH
  id1: bigint; // Coin ID
  token0: Address; // Always address(0) for ETH
  token1: Address; // Always Cookbook address
  feeOrHook: bigint; // Fee in bps or hook address
}

/**
 * Compute the pool ID for a zCurve finalized sale
 * This matches the contract's _computePoolId function
 */
export function computeZCurvePoolId(coinId: bigint, feeOrHook: bigint = DEFAULT_FEE_BPS): string {
  const poolKey: PoolKey = {
    id0: 0n, // ETH
    id1: coinId, // Coin ID
    token0: "0x0000000000000000000000000000000000000000" as Address, // ETH
    token1: CookbookAddress, // Cookbook AMM contract
    feeOrHook: feeOrHook, // Fee from sale params (default 30 bps)
  };

  console.log("Computing pool ID with:", {
    id0: poolKey.id0.toString(),
    id1: poolKey.id1.toString(),
    token0: poolKey.token0,
    token1: poolKey.token1,
    feeOrHook: poolKey.feeOrHook.toString(),
  });

  // Encode the struct according to Solidity ABI encoding
  // Must match the encoding used in computePoolId from swap.ts
  const encoded = encodeAbiParameters(
    parseAbiParameters("uint256 id0, uint256 id1, address token0, address token1, uint256 feeOrHook"),
    [poolKey.id0, poolKey.id1, poolKey.token0, poolKey.token1, poolKey.feeOrHook],
  );

  const poolId = keccak256(encoded);
  console.log("Computed pool ID:", poolId);
  
  return poolId;
}

/**
 * Get the expected pool ID from a zCurve sale
 */
export function getExpectedPoolId(sale: { coinId: string; feeOrHook: string }): string {
  const feeOrHook = sale.feeOrHook ? BigInt(sale.feeOrHook) : DEFAULT_FEE_BPS;
  // Use default fee if feeOrHook is 0 or missing
  const finalFee = feeOrHook === 0n ? DEFAULT_FEE_BPS : feeOrHook;
  return computeZCurvePoolId(BigInt(sale.coinId), finalFee);
}
