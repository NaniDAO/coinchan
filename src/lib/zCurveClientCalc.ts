import { UNIT_SCALE, unpackQuadCap } from "./zCurveHelpers";
import { calculateCost } from "./zCurveMath";

/**
 * Client-side calculation helpers for zCurve to avoid redundant contract calls
 * These functions mirror the contract's view functions but run locally
 */

/**
 * Calculate how many coins you get for a given ETH amount
 * Mirrors the contract's coinsForETH function
 */
export function calculateCoinsForETH(
  ethIn: bigint,
  netSold: bigint,
  saleCap: bigint,
  quadCap: bigint,
  divisor: bigint,
): bigint {
  if (ethIn === 0n) return 0n;

  // Binary search for the amount of coins that costs approximately ethIn
  let low = 0n;
  let high = saleCap - netSold; // Maximum coins available

  // Early exit if trying to buy more than available
  if (high <= 0n) return 0n;

  const unpacked = unpackQuadCap(quadCap);

  while (high - low > UNIT_SCALE) {
    const mid = (low + high) / 2n;
    const costAtMid = calculateCost(netSold + mid, unpacked, divisor) - calculateCost(netSold, unpacked, divisor);

    if (costAtMid <= ethIn) {
      low = mid;
    } else {
      high = mid;
    }
  }

  // Quantize to UNIT_SCALE
  return (low / UNIT_SCALE) * UNIT_SCALE;
}

/**
 * Calculate the ETH cost to buy an exact amount of coins
 * Mirrors the contract's buyCost function
 */
export function calculateBuyCost(
  coinsOut: bigint,
  netSold: bigint,
  saleCap: bigint,
  quadCap: bigint,
  divisor: bigint,
): bigint {
  if (coinsOut === 0n) return 0n;

  // Check if trying to buy more than available
  if (netSold + coinsOut > saleCap) {
    throw new Error("Exceeds sale cap");
  }

  const unpacked = unpackQuadCap(quadCap);
  const costAfter = calculateCost(netSold + coinsOut, unpacked, divisor);
  const costBefore = calculateCost(netSold, unpacked, divisor);

  return costAfter - costBefore;
}

/**
 * Calculate ETH refund for selling coins
 * Mirrors the contract's sellRefund function
 */
export function calculateSellRefund(coinsIn: bigint, netSold: bigint, quadCap: bigint, divisor: bigint): bigint {
  if (coinsIn === 0n) return 0n;

  // Can't sell more than netSold
  if (coinsIn > netSold) {
    coinsIn = netSold;
  }

  const unpacked = unpackQuadCap(quadCap);
  const costBefore = calculateCost(netSold, unpacked, divisor);
  const costAfter = calculateCost(netSold - coinsIn, unpacked, divisor);

  return costBefore - costAfter;
}

/**
 * Calculate coins needed to get exact ETH out
 * Mirrors the contract's coinsToBurnForETH function
 */
export function calculateCoinsToBurnForETH(ethOut: bigint, netSold: bigint, quadCap: bigint, divisor: bigint): bigint {
  if (ethOut === 0n) return 0n;

  // Binary search for the amount of coins to sell
  let low = 0n;
  let high = netSold;

  while (high - low > UNIT_SCALE) {
    const mid = (low + high) / 2n;
    const refundAtMid = calculateSellRefund(mid, netSold, quadCap, divisor);

    if (refundAtMid < ethOut) {
      low = mid;
    } else {
      high = mid;
    }
  }

  // Round up to ensure we get at least ethOut
  const result = high;

  // Quantize to UNIT_SCALE
  return ((result + UNIT_SCALE - 1n) / UNIT_SCALE) * UNIT_SCALE;
}

// Cache for calculations to avoid recomputation
const calcCache = new Map<string, { value: bigint; timestamp: number }>();
const CALC_CACHE_TTL = 10000; // 10 seconds

/**
 * Cached wrapper for calculations
 */
export function cachedCalculation<T extends (...args: any[]) => bigint>(
  fn: T,
  cacheKey: string,
  ...args: Parameters<T>
): bigint {
  const cached = calcCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CALC_CACHE_TTL) {
    return cached.value;
  }

  const value = fn(...args);
  calcCache.set(cacheKey, { value, timestamp: now });

  // Clean up old entries
  if (calcCache.size > 1000) {
    const entries = Array.from(calcCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    entries.slice(0, 500).forEach(([k]) => calcCache.delete(k));
  }

  return value;
}
