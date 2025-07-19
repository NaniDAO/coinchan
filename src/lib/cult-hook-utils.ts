import { readContract } from "wagmi/actions";
import { config } from "@/wagmi";
import { CultHookAbi, CultHookAddress } from "@/constants/CultHook";
import { CULT_ADDRESS, CULT_POOL_KEY } from "@/lib/coins";

// Default tax rate (10 bps = 0.1%)
const DEFAULT_TAX_RATE = 10n;

/**
 * Get the current tax rate from the CultHook contract
 */
export async function getCultHookTaxRate(): Promise<bigint> {
  try {
    const taxRate = await readContract(config, {
      address: CultHookAddress,
      abi: CultHookAbi,
      functionName: "taxRate",
    });
    return taxRate;
  } catch (error) {
    console.warn("Failed to fetch CultHook tax rate, using default:", error);
    return DEFAULT_TAX_RATE;
  }
}

/**
 * Convert net amount to gross amount (adds tax)
 * For ETH input: User wants to input NET amount, we calculate GROSS amount to send
 */
export function toGross(net: bigint, taxRate: bigint = DEFAULT_TAX_RATE): bigint {
  const basis = 10000n;
  return (net * basis + (basis - taxRate) - 1n) / (basis - taxRate);
}

/**
 * Convert gross amount to net amount (subtracts tax)
 * For ETH output: User receives NET amount after tax is deducted
 */
export function toNet(gross: bigint, taxRate: bigint = DEFAULT_TAX_RATE): bigint {
  return (gross * (10000n - taxRate)) / 10000n;
}

/**
 * Calculate tax amount from gross
 */
export function calculateTax(gross: bigint, taxRate: bigint = DEFAULT_TAX_RATE): bigint {
  return (gross * taxRate) / 10000n;
}

/**
 * Check if a token is the CULT token
 */
export function isCultToken(tokenAddress: string): boolean {
  return tokenAddress.toLowerCase() === CULT_ADDRESS.toLowerCase();
}

/**
 * Check if a pool uses the CultHook
 */
export function isCultHookPool(
  token0: string,
  token1: string,
  feeOrHook?: bigint
): boolean {
  const isCultPool = 
    (token0.toLowerCase() === "0x0000000000000000000000000000000000000000" && 
     token1.toLowerCase() === CULT_ADDRESS.toLowerCase()) ||
    (token1.toLowerCase() === "0x0000000000000000000000000000000000000000" && 
     token0.toLowerCase() === CULT_ADDRESS.toLowerCase());
  
  return isCultPool && feeOrHook === CULT_POOL_KEY.feeOrHook;
}

/**
 * Get the contract address to use for swapping
 * Returns CultHook address for CULT swaps, regular contract address otherwise
 */
export function getSwapContractAddress(
  token0: string,
  token1: string,
  feeOrHook?: bigint,
  regularContractAddress?: string
): string {
  if (isCultHookPool(token0, token1, feeOrHook)) {
    return CultHookAddress;
  }
  return regularContractAddress || "";
}

/**
 * Adjust swap parameters for CultHook
 * For ETH→CULT: adjust msg.value to gross amount
 * For CULT→ETH: adjust expected output to account for tax
 */
export function adjustSwapParamsForCultHook(
  isExactIn: boolean,
  zeroForOne: boolean, // true = ETH→CULT, false = CULT→ETH
  amount: bigint,
  taxRate: bigint = DEFAULT_TAX_RATE
): {
  adjustedAmount: bigint;
  msgValue: bigint;
} {
  if (zeroForOne) {
    // ETH → CULT
    if (isExactIn) {
      // User provides NET ETH amount, we need GROSS for msg.value
      const grossAmount = toGross(amount, taxRate);
      return {
        adjustedAmount: amount, // CultHook expects net amount
        msgValue: grossAmount,  // Send gross amount as msg.value
      };
    } else {
      // exactOut: User wants exact CULT out, provide max gross ETH
      return {
        adjustedAmount: amount, // Amount out stays the same
        msgValue: amount,       // This should be the max gross amount user willing to spend
      };
    }
  } else {
    // CULT → ETH
    if (isExactIn) {
      // User provides CULT amount, expects NET ETH out
      return {
        adjustedAmount: amount, // CULT amount stays the same
        msgValue: 0n,           // No ETH sent for token→ETH
      };
    } else {
      // exactOut: User wants NET ETH out, needs to provide enough CULT
      return {
        adjustedAmount: amount, // This is the net ETH amount user wants
        msgValue: 0n,           // No ETH sent for token→ETH
      };
    }
  }
}