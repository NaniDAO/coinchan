import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  zeroAddress,
} from "viem";

export interface TokenMeta {
  id: bigint | null; // null = ETH pseudo-token
  name: string;
  symbol: string;
  tokenUri?: string; // Added tokenUri field to display thumbnails
  reserve0?: bigint; // ETH reserves in the pool
  reserve1?: bigint; // Token reserves in the pool
  liquidity?: bigint; // Total liquidity in the pool
  swapFee?: bigint; // Custom swap fee for the pool (default is 100n - 1%)
  balance?: bigint; // User's balance of this token
  isFetching?: boolean; // Whether the balance is currently being fetched
  lastUpdated?: number; // Timestamp when balance was last updated
  // Below fields are for custom pools (like USDT-ETH)
  isCustomPool?: boolean; // Flag to identify custom pools
  poolId?: bigint; // Computed pool ID
  poolKey?: {
    id0: bigint;
    id1: bigint;
    token0: `0x${string}`;
    token1: `0x${string}`;
    swapFee: bigint;
  }; // Pool key object with typed properties
  token0?: `0x${string}`; // Address of token0 (ETH = address(0))
  token1?: `0x${string}`; // Address of token1 (e.g., USDT address)
  decimals?: number; // Number of decimals for the token
}

const ETH_SVG = `<svg fill="#000000" width="800px" height="800px" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
<g fill-rule="evenodd">
<path d="M16 32C7.163 32 0 24.837 0 16S7.163 0 16 0s16 7.163 16 16-7.163 16-16 16zm7.994-15.781L16.498 4 9 16.22l7.498 4.353 7.496-4.354zM24 17.616l-7.502 4.351L9 17.617l7.498 10.378L24 17.616z"/>
<g fill-rule="nonzero">
<path fill-opacity=".298" d="M16.498 4v8.87l7.497 3.35zm0 17.968v6.027L24 17.616z"/>
<path fill-opacity=".801" d="M16.498 20.573l7.497-4.353-7.497-3.348z"/>
<path fill-opacity=".298" d="M9 16.22l7.498 4.353v-7.701z"/>
</g>
</g>
</svg>`;

export const ETH_TOKEN: TokenMeta = {
  id: null,
  name: "Ether",
  symbol: "ETH",
  tokenUri: `data:image/svg+xml;base64,${btoa(ETH_SVG)}`, // Embed ETH SVG as data URI
  reserve0: BigInt(Number.MAX_SAFE_INTEGER), // Ensure ETH is always at the top (special case)
  balance: 0n, // Will be updated with actual balance in useAllTokens hook
};

// USDT Tether logo SVG
const USDT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 2000" width="2000" height="2000">
<path d="M1000,0c552.26,0,1000,447.74,1000,1000S1552.24,2000,1000,2000,0,1552.38,0,1000,447.68,0,1000,0" fill="#53ae94"/>
<path d="M1123.42,866.76V718H1463.6V491.34H537.28V718H877.5V866.64C601,879.34,393.1,934.1,393.1,999.7s208,120.36,484.4,133.14v476.5h246V1132.8c276-12.74,483.48-67.46,483.48-133s-207.48-120.26-483.48-133m0,225.64v-0.12c-8.54.44-65.84,3.22-123.68,3.22-59.52,0-115.78-2.78-123.68-3.22V999.7c8.12-.44,67.58-5.18,123.68-5.18,58.08,0,115.75,4.74,123.68,5.18v92.7Z" fill="#fff"/>
</svg>`;

// USDT address on mainnet (official Tether USD address)
export const USDT_ADDRESS =
  "0xdAC17F958D2ee523a2206206994597C13D831ec7" as `0x${string}`;

// Create USDT-ETH pool with 30 bps fee
export const USDT_POOL_KEY: {
  id0: bigint;
  id1: bigint;
  token0: `0x${string}`;
  token1: `0x${string}`;
  swapFee: bigint;
} = {
  id0: 0n, // ETH token ID
  id1: 0n, // USDT token ID
  token0: zeroAddress, // ETH address (0x0)
  token1: USDT_ADDRESS, // USDT address
  swapFee: 30n, // 0.3% fee (30 bps) - Standard Uniswap V2 fee tier
};

// Function to compute a custom pool ID with specific tokens and fee
const computeCustomPoolId = (
  id0: bigint,
  id1: bigint,
  token0: `0x${string}`,
  token1: `0x${string}`,
  swapFee: bigint,
) =>
  BigInt(
    keccak256(
      encodeAbiParameters(
        parseAbiParameters(
          "uint256 id0, uint256 id1, address token0, address token1, uint96 swapFee",
        ),
        [id0, id1, token0, token1, swapFee],
      ),
    ),
  );

// Compute the pool ID for USDT-ETH
export const USDT_POOL_ID = computeCustomPoolId(
  USDT_POOL_KEY.id0,
  USDT_POOL_KEY.id1,
  USDT_POOL_KEY.token0,
  USDT_POOL_KEY.token1,
  USDT_POOL_KEY.swapFee,
);

// Define USDT token
export const USDT_TOKEN: TokenMeta = {
  id: 0n, // Special USDT token with ID 0
  name: "Tether USD",
  symbol: "USDT",
  tokenUri: `data:image/svg+xml;base64,${btoa(USDT_SVG)}`,
  reserve0: 1000000000000000000000n, // 1000 ETH (placeholder - will be updated by hook)
  reserve1: 2000000000000n, // 2M USDT (6 decimals, placeholder)
  swapFee: 30n, // 0.3% fee tier (30 bps)
  balance: 0n, // User balance
  // Custom properties for the special ETH-USDT pool
  isCustomPool: true,
  poolId: USDT_POOL_ID,
  poolKey: USDT_POOL_KEY as any, // Cast to any to avoid type errors
  decimals: 6, // USDT has 6 decimals
};

export const computeCoinId = (name: string, symbol: string): bigint =>
  BigInt(
    BigInt(
      keccak256(
        encodeAbiParameters(parseAbiParameters("string name, string symbol"), [
          name,
          symbol,
        ]),
      ),
    ) & 0xffffffffffffffffffffffffffffffffffffffffn,
  );
