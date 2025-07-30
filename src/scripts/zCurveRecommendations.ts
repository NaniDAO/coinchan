import { parseEther } from "viem";
import { calculateDivisor } from "../lib/zCurveMath";

console.log("=== zCurve Divisor Recommendations ===\n");

const saleCap = parseEther("800000000"); // 800M
const quadCap = parseEther("200000000"); // 200M

// Define scenarios with analysis
const scenarios = [
  {
    name: "Current Implementation",
    targetETH: "0.01",
    pros: ["Very low barrier to entry", "Extremely cheap tokens"],
    cons: [
      "No meaningful price discovery",
      "Users must buy millions of tokens",
      "Boring/flat curve with no excitement",
      "Price barely moves even with large purchases",
    ],
    verdict: "❌ Too conservative - won't create engagement",
  },
  {
    name: "Conservative Upgrade",
    targetETH: "0.5",
    pros: [
      "10x better price discovery than current",
      "Still accessible to small buyers",
      "More reasonable token quantities",
    ],
    cons: ["Still relatively flat compared to successful bonding curves", "Limited upside potential"],
    verdict: "⚠️ Better but still conservative",
  },
  {
    name: "Balanced Approach",
    targetETH: "1",
    pros: [
      "Good balance of accessibility and price action",
      "Meaningful price discovery in quadratic phase",
      "Users buy reasonable token amounts",
      "100x improvement over current",
    ],
    cons: ["Less aggressive than proven models"],
    verdict: "✅ Good starting point",
  },
  {
    name: "Aggressive Strategy",
    targetETH: "2",
    pros: [
      "Strong price discovery",
      "Creates FOMO dynamics",
      "Rewards early buyers significantly",
      "More exciting curve shape",
    ],
    cons: ["Higher barrier for late buyers", "Requires more capital to move the curve"],
    verdict: "✅ Recommended for excitement",
  },
  {
    name: "Pump.fun Style",
    targetETH: "8.5",
    pros: [
      "Proven model from Solana ecosystem",
      "Maximum price discovery potential",
      "Creates strong incentives for early participation",
      "Most exciting curve dynamics",
    ],
    cons: ["High barrier for late entrants", "May be too aggressive for some communities"],
    verdict: "🚀 Maximum engagement potential",
  },
];

// Calculate and display divisors
console.log("Divisor Values:\n");
scenarios.forEach((scenario) => {
  const target = parseEther(scenario.targetETH);
  const divisor = calculateDivisor(saleCap, quadCap, target);

  console.log(`${scenario.name} (${scenario.targetETH} ETH):`);
  console.log(`  Divisor: ${divisor}`);
  console.log(`  Pros: ${scenario.pros.join(", ")}`);
  console.log(`  Cons: ${scenario.cons.join(", ")}`);
  console.log(`  ${scenario.verdict}\n`);
});

console.log("=== FINAL RECOMMENDATIONS ===\n");

console.log("1. IMMEDIATE ACTION: Update from 0.01 ETH target");
console.log("   The current target is far too low and will create a poor user experience.\n");

console.log("2. SUGGESTED APPROACH:");
console.log("   a) Start with 1-2 ETH target for initial launch");
console.log("   b) This provides 100-200x improvement in price dynamics");
console.log("   c) Monitor user behavior and adjust for future launches\n");

console.log("3. DIVISOR VALUES TO USE:");
console.log("   - For 1 ETH target:  4444444444444441111111111111116666666666666");
console.log("   - For 2 ETH target:  2222222222222220555555555555558333333333333");
console.log("   - For 8.5 ETH target: 522875816993463660130718954249019607843137\n");

console.log("4. KEY CONSIDERATIONS:");
console.log("   - The quadratic phase (0-25%) creates all the price discovery");
console.log("   - After 25%, price becomes linear and stays constant");
console.log("   - Early buyers in quadratic phase get the best prices");
console.log("   - Higher targets create more exciting dynamics\n");

console.log("5. USER EXPERIENCE COMPARISON:");
console.log("   With 0.01 ETH: Users buy 800M tokens for 1 ETH (confusing)");
console.log("   With 1 ETH:    Users buy ~400M tokens for 1 ETH (better)");
console.log("   With 2 ETH:    Users buy ~200M tokens for 1 ETH (good)");
console.log("   With 8.5 ETH:  Users buy ~47M tokens for 1 ETH (clean)\n");

console.log("Remember: The goal is to create an exciting bonding curve that:");
console.log("- Rewards early participants");
console.log("- Creates meaningful price discovery");
console.log("- Generates FOMO and engagement");
console.log("- Provides clear value progression");
