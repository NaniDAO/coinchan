import { parseEther, formatEther } from "viem";
import { calculateCost, calculateDivisor } from "./zCurveMath";
import { UNIT_SCALE } from "./zCurveHelpers";

interface CurveAnalysis {
  targetRaised: bigint;
  divisor: bigint;
  avgPricePerToken: bigint;
  avgPricePerTokenFormatted: string;
  priceAt25Percent: bigint;
  priceAt50Percent: bigint;
  priceAt75Percent: bigint;
  priceAt100Percent: bigint;
  priceAt25PercentFormatted: string;
  priceAt50PercentFormatted: string;
  priceAt75PercentFormatted: string;
  priceAt100PercentFormatted: string;
  costFor1ETH: bigint; // How many tokens you get for 1 ETH at start
  costFor1ETHFormatted: string;
}

/**
 * Analyze different target raises for the zCurve
 * @param saleCap Total tokens for sale (default 800M)
 * @param quadCap Quadratic cap (default 200M)
 * @param targetRaises Array of target ETH amounts to analyze
 */
export function analyzeCurveScenarios(
  saleCap = parseEther("800000000"), // 800M
  quadCap = parseEther("200000000"), // 200M
  targetRaises: bigint[] = [
    parseEther("0.01"), // Current target
    parseEther("0.1"), // 10x current
    parseEther("0.5"), // 50x current
    parseEther("1"), // 100x current
    parseEther("2"), // 200x current
    parseEther("5"), // 500x current
    parseEther("8.5"), // ~pump.fun equivalent
  ],
): CurveAnalysis[] {
  const results: CurveAnalysis[] = [];

  for (const targetRaised of targetRaises) {
    const divisor = calculateDivisor(saleCap, quadCap, targetRaised);

    // Calculate average price
    const avgPricePerToken = (targetRaised * parseEther("1")) / saleCap;

    // Calculate marginal prices at different points
    const calculate25 = (saleCap * 25n) / 100n;
    const calculate50 = (saleCap * 50n) / 100n;
    const calculate75 = (saleCap * 75n) / 100n;

    // Marginal price = cost per full token (1e18 units)
    // Since UNIT_SCALE = 1e12, we need to calculate price for 1e18/1e12 = 1e6 units

    const priceAt25Percent =
      calculateCost(calculate25 + parseEther("1"), quadCap, divisor) - calculateCost(calculate25, quadCap, divisor);
    const priceAt50Percent =
      calculateCost(calculate50 + parseEther("1"), quadCap, divisor) - calculateCost(calculate50, quadCap, divisor);
    const priceAt75Percent =
      calculateCost(calculate75 + parseEther("1"), quadCap, divisor) - calculateCost(calculate75, quadCap, divisor);
    const priceAt100Percent =
      calculateCost(saleCap, quadCap, divisor) - calculateCost(saleCap - parseEther("1"), quadCap, divisor);

    // Calculate how many tokens you can buy with 1 ETH at the start
    // Binary search for the amount of tokens that costs exactly 1 ETH
    let lo = 0n;
    let hi = saleCap;
    const oneETH = parseEther("1");

    while (lo < hi) {
      const mid = (lo + hi + 1n) / 2n;
      const cost = calculateCost(mid, quadCap, divisor);
      if (cost <= oneETH) {
        lo = mid;
      } else {
        hi = mid - 1n;
      }
    }

    // Quantize down to nearest unit scale
    const costFor1ETH = (lo / UNIT_SCALE) * UNIT_SCALE;

    results.push({
      targetRaised,
      divisor,
      avgPricePerToken,
      avgPricePerTokenFormatted: formatEther(avgPricePerToken),
      priceAt25Percent,
      priceAt50Percent,
      priceAt75Percent,
      priceAt100Percent,
      priceAt25PercentFormatted: formatEther(priceAt25Percent),
      priceAt50PercentFormatted: formatEther(priceAt50Percent),
      priceAt75PercentFormatted: formatEther(priceAt75Percent),
      priceAt100PercentFormatted: formatEther(priceAt100Percent),
      costFor1ETH,
      costFor1ETHFormatted: formatEther(costFor1ETH),
    });
  }

  return results;
}

