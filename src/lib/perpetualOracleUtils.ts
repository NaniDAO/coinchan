/**
 * Utilities for handling perpetual oracle markets (like EthWentUpResolver and CoinflipResolver)
 * These markets have programmatic on-chain descriptions that should be rendered
 * as SVG images rather than fetching from IPFS
 */

/**
 * Extracts the market question from a perpetual oracle description
 *
 * For EthWentUpResolver:
 * Example input: "ETH price went up vs USD? Resolved by Chainlink (eth-usd.data.eth) at unix=1234567890 | YES if price > creation snapshot."
 * Example output: "ETH price went up vs USD?"
 *
 * For CoinflipResolver:
 * Example input: "Coinflip: YES if parity(keccak(blockhash(123), blockhash(124), marketId)) == 1. Trading closes at unix=1234567890."
 * Example output: "Coinflip"
 */
export const extractMarketQuestion = (description: string): string => {
  // For CoinflipResolver, extract just "Coinflip"
  if (description.startsWith("Coinflip:")) {
    return "Coinflip";
  }

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
 * Uses different color themes based on the oracle type
 */
export const generateOracleSvg = (question: string, symbol?: string): string => {
  // Determine color theme based on oracle type
  const isCoinflip = question === "Coinflip";

  // For Coinflip: blue/purple/blockchain theme
  const coinflipColors = [
    "#4169E1", // Royal Blue
    "#6495ED", // Cornflower Blue
    "#1E90FF", // Dodger Blue
    "#4682B4", // Steel Blue
    "#5F9EA0", // Cadet Blue
    "#7B68EE", // Medium Slate Blue
    "#6A5ACD", // Slate Blue
    "#483D8B", // Dark Slate Blue
    "#9370DB", // Medium Purple
    "#8A2BE2", // Blue Violet
  ];

  // For EthWentUp and others: gold/yellow theme
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

  const colors = isCoinflip ? coinflipColors : oracleColors;

  // Pick a consistent color based on question hash (for consistent colors per market)
  const colorIndex = question.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  const bgColor = colors[colorIndex];

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

  // Choose icon and badge color based on oracle type
  const icon = isCoinflip ? "🎲" : "⚡";
  const badgeColor = isCoinflip ? "rgba(65, 105, 225, 0.3)" : "rgba(218, 165, 32, 0.3)";

  // Generate SVG with oracle branding
  // For Coinflip, add animated 8-bit style coin
  const coinGradientDefs = isCoinflip ? `
    <radialGradient id="coinGradient" cx="40%" cy="40%">
      <stop offset="0%" style="stop-color:#FFED4E;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#FFD700;stop-opacity:0" />
    </radialGradient>` : '';

  const animatedCoinSvg = isCoinflip ? `
  <g id="coin">
    <animateTransform
      attributeName="transform"
      attributeType="XML"
      type="rotate"
      from="0 360 40"
      to="360 360 40"
      dur="3s"
      repeatCount="indefinite"/>
    <ellipse cx="360" cy="40" rx="24" ry="24" fill="#FFD700" stroke="#DAA520" stroke-width="2">
      <animate attributeName="rx" values="24;6;24" dur="3s" repeatCount="indefinite"/>
    </ellipse>
    <ellipse cx="360" cy="40" rx="20" ry="20" fill="url(#coinGradient)" opacity="0.6">
      <animate attributeName="rx" values="20;4;20" dur="3s" repeatCount="indefinite"/>
    </ellipse>
    <text x="360" y="45" font-family="monospace" font-size="16" font-weight="bold" fill="#8B6914" text-anchor="middle">
      <tspan>$</tspan>
      <animate attributeName="opacity" values="1;0;1" dur="3s" repeatCount="indefinite"/>
    </text>
    <circle cx="350" cy="30" r="2" fill="#FFF">
      <animate attributeName="opacity" values="0;1;0" dur="1.5s" repeatCount="indefinite"/>
    </circle>
    <circle cx="370" cy="35" r="2" fill="#FFF">
      <animate attributeName="opacity" values="0;1;0" dur="1.5s" begin="0.5s" repeatCount="indefinite"/>
    </circle>
  </g>` : `<circle cx="360" cy="40" r="25" fill="${badgeColor}"/>
  <text x="360" y="45" font-family="Arial, sans-serif" font-size="20" text-anchor="middle" fill="#000000">${icon}</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <defs>
    ${coinGradientDefs}
  </defs>
  <rect width="400" height="400" fill="${bgColor}"/>
  <text x="200" y="200" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#000000" text-anchor="middle" dominant-baseline="middle">
${lines
  .map((line, i) => {
    const offset = (i - (lines.length - 1) / 2) * 30;
    return `    <tspan x="200" dy="${i === 0 ? offset : 30}">${line}</tspan>`;
  })
  .join("\n")}
  </text>
  ${animatedCoinSvg}
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
 * Extracts resolution time from perpetual oracle description
 * For EthWentUpResolver: "... at unix=1234567890 | ..." → 1234567890
 * For CoinflipResolver: "... Trading closes at unix=1234567890." → 1234567890
 */
export const extractResolveTime = (description: string): number | null => {
  const match = description.match(/unix=(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
};

/**
 * Extracts target block numbers from CoinflipResolver description
 * Example: "... blockhash(12345), blockhash(12346) ..." → [12345, 12346]
 */
export const extractTargetBlocks = (description: string): number[] | null => {
  const matches = description.matchAll(/blockhash\((\d+)\)/gi);
  const blocks: number[] = [];
  for (const match of matches) {
    blocks.push(parseInt(match[1], 10));
  }
  return blocks.length > 0 ? blocks : null;
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
  const targetBlocks = extractTargetBlocks(onchainDescription);

  return {
    name: question,
    symbol: "ORACLE",
    description: onchainDescription,
    image: imageUrl,
    resolveTime,
    rules,
    oracleSource,
    targetBlocks,
  };
};
