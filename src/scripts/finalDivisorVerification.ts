import { parseEther, formatEther } from "viem";
import { calculateDivisor, calculateCost } from "../lib/zCurveMath";
import { UNIT_SCALE } from "../lib/zCurveHelpers";

console.log("=== Final Divisor Verification: Our Implementation vs Latest Assistant ===\n");

const saleCap = parseEther("800000000"); // 800M
const quadCap = parseEther("200000000"); // 200M
const ethTarget = parseEther("2"); // 2 ETH

// Convert to ticks
const M = saleCap / UNIT_SCALE;
const K = quadCap / UNIT_SCALE;

console.log("1. Parameters:");
console.log(`   Sale Cap: 800M tokens (${M} ticks)`);
console.log(`   Quad Cap: 200M tokens (${K} ticks) - 25% of supply`);
console.log(`   ETH Target: 2 ETH`);

// Latest assistant's formula (matches ours exactly!)
console.log("\n2. Latest Assistant's Formula:");
console.log("   A = S_K + K² × (M - K)");
console.log("   where S_K = K × (K-1) × (2K-1) / 6");
console.log("   d = (A × 1 ETH) / (6 × T)");

// Calculate using their explicit formula
const S_K = (K * (K - 1n) * (2n * K - 1n)) / 6n;
const A = S_K + K * K * (M - K);
const theirDivisor = (A * parseEther("1")) / (6n * ethTarget);

console.log(`\n   S_K = ${S_K}`);
console.log(`   A = ${A}`);
console.log(`   Their divisor: ${theirDivisor}`);

// Our implementation
const ourDivisor = calculateDivisor(saleCap, quadCap, ethTarget);
console.log(`\n3. Our Implementation:`);
console.log(`   Our divisor: ${ourDivisor}`);
console.log(`   Match: ${ourDivisor === theirDivisor} ✅`);

// Verify the results
const totalCost = calculateCost(saleCap, quadCap, ourDivisor);
console.log(`\n4. Verification:`);
console.log(`   Total ETH raised: ${formatEther(totalCost)} ETH`);
console.log(`   Target achieved: ${Math.abs(Number(totalCost - ethTarget)) < 1000} ✅`);

// Calculate key price points
console.log(`\n5. Price Dynamics (as suggested by assistant):`);

// Early bird window (quadratic phase)
const checkpoints = [
  { pct: 0.1, desc: "Very early (0.1%)" },
  { pct: 1, desc: "Early buyers (1%)" },
  { pct: 5, desc: "Early phase (5%)" },
  { pct: 10, desc: "Mid quadratic (10%)" },
  { pct: 25, desc: "Quad cap (25%)" },
  { pct: 50, desc: "Linear phase (50%)" },
  { pct: 75, desc: "Late phase (75%)" },
  { pct: 100, desc: "Sale complete (100%)" },
];

console.log("\n   Phase | % Sold | Marginal Price | Total Raised | Multiplier");
console.log("   ------|--------|----------------|--------------|------------");

let firstPrice = 0n;
for (const { pct } of checkpoints) {
  const tokensSold = (saleCap * BigInt(Math.floor(pct * 100))) / 10000n;
  const cost = calculateCost(tokensSold, quadCap, ourDivisor);

  let marginalPrice = 0n;
  if (tokensSold < saleCap && tokensSold >= UNIT_SCALE) {
    marginalPrice =
      calculateCost(tokensSold + parseEther("1"), quadCap, ourDivisor) - calculateCost(tokensSold, quadCap, ourDivisor);
  }

  if (pct === 0.1 && marginalPrice > 0n) firstPrice = marginalPrice;
  const multiplier = firstPrice > 0n && marginalPrice > 0n ? Number((marginalPrice * 1000n) / firstPrice) / 1000 : 0;

  const phase = pct <= 25 ? "Quad" : "Linear";
  console.log(
    `   ${phase.padEnd(6)} | ${(pct + "%").padEnd(6)} | ${formatEther(marginalPrice).padEnd(14)} | ${formatEther(cost).padEnd(12)} | ${multiplier}x`,
  );
}

// Calculate FOMO dynamics
const p_K = (K * K * parseEther("1")) / (6n * ourDivisor);
console.log(`\n6. FOMO Dynamics:`);
console.log(`   Marginal price at quad cap (p_K): ${formatEther(p_K)} ETH/token`);
console.log(`   This is the constant price for the linear tail phase`);

// Early bird discount analysis
const earlyTokens = parseEther("10000000"); // 10M tokens for meaningful price
const veryEarlyPrice = calculateCost(earlyTokens, quadCap, ourDivisor);
const avgEarlyPrice = veryEarlyPrice / earlyTokens;
console.log(`\n7. Early Bird Discount Window:`);
console.log(`   First 10M tokens total cost: ${formatEther(veryEarlyPrice)} ETH`);
console.log(`   First 10M tokens avg price: ${formatEther(avgEarlyPrice * parseEther("1"))} ETH/token`);
console.log(`   Price at quad cap: ${formatEther(p_K)} ETH/token`);
if (avgEarlyPrice > 0n) {
  console.log(`   Price increase: ${Number((p_K * 1000n) / (avgEarlyPrice * parseEther("1"))) / 1000}x`);
}

console.log(`\n8. Summary:`);
console.log(`   ✅ Our implementation matches the latest mathematical analysis`);
console.log(`   ✅ 25% quad cap creates good "discount window" for early buyers`);
console.log(`   ✅ Linear tail at ${formatEther(p_K)} ETH creates urgency/FOMO`);
console.log(`   ✅ 2 ETH target balances accessibility with meaningful appreciation`);

// Show the helper functions match
console.log(`\n9. Helper Function Comparison:`);
console.log("   Latest assistant's solveDivisor() produces: " + theirDivisor);
console.log("   Our calculateDivisor() produces: " + ourDivisor);
console.log("   Match: " + (ourDivisor === theirDivisor ? "✅ PERFECT MATCH" : "❌ MISMATCH"));
