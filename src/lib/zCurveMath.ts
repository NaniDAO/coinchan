import { parseEther } from "viem";
import { UNIT_SCALE } from "./zCurveHelpers";

/**
 * Calculate the cost of buying coins using the zCurve quadratic-then-linear model
 * @param n Number of coins to buy (in base units with 18 decimals)
 * @param quadCap Quadratic cap - where the curve transitions from quadratic to linear
 * @param divisor The divisor that controls the curve steepness
 * @returns Total cost in wei
 */
export function calculateCost(n: bigint, quadCap: bigint, divisor: bigint): bigint {
  // Ensure divisor is not zero
  if (divisor === 0n) {
    throw new Error("Invalid divisor: cannot be zero");
  }

  // Convert to "tick" count (1 tick = UNIT_SCALE base-units)
  const m = n / UNIT_SCALE;

  // First tick free
  if (m < 2n) return 0n;

  // How many ticks do we run pure-quad? Up to the quadCap
  const K = quadCap / UNIT_SCALE;

  // We factor out the common (6*d) denominator and 1 ETH numerator
  const denom = 6n * divisor;
  const oneETH = parseEther("1");

  if (m <= K) {
    // PURE QUADRATIC PHASE
    // sum_{i=0..m-1} i^2 = m*(m-1)*(2m-1)/6
    const sumSq = (m * (m - 1n) * (2n * m - 1n)) / 6n;
    return (sumSq * oneETH) / denom;
  } else {
    // MIXED PHASE: QUAD TILL K, THEN LINEAR TAIL
    // 1) Quad area for first K ticks:
    //    sum_{i=0..K-1} i^2 = K*(K-1)*(2K-1)/6
    const sumK = (K * (K - 1n) * (2n * K - 1n)) / 6n;
    const quadCost = (sumK * oneETH) / denom;

    // 2) Marginal price at tick K (for ticks K→m):
    //    p_K = cost(K+1) - cost(K) = (K^2 * 1 ETH) / (6*d)
    const pK = (K * K * oneETH) / denom;

    // 3) Linear tail for the remaining (m - K) ticks
    const tailTicks = m - K;
    const tailCost = pK * tailTicks;

    return quadCost + tailCost;
  }
}

/**
 * Calculate the divisor needed to achieve a target amount raised for a given sale cap
 * @param saleCap Total coins for sale
 * @param quadCap Quadratic cap - where curve transitions to linear
 * @param targetRaised Target ETH to raise when all coins are sold
 * @returns Divisor value
 */
export function calculateDivisor(saleCap: bigint, quadCap: bigint, targetRaised: bigint): bigint {
  // We need to solve for divisor such that calculateCost(saleCap, quadCap, divisor) = targetRaised
  // This requires inverting the cost formula

  const m = saleCap / UNIT_SCALE;
  const K = quadCap / UNIT_SCALE;
  const oneETH = parseEther("1");

  if (m <= K) {
    // Pure quadratic case
    const sumSq = (m * (m - 1n) * (2n * m - 1n)) / 6n;
    // targetRaised = (sumSq * oneETH) / (6 * divisor)
    // divisor = (sumSq * oneETH) / (6 * targetRaised)
    return (sumSq * oneETH) / (6n * targetRaised);
  } else {
    // Mixed case
    // Calculate quad portion
    const sumK = (K * (K - 1n) * (2n * K - 1n)) / 6n;

    // For the mixed case:
    // targetRaised = quadCost + tailCost
    // targetRaised = (sumK * oneETH) / (6 * divisor) + (K^2 * oneETH * (m - K)) / (6 * divisor)
    // targetRaised = oneETH / (6 * divisor) * (sumK + K^2 * (m - K))
    // divisor = oneETH * (sumK + K^2 * (m - K)) / (6 * targetRaised)

    const tailTicks = m - K;
    const totalWeightedTicks = sumK + K * K * tailTicks;
    return (totalWeightedTicks * oneETH) / (6n * targetRaised);
  }
}

/**
 * Calculate divisor for the oneshot parameters
 * Target: 0.01 ETH raised for 800M saleCap with 200M quadCap
 * This is for testing purposes with a lower ETH requirement
 */
export function calculateOneshotDivisor(): bigint {
  const saleCap = parseEther("800000000"); // 800M
  const quadCap = parseEther("200000000"); // 200M
  const targetRaised = parseEther("0.01"); // 0.01 ETH - for testing

  return calculateDivisor(saleCap, quadCap, targetRaised);
}

/**
 * Get preset divisor values for common target raises
 * These are pre-calculated for the standard 800M sale / 200M quadcap
 */
export function getPresetDivisor(targetETH: "0.01" | "0.1" | "0.5" | "1" | "2" | "5" | "8.5"): bigint {
  const presets: Record<string, bigint> = {
    "0.01": 444444444444444111111111111111666666666666666n, // Original (too flat)
    "0.1": 44444444444444411111111111111166666666666666n, // 10x steeper
    "0.5": 8888888888888882222222222222233333333333333n, // Better price discovery
    "1": 4444444444444441111111111111116666666666666n, // Good balance
    "2": 2222222222222220555555555555558333333333333n, // Recommended
    "5": 888888888888888222222222222223333333333333n, // Aggressive
    "8.5": 522875816993463660130718954249019607843137n, // Pump.fun style
  };

  return presets[targetETH];
}

/**
 * Calculate divisor dynamically for different preset target raises
 */
export function calculatePresetDivisor(targetETH: string): bigint {
  const saleCap = parseEther("800000000"); // 800M
  const quadCap = parseEther("200000000"); // 200M
  const targetRaised = parseEther(targetETH);

  return calculateDivisor(saleCap, quadCap, targetRaised);
}
