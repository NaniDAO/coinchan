// Constants from zCurve contract
export const UNIT_SCALE = BigInt("1000000000000"); // 1e12
export const QUADCAP_MASK = (BigInt(1) << BigInt(96)) - BigInt(1);
export const LP_UNLOCK_SHIFT = BigInt(160);

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
