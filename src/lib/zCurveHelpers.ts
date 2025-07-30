// Constants from zCurve contract
export const UNIT_SCALE = BigInt("1000000000000"); // 1e12
export const QUADCAP_MASK = (BigInt(1) << BigInt(96)) - BigInt(1);
export const LP_UNLOCK_SHIFT = BigInt(160);

// Standard zCurve parameters (all zCurve sales use these)
export const ZCURVE_STANDARD_PARAMS = {
  TOTAL_SUPPLY: 1_000_000_000n * 10n ** 18n, // 1 billion tokens
  SALE_CAP: 800_000_000n * 10n ** 18n, // 800M tokens
  QUAD_CAP: 552_000_000n * 10n ** 18n, // 552M tokens (69% of sale cap)
  LP_SUPPLY: 200_000_000n * 10n ** 18n, // 200M tokens
  ETH_TARGET: 10n * 10n ** 18n, // 10 ETH
  CREATOR_SUPPLY: 0n, // No creator allocation
  DIVISOR: 2193868799999997460800000000001533333333334n, // Standard divisor for pricing curve
} as const;

/**
 * Extract the actual quadCap value from the packed quadCapWithFlags
 * The contract stores quadCap in the lower 96 bits
 */
export function unpackQuadCap(packedQuadCap: bigint): bigint {
  return packedQuadCap & QUADCAP_MASK;
}

/**
 * Pack quadCap with LP unlock timestamp
 * @param quadCap The quadratic cap value
 * @param lpUnlock The LP unlock timestamp (0 means keep in zCurve)
 */
export function packQuadCap(quadCap: bigint, lpUnlock: bigint = 0n): bigint {
  return quadCap | (lpUnlock << LP_UNLOCK_SHIFT);
}
