import { parseEther, formatEther } from "viem";
import { calculateDivisor, calculateCost } from "../lib/zCurveMath";
import { UNIT_SCALE } from "../lib/zCurveHelpers";

console.log("=== Comparing Divisor Calculation Formulas ===\n");

const saleCap = parseEther("800000000"); // 800M
const quadCap = parseEther("200000000"); // 200M
const targetRaised = parseEther("2"); // 2 ETH

// Our formula (based on total ETH raised)
const ourDivisor = calculateDivisor(saleCap, quadCap, targetRaised);
console.log("1. Our Formula (Target-Based):");
console.log(`   Divisor: ${ourDivisor}`);

// Calculate what marginal price our divisor produces at quadCap
const K = quadCap / UNIT_SCALE;
const marginalPriceAtQuadCap = (K * K * parseEther("1")) / (6n * ourDivisor);
console.log(`   Marginal Price at QuadCap: ${formatEther(marginalPriceAtQuadCap)} ETH per token`);

// AI Assistant's formula (based on marginal price at quadCap)
// They use: divisor = (quadCap^2 * 1 ETH) / (6 * targetMarginalPrice)
// But they're using quadCap in base units, not ticks!

console.log("\n2. AI Assistant's Formula Issues:");
console.log("   Their formula uses quadCap in base units (18 decimals) directly");
console.log("   But the contract uses ticks (quadCap / UNIT_SCALE)");

// Their formula with base units (WRONG)
const theirWrongDivisor = (quadCap * quadCap * parseEther("1")) / (6n * marginalPriceAtQuadCap);
console.log(`   Their formula (wrong): ${theirWrongDivisor}`);

// Their formula corrected to use ticks (RIGHT)
const theirCorrectDivisor = (K * K * parseEther("1")) / (6n * marginalPriceAtQuadCap);
console.log(`   Their formula (corrected): ${theirCorrectDivisor}`);

// Verify both give same result
console.log(`\n3. Verification:`);
console.log(`   Our divisor: ${ourDivisor}`);
console.log(`   Their corrected divisor: ${theirCorrectDivisor}`);
console.log(`   Match: ${ourDivisor === theirCorrectDivisor}`);

// The real issue: marginal price calculation
console.log("\n4. Understanding Marginal Price:");
console.log("   The marginal price at quadCap is the price per FULL TOKEN (1e18 units)");
console.log("   But the curve works in ticks (1e12 units)");

// Calculate actual marginal price per token at quadCap
const actualMarginalPrice =
  calculateCost(quadCap + parseEther("1"), quadCap, ourDivisor) - calculateCost(quadCap, quadCap, ourDivisor);
console.log(`   Actual marginal price per token: ${formatEther(actualMarginalPrice)} ETH`);

// Show the price per tick vs price per token
const pricePerTick =
  calculateCost(quadCap + UNIT_SCALE, quadCap, ourDivisor) - calculateCost(quadCap, quadCap, ourDivisor);
console.log(`   Price per tick (1e12 units): ${formatEther(pricePerTick)} ETH`);
console.log(`   Price per token (1e18 units): ${formatEther(actualMarginalPrice)} ETH`);
console.log(`   Ratio: ${Number(actualMarginalPrice / pricePerTick)} (should be ~1e6)`);

console.log("\n5. Correct Formula for Target Marginal Price:");
console.log("   If you want a specific marginal price per TOKEN at quadCap:");
console.log("   divisor = (K^2 * 1 ETH) / (6 * marginalPricePerTick)");
console.log("   where K = quadCap / UNIT_SCALE");
console.log("   and marginalPricePerTick = targetPricePerToken / (1e18 / UNIT_SCALE)");

// Example: If we want 0.0025 ETH per token at quadCap
const targetPricePerToken = parseEther("0.0025");
const ticksPerToken = parseEther("1") / UNIT_SCALE; // 1e6 ticks per token
const targetPricePerTick = targetPricePerToken / ticksPerToken;
const divisorForTargetPrice = (K * K * parseEther("1")) / (6n * targetPricePerTick);

console.log(`\n6. Example: Target price of 0.0025 ETH per token at quadCap`);
console.log(`   Ticks per token: ${ticksPerToken}`);
console.log(`   Target price per tick: ${formatEther(targetPricePerTick)} ETH`);
console.log(`   Required divisor: ${divisorForTargetPrice}`);

// Verify this divisor
const totalWithNewDivisor = calculateCost(saleCap, quadCap, divisorForTargetPrice);
console.log(`   Total ETH raised with this divisor: ${formatEther(totalWithNewDivisor)} ETH`);
