import { useQuery } from "@tanstack/react-query";

/**
 * Hook to reverse resolve an Ethereum address to a .wei name
 * @param address - The Ethereum address to look up
 * @returns Object with wei name data, loading state, and error
 */
export function useWeiName(address: string | undefined) {
  return useQuery({
    queryKey: ["wei-name", address?.toLowerCase()],
    queryFn: async () => {
      if (!address || !window.wei) return null;
      try {
        const name = await window.wei.reverseResolve(address);
        return name;
      } catch (error) {
        console.error("Wei reverse resolve error:", error);
        return null;
      }
    },
    enabled: !!address && typeof window !== "undefined" && !!window.wei,
    staleTime: 60_000, // 60 seconds
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: 1,
  });
}

/**
 * Check if the Wei SDK is loaded and available
 */
export function isWeiAvailable(): boolean {
  return typeof window !== "undefined" && !!window.wei;
}

/**
 * Check if a string is a .wei name
 */
export function isWeiName(value: string): boolean {
  if (typeof window !== "undefined" && window.wei) {
    return window.wei.isWei(value);
  }
  return value.toLowerCase().endsWith(".wei");
}
