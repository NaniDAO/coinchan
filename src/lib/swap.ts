import {
  encodeAbiParameters,
  parseAbiParameters,
  zeroAddress,
  encodeFunctionData,
  Address,
  keccak256,
} from "viem";
import { ZAAMAddress, ZAAMAbi } from "../constants/ZAAM";
import { CoinsAddress } from "../constants/Coins";
import { TokenMeta } from "./coins";

/**
 * Constants for AMM operations
 */
export const SWAP_FEE = 100n; // 1% pool fee
export const DEADLINE_SEC = 20 * 60; // 20 minutes
export const SLIPPAGE_BPS = 200n; // 100 basis points = 2 %
export const SINGLE_ETH_SLIPPAGE_BPS = 500n; // 5% default slippage tolerance for Single-ETH operations

export const SLIPPAGE_OPTIONS = [
  { label: "0.5%", value: 50n },
  { label: "1%", value: 100n },
  { label: "2%", value: 200n },
  { label: "3%", value: 300n },
  { label: "5%", value: 500n },
];

/**
 * Generate a deadline timestamp in seconds
 * @returns BigInt of current time + deadline window
 */
const deadlineTimestamp = () =>
  BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SEC);

type PoolKey = {
  id0: bigint;
  id1: bigint;
  token0: `0x${string}`;
  token1: `0x${string}`;
  swapFee: bigint;
};

/**
 * Compute pool key structure for a coin ID
 * @param coinId The coin ID to trade with ETH
 * @param customFee Optional custom fee to use (default: 1%)
 * @returns PoolKey structure
 */
export const computePoolKey = (
  coinId: bigint,
  customFee: bigint = SWAP_FEE,
): PoolKey => ({
  id0: 0n,
  id1: coinId,
  token0: zeroAddress,
  token1: CoinsAddress,
  swapFee: customFee,
});

/**
 * Compute keccak256 hash of a pool key to get pool ID
 * @param coinId The coin ID
 * @returns Pool ID
 */
export const computePoolId = (coinId: bigint) =>
  BigInt(
    keccak256(
      encodeAbiParameters(
        parseAbiParameters(
          "uint256 id0, uint256 id1, address token0, address token1, uint96 swapFee",
        ),
        [0n, coinId, zeroAddress, CoinsAddress, SWAP_FEE],
      ),
    ),
  );

/**
 * Create a set of encoded function calls for a multicall to swap between coins via ETH
 * This performs:
 * 1. First swapExactIn from sourceCoinId → ETH (uses all source coins)
 * 2. Second swapExactIn from ETH → targetCoinId (uses estimated ETH)
 * 3. Recover any leftover source coins (unlikely since we use full amount)
 * 4. Recover any leftover ETH from the intermediate step
 * 5. Recover any excess target coins if applicable
 *
 * @param sourceCoinId ID of the source coin to swap from
 * @param targetCoinId ID of the target coin to swap to
 * @param amountIn Amount of sourceCoin to swap
 * @param expectedEthOut Expected ETH output from first swap (for second swap input)
 * @param amountOutMinFinal Minimum amount of targetCoin expected (already with slippage)
 * @param receiver Address to receive the swapped coins
 * @returns Array of encoded function calls for multicall
 */
