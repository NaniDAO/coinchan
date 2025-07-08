/**
 * Utility functions for generating Etherscan URLs
 */

/**
 * Returns a formatted Etherscan URL for a transaction hash
 * @param txHash - Transaction hash
 * @param chainId - Chain ID (defaults to 0 for Ethereum mainnet)
 * @returns Formatted Etherscan URL
 */
export function getEtherscanTxUrl(txHash: string, chainId = 0): string {
  const baseUrl = getEtherscanBaseUrl(chainId);
  return `${baseUrl}/tx/${txHash}`;
}

/**
 * Returns a formatted Etherscan URL for an address
 * @param address - Ethereum address
 * @param chainId - Chain ID (defaults to 0 for Ethereum mainnet)
 * @returns Formatted Etherscan URL
 */
export function getEtherscanAddressUrl(address: string, chainId = 0): string {
  const baseUrl = getEtherscanBaseUrl(chainId);
  return `${baseUrl}/address/${address}`;
}

/**
 * Returns the base Etherscan URL based on the chain ID
 * @param chainId - Chain ID
 * @returns Base Etherscan URL
 */
function getEtherscanBaseUrl(chainId: number): string {
  switch (chainId) {
    case 1:
      return "https://etherscan.io";
    case 5:
      return "https://goerli.etherscan.io";
    case 11155111:
      return "https://sepolia.etherscan.io";
    case 42161:
      return "https://arbiscan.io";
    case 10:
      return "https://optimistic.etherscan.io";
    case 137:
      return "https://polygonscan.com";
    case 56:
      return "https://bscscan.com";
    case 43114:
      return "https://snowtrace.io";
    default:
      return "https://etherscan.io";
  }
}