/**
 * Generate price curve data points for visualization
 * @param saleCap Total tokens for sale
 * @param quadCap Quadratic cap
 * @param divisor The divisor value
 * @param numPoints Number of data points to generate
 */
export function generatePriceCurve(
  saleCap: bigint,
  quadCap: bigint,
  divisor: bigint,
  numPoints = 100,
): Array<{ tokens: bigint; totalCost: bigint; marginalPrice: bigint; percentSold: number }> {
  const points = [];

  for (let i = 0; i <= numPoints; i++) {
    const tokens = (saleCap * BigInt(i)) / BigInt(numPoints);
    const totalCost = calculateCost(tokens, quadCap, divisor);

    // Calculate marginal price (price of next unit)
    let marginalPrice = 0n;
    if (tokens < saleCap) {
      marginalPrice = calculateCost(tokens + UNIT_SCALE, quadCap, divisor) - calculateCost(tokens, quadCap, divisor);
    }

    points.push({
      tokens,
      totalCost,
      marginalPrice,
      percentSold: (i / numPoints) * 100,
    });
  }

  return points;
}

/**
 * Compare pump.fun-style curve vs current implementation
 */
export function compareToPumpFun(): void {
  const saleCap = parseEther("800000000"); // 800M tokens
  const quadCap = parseEther("200000000"); // 200M tokens

  console.log("=== zCurve Analysis: Comparing Different Target Raises ===\n");

  const scenarios = analyzeCurveScenarios(saleCap, quadCap);

  scenarios.forEach((scenario, index) => {
    console.log(`\nScenario ${index + 1}: Target Raise = ${formatEther(scenario.targetRaised)} ETH`);
    console.log(`  Divisor: ${scenario.divisor}`);
    console.log(`  Average price per token: ${scenario.avgPricePerTokenFormatted} ETH`);
    console.log(`  Tokens for 1 ETH at start: ${formatEther(scenario.costFor1ETH)} tokens`);
    console.log(`  Price progression:`);
    console.log(`    - At 25% sold: ${scenario.priceAt25PercentFormatted} ETH per token`);
    console.log(`    - At 50% sold: ${scenario.priceAt50PercentFormatted} ETH per token`);
    console.log(`    - At 75% sold: ${scenario.priceAt75PercentFormatted} ETH per token`);
    console.log(`    - At 100% sold: ${scenario.priceAt100PercentFormatted} ETH per token`);

    // Calculate price multiplier from start to end
    const startPrice = calculateCost(parseEther("1"), quadCap, scenario.divisor); // Price of first full token
    const multiplier = startPrice > 0n ? (scenario.priceAt100Percent * 1000n) / startPrice : 0n;
    console.log(`  Price multiplier (start to end): ${(Number(multiplier) / 1000).toFixed(2)}x`);
  });

  console.log("\n=== Recommendations ===");
  console.log("\n1. Current (0.01 ETH target):");
  console.log("   - Too flat, requires buying millions of tokens for small ETH amounts");
  console.log("   - Minimal price discovery and excitement");
  console.log("\n2. Moderate (0.5-1 ETH target):");
  console.log("   - Better balance between accessibility and price action");
  console.log("   - Users can buy meaningful amounts without huge token counts");
  console.log("\n3. Aggressive (2-5 ETH target):");
  console.log("   - More similar to successful bonding curves on other platforms");
  console.log("   - Creates stronger price discovery and FOMO dynamics");
  console.log("\n4. Pump.fun equivalent (~8.5 ETH):");
  console.log("   - Matches proven model from Solana ecosystem");
  console.log("   - High potential for price appreciation");
}

// Export a function to run the analysis
export function runAnalysis() {
  compareToPumpFun();
}
