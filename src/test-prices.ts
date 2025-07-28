import { parseEther, formatEther } from "viem";

const UNIT_SCALE = BigInt("1000000000000"); // 1e12

const calculateCost = (n: bigint, quadCap: bigint, divisor: bigint): bigint => {
  const m = n / UNIT_SCALE;
  if (m < 2n) return 0n;
  
  const K = quadCap / UNIT_SCALE;
  const denom = 6n * divisor;
  const oneETH = parseEther("1");
  
  if (m <= K) {
    const sumSq = (m * (m - 1n) * (2n * m - 1n)) / 6n;
    return (sumSq * oneETH) / denom;
  } else {
    const sumK = (K * (K - 1n) * (2n * K - 1n)) / 6n;
    const quadCost = (sumK * oneETH) / denom;
    const pK = (K * K * oneETH) / denom;
    const tailTicks = m - K;
    const tailCost = pK * tailTicks;
    return quadCost + tailCost;
  }
};

// Test parameters
const saleCap = parseEther("800000000"); // 800M
const quadCap = parseEther("552000000"); // 552M
const divisor = 2193868799999997460800000000001533333333333334n;
const ethTarget = parseEther("0.01");

// Calculate first token price
const firstTokenPrice = 
  calculateCost(2n * UNIT_SCALE + parseEther("1"), quadCap, divisor) -
  calculateCost(2n * UNIT_SCALE, quadCap, divisor);

console.log("First token price:", formatEther(firstTokenPrice), "ETH");
console.log("First token price (scientific):", Number(formatEther(firstTokenPrice)).toExponential(6));

// Calculate average price at target
const avgPrice = ethTarget / saleCap;

console.log("\nAverage price at target:", formatEther(avgPrice), "ETH/token");
console.log("Average price (scientific):", Number(formatEther(avgPrice)).toExponential(6));

// Calculate total cost at full sale
const totalCost = calculateCost(saleCap, quadCap, divisor);
console.log("\nTotal ETH raised at full sale:", formatEther(totalCost), "ETH");

// Calculate marginal price at quadCap
const K = quadCap / UNIT_SCALE;
const marginalAtQuad = (K * K * parseEther("1")) / (6n * divisor);
console.log("\nMarginal price at quadCap:", formatEther(marginalAtQuad), "ETH/token");
console.log("Marginal price (scientific):", Number(formatEther(marginalAtQuad)).toExponential(6));
