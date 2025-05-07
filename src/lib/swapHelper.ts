import { 
  encodeAbiParameters, 
  parseAbiParameters,
  zeroAddress,
  encodeFunctionData,
  Address
} from "viem";
import { ZAAMAddress, ZAAMAbi } from "../constants/ZAAM";
import { CoinsAddress } from "../constants/Coins";

/**
 * Constants for AMM operations
 */
const SWAP_FEE = 100n; // 1% pool fee
const DEADLINE_SEC = 20 * 60; // 20 minutes

/**
 * Apply slippage tolerance to amount
 * @param amount Raw amount
 * @param slippageBps Slippage tolerance in basis points (e.g., 200 = 2%)
 * @returns Amount with slippage applied
 */
export const getAmountWithSlippage = (amount: bigint, slippageBps: bigint) =>
  (amount * (10000n - slippageBps)) / 10000n;

/**
 * Generate a deadline timestamp in seconds
 * @returns BigInt of current time + deadline window
 */
const deadlineTimestamp = () => BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SEC);

/**
 * Compute pool key structure for a coin ID
 * @param coinId The coin ID to trade with ETH
 * @returns PoolKey structure
 */
export const computePoolKey = (coinId: bigint) => ({
  id0: 0n,
  id1: coinId,
  token0: zeroAddress,
  token1: CoinsAddress,
  swapFee: SWAP_FEE,
});

/**
 * Compute keccak256 hash of a pool key to get pool ID
 * @param coinId The coin ID
 * @returns Pool ID
 */
export const computePoolId = (coinId: bigint) =>
  BigInt(encodeAbiParameters(
    parseAbiParameters(
      "uint256 id0, uint256 id1, address token0, address token1, uint96 swapFee",
    ),
    [0n, coinId, zeroAddress, CoinsAddress, SWAP_FEE],
  ));

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
  receiver: Address
): `0x${string}`[] {
  // Create pool keys for both swaps
  const sourcePoolKey = computePoolKey(sourceCoinId);
  const targetPoolKey = computePoolKey(targetCoinId);
  
  const deadline = deadlineTimestamp();
  
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
    // but keep for safety in case of execution failure or unusual circumstances
    encodeFunctionData({
      abi: ZAAMAbi,
      functionName: "recoverTransientBalance",
      args: [
        CoinsAddress, // Token address for source coin
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
    // This could happen if the contract has a transient balance of the target coin
    encodeFunctionData({
      abi: ZAAMAbi,
      functionName: "recoverTransientBalance",
      args: [
        CoinsAddress, // Token address for target coin
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
  sourceReserves: { reserve0: bigint, reserve1: bigint },
  targetReserves: { reserve0: bigint, reserve1: bigint },
  slippageBps: bigint = 200n
): { amountOut: bigint, withSlippage: bigint, ethAmountOut: bigint } {
  // First swap: sourceCoin → ETH
  const ethAmountOut = getAmountOut(
    amountIn,
    sourceReserves.reserve1, // Source coin reserve
    sourceReserves.reserve0, // ETH reserve
    SWAP_FEE,
  );
  
  if (ethAmountOut === 0n) return { 
    amountOut: 0n, 
    withSlippage: 0n,
    ethAmountOut: 0n 
  };
  
  // Apply a small safety margin to ethAmountOut to account for potential slippage
  // during the first swap or any execution differences
  const safeEthAmountOut = getAmountWithSlippage(ethAmountOut, slippageBps);
  
  // Second swap: ETH → targetCoin
  const targetAmountOut = getAmountOut(
    safeEthAmountOut, // Use the safe ETH amount for estimation
    targetReserves.reserve0, // ETH reserve
    targetReserves.reserve1, // Target coin reserve
    SWAP_FEE,
  );
  
  return { 
    amountOut: targetAmountOut,
    withSlippage: getAmountWithSlippage(targetAmountOut, slippageBps),
    ethAmountOut: safeEthAmountOut // Return the safe ETH amount for the second swap
  };
}

/**
 * Calculate output amount for a swap (from ZAMM contract)
 */
export function getAmountOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  swapFee: bigint,
) {
  if (amountIn === 0n || reserveIn === 0n || reserveOut === 0n) return 0n;
  
  const amountInWithFee = amountIn * (10000n - swapFee);
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 10000n + amountInWithFee;
  return numerator / denominator;
}

/**
 * Calculate input amount for a desired output amount (from ZAMM contract)
 */
export function getAmountIn(
  amountOut: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  swapFee: bigint,
) {
  if (amountOut === 0n || reserveIn === 0n || reserveOut === 0n || amountOut >= reserveOut) 
    return 0n;
    
  const numerator = reserveIn * amountOut * 10000n;
  const denominator = (reserveOut - amountOut) * (10000n - swapFee);
  return numerator / denominator + 1n;
}