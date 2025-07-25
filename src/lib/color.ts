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
  let hash = 0;
  for (let i = 0; i < salt.length; i++) {
    const char = salt.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Use absolute value and modulo to get consistent index
  const index = Math.abs(hash) % diamondColors.length;

  return diamondColors[index];
};
