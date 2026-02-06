import { mainnet } from "viem/chains";
import { useEnsName } from "wagmi";
import { useWeiName } from "./use-wei-name";

interface DisplayNameResult {
  displayName: string | null;
  isLoading: boolean;
  source: "ens" | "wei" | null;
}

/**
 * Hook to get the display name for an address
 * Tries ENS first, then falls back to Wei Name Service
 * @param address - The Ethereum address to look up
 * @returns Object with display name, loading state, and source
 */
export function useDisplayName(address: string | undefined): DisplayNameResult {
  // Try ENS first
  const { data: ensName, isLoading: ensLoading } = useEnsName({
    address: address as `0x${string}` | undefined,
    chainId: mainnet.id,
    query: {
      enabled: !!address,
    },
  });

  // Try Wei Name Service
  const { data: weiName, isLoading: weiLoading } = useWeiName(address);

  // Return ENS name if available
  if (ensName) {
    return {
      displayName: ensName,
      isLoading: false,
      source: "ens",
    };
  }

  // Return Wei name if available
  if (weiName) {
    return {
      displayName: weiName,
      isLoading: false,
      source: "wei",
    };
  }

  // Still loading
  if (ensLoading || weiLoading) {
    return {
      displayName: null,
      isLoading: true,
      source: null,
    };
  }

  // No name found
  return {
    displayName: null,
    isLoading: false,
    source: null,
  };
}

/**
 * Format an address for display, using ENS or Wei name if available
 */
export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
