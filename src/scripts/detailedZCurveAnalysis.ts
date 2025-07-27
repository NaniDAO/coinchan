import { parseEther, formatEther } from "viem";
import { calculateCost, calculateDivisor } from "../lib/zCurveMath";

function analyzeCurveDetailed(
  targetRaisedETH: string,
  saleCap = parseEther("800000000"), // 800M
  quadCap = parseEther("200000000"), // 200M
) {
  const targetRaised = parseEther(targetRaisedETH);
  const divisor = calculateDivisor(saleCap, quadCap, targetRaised);

  console.log(`\n=== Analysis for ${targetRaisedETH} ETH Target ===`);
  console.log(`Divisor: ${divisor}`);

  // Calculate key price points
  const checkpoints = [
    { percent: 0.01, label: "0.01%" },
    { percent: 1, label: "1%" },
    { percent: 5, label: "5%" },
    { percent: 10, label: "10%" },
    { percent: 25, label: "25% (quad cap)" },
    { percent: 50, label: "50%" },
    { percent: 75, label: "75%" },
    { percent: 100, label: "100%" },
  ];

  console.log("\nPrice progression:");
  console.log("Supply Sold | Marginal Price | Total Raised | Tokens for 0.1 ETH");
  console.log("-".repeat(70));

  for (const checkpoint of checkpoints) {
    const tokensSold = (saleCap * BigInt(Math.floor(checkpoint.percent * 100))) / 10000n;
    const totalCost = calculateCost(tokensSold, quadCap, divisor);

    // Calculate marginal price (price per full token)
    let marginalPrice = 0n;
    if (tokensSold < saleCap) {
      marginalPrice =
        calculateCost(tokensSold + parseEther("1"), quadCap, divisor) - calculateCost(tokensSold, quadCap, divisor);
    }

    // Calculate how many tokens you get for 0.1 ETH at this point
    const testAmount = parseEther("0.1");
    let tokensFor01ETH = 0n;
    if (tokensSold < saleCap) {
      // Binary search for tokens that cost 0.1 ETH
      let lo = 0n;
      let hi = saleCap - tokensSold;
      while (lo < hi) {
        const mid = (lo + hi + 1n) / 2n;
        const cost = calculateCost(tokensSold + mid, quadCap, divisor) - calculateCost(tokensSold, quadCap, divisor);
        if (cost <= testAmount) {
          lo = mid;
        } else {
          hi = mid - 1n;
        }
      }
      tokensFor01ETH = lo;
    }

    console.log(
      `${checkpoint.label.padEnd(15)} | ${formatEther(marginalPrice).padEnd(14)} | ${formatEther(totalCost).padEnd(12)} | ${formatEther(tokensFor01ETH)}`,
    );
  }

  // Calculate starting and ending prices
  const startPrice = calculateCost(parseEther("1"), quadCap, divisor);
  const endPrice =
    calculateCost(saleCap, quadCap, divisor) - calculateCost(saleCap - parseEther("1"), quadCap, divisor);
  const priceMultiplier = startPrice > 0n ? Number((endPrice * 1000n) / startPrice) / 1000 : 0;

  console.log(`\nPrice multiplier (start to end): ${priceMultiplier.toFixed(2)}x`);
  console.log(`Average price per token: ${formatEther((targetRaised * parseEther("1")) / saleCap)} ETH`);

  // Show transition details
  const quadCapPercent = Number((quadCap * 100n) / saleCap);
  console.log(`\nCurve transitions from quadratic to linear at ${quadCapPercent}% of supply`);

  // Calculate price at transition point
  const priceAtTransition =
    calculateCost(quadCap + parseEther("1"), quadCap, divisor) - calculateCost(quadCap, quadCap, divisor);
  console.log(`Price at transition: ${formatEther(priceAtTransition)} ETH per token`);
}

// Analyze different scenarios
console.log("=== zCurve Detailed Analysis ===");
console.log("\nCurrent parameters:");
console.log("- Total supply for sale: 800M tokens");
console.log("- Quadratic cap: 200M tokens (25% of supply)");
console.log("- After 25%, curve becomes linear with constant price");

analyzeCurveDetailed("0.01"); // Current
analyzeCurveDetailed("0.1"); // 10x
analyzeCurveDetailed("0.5"); // 50x
analyzeCurveDetailed("1"); // 100x
analyzeCurveDetailed("2"); // 200x
analyzeCurveDetailed("5"); // 500x
analyzeCurveDetailed("8.5"); // Pump.fun equivalent

console.log("\n=== Key Insights ===");
console.log("\n1. The quadratic phase (0-25% of supply) creates the price discovery");
console.log("2. The linear phase (25-100%) maintains a constant marginal price");
console.log("3. Most price appreciation happens in the first 25% of the curve");
console.log("4. Higher targets create steeper curves with more dramatic price action");
console.log("\n5. With 0.01 ETH target:");
console.log("   - Users need to buy 800M tokens to spend 1 ETH");
console.log("   - Price barely moves even after significant purchases");
console.log("\n6. With 1-2 ETH target:");
console.log("   - More reasonable token amounts (400M-800M tokens per ETH)");
console.log("   - Better price discovery in quadratic phase");
console.log("\n7. With 5-8.5 ETH target:");
console.log("   - Similar to successful bonding curves (pump.fun)");
console.log("   - Strong incentive for early buyers");
console.log("   - Meaningful price appreciation potential");
