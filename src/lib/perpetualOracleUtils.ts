/**
 * Utilities for handling perpetual oracle markets (like EthWentUpResolver)
 * These markets have programmatic on-chain descriptions that should be rendered
 * as SVG images rather than fetching from IPFS
 */

/**
 * Extracts the market question from an EthWentUpResolver description
 * Example input: "ETH price went up vs USD? Resolved by Chainlink (eth-usd.data.eth) at unix=1234567890 | YES if price > creation snapshot."
 * Example output: "ETH price went up vs USD?"
 */
export const extractMarketQuestion = (description: string): string => {
  // For EthWentUpResolver, the question is before the "Resolved by" part
  const match = description.match(/^(.+?)\?\s*Resolved by/i);
  if (match) {
    return match[1] + "?";
  }

  // Fallback: take first sentence ending with ?
  const questionMatch = description.match(/^(.+?\?)/);
  if (questionMatch) {
    return questionMatch[1];
  }

  // Last fallback: take first 100 chars
  return description.substring(0, 100);
};

/**
 * Generates an SVG image for a perpetual oracle market
 * Similar to the CreateMarketForm SVG generation but optimized for oracle descriptions
 */
export const generateOracleSvg = (question: string, symbol?: string): string => {
  // Array of bright, high-contrast colors for perpetual oracles (gold/yellow theme)
  const oracleColors = [
    "#FFD700", // Gold
    "#FFA500", // Orange
    "#FF8C00", // Dark Orange
    "#DAA520", // Goldenrod
    "#F4A460", // Sandy Brown
    "#CD853F", // Peru
    "#DEB887", // Burlywood
    "#F0E68C", // Khaki
    "#EEE8AA", // Pale Goldenrod
    "#FFCC00", // Bright Gold
  ];

  // Pick a consistent color based on question hash (for consistent colors per market)
  const colorIndex = question.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % oracleColors.length;
  const bgColor = oracleColors[colorIndex];

  // Split question into lines (max 3 lines, wrap at ~20 chars or natural break)
  const words = question.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= 20) {
      currentLine += (currentLine ? " " : "") + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
      if (lines.length >= 2) break; // Max 3 lines
    }
  }
  if (currentLine) lines.push(currentLine);

  // Add symbol line if provided
  if (symbol) {
    lines.push(`(${symbol})`);
  }

  // Generate SVG with oracle branding
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <rect width="400" height="400" fill="${bgColor}"/>
  <text x="200" y="200" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#000000" text-anchor="middle" dominant-baseline="middle">
${lines
  .map((line, i) => {
    const offset = (i - (lines.length - 1) / 2) * 30;
    return `    <tspan x="200" dy="${i === 0 ? offset : 30}">${line}</tspan>`;
  })
  .join("\n")}
  </text>
  <circle cx="360" cy="40" r="25" fill="rgba(218, 165, 32, 0.3)"/>
  <text x="360" y="45" font-family="Arial, sans-serif" font-size="20" text-anchor="middle" fill="#000000">⚡</text>
</svg>`;

  return svg;
};

/**
 * Converts SVG string to a data URL for use in img src
 */
export const svgToDataUrl = (svg: string): string => {
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `data:image/svg+xml,${encoded}`;
};

/**
 * Extracts resolution time from EthWentUpResolver description
 * Example: "... at unix=1234567890 | ..." → 1234567890
 */
export const extractResolveTime = (description: string): number | null => {
  const match = description.match(/unix=(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
};

/**
 * Extracts the rules/conditions from description
 * Example: "... | YES if price > creation snapshot." → "YES if price > creation snapshot."
 */
export const extractRules = (description: string): string | null => {
  const match = description.match(/\|\s*(.+)$/);
  return match ? match[1].trim() : null;
};

/**
 * Extracts the oracle source from description
 * Example: "Resolved by Chainlink (eth-usd.data.eth)" → "Chainlink"
 */
export const extractOracleSource = (description: string): string | null => {
  const match = description.match(/Resolved by\s+([^(]+)/i);
  return match ? match[1].trim() : null;
};

/**
 * Extracts metadata from a perpetual oracle market description
 * Returns name, description, SVG image URL, and timing info
 */
export const extractOracleMetadata = (onchainDescription: string) => {
  const question = extractMarketQuestion(onchainDescription);
  const svg = generateOracleSvg(question);
  const imageUrl = svgToDataUrl(svg);
  const resolveTime = extractResolveTime(onchainDescription);
  const rules = extractRules(onchainDescription);
  const oracleSource = extractOracleSource(onchainDescription);

  return {
    name: question,
    symbol: "ORACLE",
    description: onchainDescription,
    image: imageUrl,
    resolveTime,
    rules,
    oracleSource,
  };
};