export function createCoinSwapMulticall(
  sourceCoinId: bigint,
  targetCoinId: bigint,
  amountIn: bigint,
  expectedEthOut: bigint,
  amountOutMinFinal: bigint,
  receiver: Address,
  customSourcePoolKey?: any, // Optional custom pool key for USDT
  customTargetPoolKey?: any, // Optional custom pool key for USDT
): `0x${string}`[] {
  // Create pool keys for both swaps
  const sourcePoolKey = customSourcePoolKey || computePoolKey(sourceCoinId);
  const targetPoolKey = customTargetPoolKey || computePoolKey(targetCoinId);

  const deadline = deadlineTimestamp();

  // Check if we're dealing with USDT
  const isSourceUSDT =
    customSourcePoolKey &&
    customSourcePoolKey.token1 === "0xdAC17F958D2ee523a2206206994597C13D831ec7";
  const isTargetUSDT =
    customTargetPoolKey &&
    customTargetPoolKey.token1 === "0xdAC17F958D2ee523a2206206994597C13D831ec7";

  console.log("Creating multihop swap with:", {
    isSourceUSDT,
    isTargetUSDT,
    sourceCoinId: sourceCoinId.toString(),
    targetCoinId: targetCoinId.toString(),
    amountIn: amountIn.toString(),
    expectedEthOut: expectedEthOut.toString(),
  });

  // Create the multicall array with functions to call
  const multicallData: `0x${string}`[] = [
    // 1. First swap: sourceCoin → ETH (use ZAAM as the receiver to keep ETH for next swap)
    // This will consume the entire input amount of source coin
    encodeFunctionData({
      abi: ZAAMAbi,
      functionName: "swapExactIn",
      args: [
        sourcePoolKey,
        amountIn,
        0n, // No minimum for intermediate ETH output since we're controlling the flow
        false, // false means we're swapping from token1 (Coin) to token0 (ETH)
        ZAAMAddress, // Important: Send to the contract itself for second swap
        deadline,
      ],
    }) as `0x${string}`,

    // 2. Second swap: ETH → targetCoin
    // Use the expected ETH output from first swap (with safety margin)
    encodeFunctionData({
      abi: ZAAMAbi,
      functionName: "swapExactIn",
      args: [
        targetPoolKey,
        expectedEthOut, // Use expected ETH output as input for second swap
        amountOutMinFinal, // Apply minimum output with slippage
        true, // true means we're swapping from token0 (ETH) to token1 (Coin)
        receiver, // Send to the user
        deadline,
      ],
    }) as `0x${string}`,

    // 3. Recover any leftover source coins - likely none since we use full amount
    // For USDT, recover from USDT address; for regular coins, from CoinsAddress
    encodeFunctionData({
      abi: ZAAMAbi,
      functionName: "recoverTransientBalance",
      args: [
        isSourceUSDT ? customSourcePoolKey.token1 : CoinsAddress, // Token address
        sourceCoinId, // Source coin ID
        receiver, // Return any leftovers to the receiver
      ],
    }) as `0x${string}`,

    // 4. Recover any leftover ETH from the intermediate step
    // This is expected to happen if our ETH estimate isn't exact
    encodeFunctionData({
      abi: ZAAMAbi,
      functionName: "recoverTransientBalance",
      args: [
        zeroAddress, // ETH is represented by zero address
        0n, // ETH ID is always 0
        receiver, // Return any leftovers to the receiver
      ],
    }) as `0x${string}`,

    // 5. Recover any excess target coins (unlikely but possible)
    // For USDT, recover from USDT address; for regular coins, from CoinsAddress
    encodeFunctionData({
      abi: ZAAMAbi,
      functionName: "recoverTransientBalance",
      args: [
        isTargetUSDT ? customTargetPoolKey.token1 : CoinsAddress, // Token address
        targetCoinId, // Target coin ID
        receiver, // Return any leftovers to the receiver
      ],
    }) as `0x${string}`,
  ];

  return multicallData;
}

/**
 * Calculate the estimated output amount when doing coin-to-coin swaps via ETH
 * @param sourceCoinId ID of source coin
 * @param targetCoinId ID of target coin
 * @param amountIn Amount of source coin
 * @param sourceReserves Reserves of source coin pool {reserve0: ETH, reserve1: sourceCoin}
 * @param targetReserves Reserves of target coin pool {reserve0: ETH, reserve1: targetCoin}
 * @param slippageBps Slippage tolerance in basis points (optional, defaults to 200 for 2%)
 * @returns Estimated output amount of target coin and the intermediate ETH amount
 */
