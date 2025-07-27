import { parseEther, formatEther } from "viem";
import { calculateCost, calculateOneshotDivisor } from "../lib/zCurveMath";
import { UNIT_SCALE } from "../lib/zCurveHelpers";

console.log("=== Verify ZCurve Bonding Chart Calculations ===\n");

const saleCap = parseEther("800000000"); // 800M
const quadCap = parseEther("200000000"); // 200M
const divisor = calculateOneshotDivisor();
const ethTarget = parseEther("0.01"); // Current test target

console.log("Parameters:");
console.log(`  Sale Cap: ${formatEther(saleCap)} tokens`);
console.log(`  Quad Cap: ${formatEther(quadCap)} tokens`);
console.log(`  ETH Target: ${formatEther(ethTarget)} ETH`);
console.log(`  Divisor: ${divisor}\n`);

// Calculate first token price (after 2 free ticks)
const firstTokenPrice =
  calculateCost(2n * UNIT_SCALE + parseEther("1"), quadCap, divisor) - calculateCost(2n * UNIT_SCALE, quadCap, divisor);
console.log(`First token price: ${formatEther(firstTokenPrice)} ETH`);
console.log(`  In scientific: ${Number(formatEther(firstTokenPrice)).toExponential(2)}`);

// Calculate transition price
const transitionPrice =
  calculateCost(quadCap + parseEther("1"), quadCap, divisor) - calculateCost(quadCap, quadCap, divisor);
console.log(`\nTransition price (at quadCap): ${formatEther(transitionPrice)} ETH`);
console.log(`  In scientific: ${Number(formatEther(transitionPrice)).toExponential(2)}`);

// Calculate total raise
const totalRaise = calculateCost(saleCap, quadCap, divisor);
console.log(`\nTotal raise: ${formatEther(totalRaise)} ETH`);

// Find how many tokens to reach target
let low = 0n;
let high = saleCap;
while (low < high) {
  const mid = (low + high) / 2n;
  const cost = calculateCost(mid, quadCap, divisor);
  if (cost < ethTarget) {
    low = mid + 1n;
  } else {
    high = mid;
  }
}
const targetTokens = low;
const avgPrice = targetTokens > 0n ? ethTarget / targetTokens : 0n;

console.log(`\nTokens needed to reach target: ${formatEther(targetTokens)}`);
console.log(`Average price at target: ${formatEther(avgPrice)} ETH`);
console.log(`  In scientific: ${Number(formatEther(avgPrice)).toExponential(2)}`);

// Test some hover values
console.log("\n=== Sample Hover Values ===");
const testAmounts = [
  parseEther("1000000"), // 1M tokens
  parseEther("10000000"), // 10M tokens
  parseEther("100000000"), // 100M tokens
  parseEther("200000000"), // 200M tokens (quadCap)
];

for (const amount of testAmounts) {
  const cost = calculateCost(amount, quadCap, divisor);
  console.log(`\n${formatEther(amount)} tokens = ${formatEther(cost)} ETH`);
}
