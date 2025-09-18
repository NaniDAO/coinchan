import type { CoinSource } from "./coins";

/**
 * Determines if a coin is a cookbook coin based on its ID
 * Cookbook coins have ID < 1000000n
 */
export const isCookbookCoin = (
  coinId: string | bigint | null,
): boolean | null => {
  try {
    return coinId !== null && BigInt(coinId) < 1000000n;
  } catch (error) {
    console.error("Error checking if coin is cookbook:", error);
    return null;
  }
};

/**
 * Determines the correct reserve source based on coin type
 * Custom pools (like USDT) use ZAMM, cookbook coins use COOKBOOK
 */
export const determineReserveSource = (
  coinId: bigint | null,
  isCustomPool: boolean,
): CoinSource => {
  const isCookbook = isCookbookCoin(coinId);
  return isCookbook && !isCustomPool ? "COOKBOOK" : "ZAMM";
};

/**
 * Determines helper contract selection based on coin type
 * Returns contract addresses and ABIs for the appropriate helper
 */
export const getHelperContractInfo = (coinId: bigint | null) => {
  const isCookbook = isCookbookCoin(coinId);

  return {
    isCookbook,
    helperType: isCookbook ? "ZAMMHelperV1" : "ZAMMHelper",
  };
};

/**
 * Determines the target ZAMM address based on coin type
 * Cookbook coins use CookbookAddress, regular coins use ZAMMAddress
 */
export const getTargetZAMMAddress = (coinId: bigint | null) => {
  const isCookbook = isCookbookCoin(coinId);

  return {
    isCookbook,
    contractType: isCookbook ? "Cookbook" : "ZAMM",
  };
};