export function estimateCoinToCoinOutput(
  _sourceCoinId: bigint, // Prefixed with underscore to indicate it's unused
  _targetCoinId: bigint, // Prefixed with underscore to indicate it's unused
  amountIn: bigint,
  sourceReserves: { reserve0: bigint; reserve1: bigint },
  targetReserves: { reserve0: bigint; reserve1: bigint },
  slippageBps: bigint = 200n,
  sourceSwapFee: bigint = SWAP_FEE, // Custom fee for source pool (USDT: 30n)
  targetSwapFee: bigint = SWAP_FEE, // Custom fee for target pool (USDT: 30n)
): { amountOut: bigint; withSlippage: bigint; ethAmountOut: bigint } {
  // First swap: sourceCoin → ETH
  const ethAmountOut = getAmountOut(
    amountIn,
    sourceReserves.reserve1, // Source coin reserve
    sourceReserves.reserve0, // ETH reserve
    sourceSwapFee, // Use custom fee for source pool
  );

  if (ethAmountOut === 0n)
    return {
      amountOut: 0n,
      withSlippage: 0n,
      ethAmountOut: 0n,
    };

  // Apply a small safety margin to ethAmountOut to account for potential slippage
  // during the first swap or any execution differences
  const safeEthAmountOut = withSlippage(ethAmountOut, slippageBps);

  // Second swap: ETH → targetCoin
  const targetAmountOut = getAmountOut(
    safeEthAmountOut, // Use the safe ETH amount for estimation
    targetReserves.reserve0, // ETH reserve
    targetReserves.reserve1, // Target coin reserve
    targetSwapFee, // Use custom fee for target pool
  );

  return {
    amountOut: targetAmountOut,
    withSlippage: withSlippage(targetAmountOut, slippageBps),
    ethAmountOut: safeEthAmountOut, // Return the safe ETH amount for the second swap
  };
}

const PRICE_CACHE_SIZE = 50; // Smaller cache for price calculations
const PRICE_CACHE_TTL = 2000; // 2 seconds TTL for price calculations

const amountOutCache = new Map<string, { value: bigint; timestamp: number }>();

// x*y=k AMM with fee — forward (amountIn → amountOut)
export const getAmountOut = (
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  swapFee: bigint,
) => {
  // Fast path for zero values
  if (amountIn === 0n || reserveIn === 0n || reserveOut === 0n) return 0n;

  // Create cache key from all inputs
  const cacheKey = `${amountIn.toString()}-${reserveIn.toString()}-${reserveOut.toString()}-${swapFee.toString()}`;
  const now = Date.now();

  // Check cache first
  const cached = amountOutCache.get(cacheKey);
  if (cached && now - cached.timestamp < PRICE_CACHE_TTL) {
    return cached.value;
  }

  // Calculate result if not cached or expired
  const amountInWithFee = amountIn * (10000n - swapFee);
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 10000n + amountInWithFee;
  const result = numerator / denominator;

  // Manage cache size
  if (amountOutCache.size >= PRICE_CACHE_SIZE) {
    // Find oldest entry
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, entry] of amountOutCache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    // Remove oldest entry
    if (oldestKey) {
      amountOutCache.delete(oldestKey);
    }
  }

  // Cache the result
  amountOutCache.set(cacheKey, { value: result, timestamp: now });

  return result;
};

const amountInCache = new Map<string, { value: bigint; timestamp: number }>();

// inverse — desired amountOut → required amountIn
export const getAmountIn = (
  amountOut: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  swapFee: bigint,
) => {
  // Fast path for impossible scenarios
  if (
    amountOut === 0n ||
    reserveIn === 0n ||
    reserveOut === 0n ||
    amountOut >= reserveOut
  )
    return 0n;

  // Create cache key from all inputs
  const cacheKey = `${amountOut.toString()}-${reserveIn.toString()}-${reserveOut.toString()}-${swapFee.toString()}`;
  const now = Date.now();

  // Check cache first
  const cached = amountInCache.get(cacheKey);
  if (cached && now - cached.timestamp < PRICE_CACHE_TTL) {
    return cached.value;
  }

  // Calculate result if not cached or expired
  const numerator = reserveIn * amountOut * 10000n;
  const denominator = (reserveOut - amountOut) * (10000n - swapFee);
  const result = numerator / denominator + 1n; // +1 for ceiling rounding

  // Manage cache size
  if (amountInCache.size >= PRICE_CACHE_SIZE) {
    // Find oldest entry
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, entry] of amountInCache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    // Remove oldest entry
    if (oldestKey) {
      amountInCache.delete(oldestKey);
    }
  }

  // Cache the result
  amountInCache.set(cacheKey, { value: result, timestamp: now });

  return result;
};

