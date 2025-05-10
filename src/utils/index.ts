import { pinJsonToPinata, pinImageToPinata } from "./pinata";
import { isUserRejectionError, handleWalletError } from "./errorHandling";
import { zeroAddress, Address } from "viem";
import { CoinsAddress } from "../constants/Coins";

/**
 * Constants for AMM operations
 */
export const SWAP_FEE = 100n; // 1% pool fee
export const SLIPPAGE_BPS = 100n; // 1% slippage tolerance
export const DEADLINE_SEC = 20 * 60; // 20 minutes

/**
 * Apply slippage tolerance to amount
 * @param amount Raw amount
 * @returns Amount with slippage applied
 */
export const withSlippage = (amount: bigint) => (amount * (10000n - SLIPPAGE_BPS)) / 10000n;

/**
 * Generate a deadline timestamp in seconds
 * @returns BigInt of current time + deadline window
 */
export const deadlineTimestamp = () => BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SEC);

/**
 * Compute pool key structure for a coin ID for ZAMM
 * @param coinId The coin ID to trade with ETH
 * @returns PoolKey structure
 */
export const computePoolKey = (coinId: bigint) => ({
  id0: 0n,
  id1: coinId,
  token0: zeroAddress as Address,
  token1: CoinsAddress,
  swapFee: SWAP_FEE,
});

/**
 * Helper to create a nowSec function for deadline calculations
 * @returns Current timestamp in seconds as BigInt
 */
export const nowSec = () => BigInt(Math.floor(Date.now() / 1000));

/**
 * Create a debounced function that delays invoking the provided function
 * until after `wait` milliseconds have elapsed since the last invocation.
 *
 * @param func The function to debounce
 * @param wait The number of milliseconds to delay
 * @returns A debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait = 300
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function(this: any, ...args: Parameters<T>): void {
    const context = this;

    if (timeout !== null) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func.apply(context, args);
      timeout = null;
    }, wait);
  };
}

export { pinJsonToPinata, pinImageToPinata, isUserRejectionError, handleWalletError };
