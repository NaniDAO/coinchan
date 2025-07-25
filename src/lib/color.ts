import { keccak256, toHex } from "viem";

export const getRandomDiamondColor = (salt: string): string => {
  // Array of diamond color CSS variables
  const diamondColors = [
    "var(--diamond-pink)",
    "var(--diamond-blue)",
    "var(--diamond-yellow)",
    "var(--diamond-green)",
    "var(--diamond-orange)",
    "var(--diamond-purple)",
  ];

  // Simple hash function to convert string to number
  let hash = Number(keccak256(toHex(salt)));

  // Use absolute value and modulo to get consistent index
  const index = Math.abs(hash) % diamondColors.length;

  return diamondColors[index];
};
