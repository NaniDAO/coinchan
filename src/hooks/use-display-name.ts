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
 * Prioritizes .wei names, falls back to ENS
 * @param address - The Ethereum address to look up
 * @returns Object with display name, loading state, and source
 */
export function useDisplayName(address: string | undefined): DisplayNameResult {
  // Try Wei Name Service (prioritized)
  const { data: weiName, isLoading: weiLoading, isFetched: weiFetched } = useWeiName(address);

  // Try ENS as fallback
  const { data: ensName, isLoading: ensLoading } = useEnsName({
    address: address as `0x${string}` | undefined,
    chainId: mainnet.id,
    query: {
      enabled: !!address,
    },
  });

  console.log("[DisplayName]", {
    address: address?.slice(0, 10),
    weiName,
    weiLoading,
    weiFetched,
    ensName,
    ensLoading,
  });

  // Return Wei name if available (prioritized)
  if (weiName) {
    console.log("[DisplayName] Returning wei name:", weiName);
    return {
      displayName: weiName,
      isLoading: false,
      source: "wei",
    };
  }

  // Wait for Wei to finish before falling back to ENS
  // This ensures .wei names are always prioritized
  if (weiLoading || !weiFetched) {
    console.log("[DisplayName] Waiting for wei to finish...");
    return {
      displayName: null,
      isLoading: true,
      source: null,
    };
  }

  // Return ENS name if available (Wei has finished and found nothing)
  if (ensName) {
    console.log("[DisplayName] Returning ENS name:", ensName);
    return {
      displayName: ensName,
      isLoading: false,
      source: "ens",
    };
  }

  // Still loading ENS
  if (ensLoading) {
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
