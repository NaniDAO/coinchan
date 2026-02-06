/**
 * Wei Name Service SDK type declarations
 * @see https://import.wei.domains
 */

interface WeiNameService {
  /**
   * Resolve a .wei name to an Ethereum address
   * @param name - The .wei name to resolve (e.g., "name.wei")
   * @returns The resolved address or null if not found
   */
  resolve(name: string): Promise<`0x${string}` | null>;

  /**
   * Reverse resolve an Ethereum address to a .wei name
   * @param address - The Ethereum address to look up
   * @returns The .wei name or null if not set
   */
  reverseResolve(address: string): Promise<string | null>;

  /**
   * Smart resolve - resolves .wei names and passes addresses through
   * @param input - Either a .wei name or an Ethereum address
   * @returns The resolved address or null
   */
  resolveAny(input: string): Promise<`0x${string}` | null>;

  /**
   * Check if a string is a .wei name
   * @param value - The string to check
   * @returns True if the string ends with .wei
   */
  isWei(value: string): boolean;

  /**
   * Configure the Wei SDK
   * @param options - Configuration options
   */
  config(options: { rpc?: string }): void;

  /**
   * The Wei Name Service contract address
   */
  CONTRACT: `0x${string}`;

  /**
   * The Base Portal contract address for bridging
   */
  BASE_PORTAL: `0x${string}`;
}

declare global {
  interface Window {
    wei?: WeiNameService;
  }
  const wei: WeiNameService | undefined;
}

export type {};