/**
 * Apply slippage tolerance to amount
 * @param amount Raw amount
 * @returns Amount with slippage applied
 */
export const withSlippage = (
  amount: bigint,
  slippageBps: bigint = SLIPPAGE_BPS,
) => (amount * (10000n - slippageBps)) / 10000n;

export function analyzeTokens(
  sell: TokenMeta,
  buy: TokenMeta | null,
): {
  isSellETH: boolean;
  isBuyETH: boolean;
  isSellUSDT: boolean;
  isBuyUSDT: boolean;
  isDirectUsdtEth: boolean;
  isCustom: boolean;
  isCoinToCoin: boolean;
  coinId: bigint;
  canSwap: boolean;
} {
  const isSellETH = sell.id === null;
  const isBuyETH = buy?.id === null;

  const isSellUSDT = sell.symbol === "USDT";
  const isBuyUSDT = buy?.symbol === "USDT";

  const isDirectUsdtEth = (isSellETH && isBuyUSDT) || (isBuyETH && isSellUSDT);

  const isCustom = sell.isCustomPool || Boolean(buy?.isCustomPool);

  const isCoinToCoin =
    !isDirectUsdtEth &&
    sell.id !== null &&
    buy?.id !== null &&
    sell.id !== buy?.id;

  // coinId logic as before…
  let coinId: bigint;
  if (isCustom) {
    coinId = sell.isCustomPool ? (sell.id ?? 0n) : (buy?.id ?? 0n);
  } else {
    coinId = isSellETH ? (buy?.id ?? 0n) : (sell.id ?? 0n);
  }

  // canSwap covers all the cases where we actually want the “Go” button enabled:
  const canSwap =
    Boolean(buy) && (isCustom || isSellETH || isBuyETH || isCoinToCoin);

  return {
    isSellETH,
    isBuyETH,
    isSellUSDT,
    isBuyUSDT,
    isDirectUsdtEth,
    isCustom,
    isCoinToCoin,
    coinId,
    canSwap,
  };
}

/**
 * Returns mainPoolId once you have enough info:
 *  • ETH→Token: sell.id===null but buy.id!=null
 *  • Token→ETH: sell.id!=null
 *  • Custom pools: whichever token is custom
 *
 * And targetPoolId only for coin-to-coin swaps.
 */
export function getPoolIds(
  sell: TokenMeta,
  buy: TokenMeta | null,
  flags: { isCustomPool: boolean; isCoinToCoin: boolean },
): { mainPoolId?: bigint; targetPoolId?: bigint } {
  let mainPoolId: bigint | undefined;

  if (flags.isCustomPool) {
    // custom-pool: pick whichever token is custom
    const custom = sell.isCustomPool ? sell : buy;
    if (custom?.poolId != null) mainPoolId = custom.poolId;
  } else {
    // non-custom: if sell is a token (not ETH), use sell.id
    if (sell.id != null) {
      mainPoolId = computePoolId(sell.id);
    }
    // otherwise (sell is ETH), wait until buy!=null and has an id
    else if (buy?.id != null) {
      mainPoolId = computePoolId(buy.id);
    }
  }

  let targetPoolId: bigint | undefined;
  if (flags.isCoinToCoin && buy) {
    // for coin-to-coin, buy must be non-null
    if (buy.isCustomPool && buy.poolId != null) {
      targetPoolId = buy.poolId;
    } else if (buy.id != null) {
      targetPoolId = computePoolId(buy.id);
    }
  }

  return { mainPoolId, targetPoolId };
}
