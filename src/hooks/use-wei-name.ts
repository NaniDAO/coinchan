import { useEffect, useState, useRef } from "react";

interface WeiNameResult {
  data: string | null;
  isLoading: boolean;
  isFetched: boolean;
}

// Simple cache for wei name lookups
const weiNameCache = new Map<string, string | null>();

/**
 * Hook to reverse resolve an Ethereum address to a .wei name
 * Uses simple state management instead of React Query for reliability
 * @param address - The Ethereum address to look up
 * @returns Object with wei name data, loading state, and error
 */
export function useWeiName(address: string | undefined): WeiNameResult {
  const [name, setName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetched, setIsFetched] = useState(false);
  const addressRef = useRef(address);

  useEffect(() => {
    addressRef.current = address;

    if (!address) {
      setName(null);
      setIsLoading(false);
      setIsFetched(true);
      return;
    }

    const normalizedAddress = address.toLowerCase();

    // Check cache first
    if (weiNameCache.has(normalizedAddress)) {
      setName(weiNameCache.get(normalizedAddress) ?? null);
      setIsLoading(false);
      setIsFetched(true);
      return;
    }

    setIsLoading(true);
    setIsFetched(false);

    const resolve = async () => {
      // Wait for SDK to be available
      let attempts = 0;
      while (!window.wei && attempts < 100) {
        await new Promise((r) => setTimeout(r, 50));
        attempts++;
      }

      if (!window.wei) {
        setIsLoading(false);
        setIsFetched(true);
        return;
      }

      // Check if address changed while waiting
      if (addressRef.current?.toLowerCase() !== normalizedAddress) {
        return;
      }

      try {
        // Pass original address (checksummed) to SDK, use lowercase for cache key
        const resolvedName = await window.wei.reverseResolve(address);

        // Cache the result
        weiNameCache.set(normalizedAddress, resolvedName);

        // Check if address still matches
        if (addressRef.current?.toLowerCase() === normalizedAddress) {
          setName(resolvedName);
          setIsLoading(false);
          setIsFetched(true);
        }
      } catch (err) {
        console.warn("[useWeiName] Failed to resolve:", err);
        weiNameCache.set(normalizedAddress, null);
        if (addressRef.current?.toLowerCase() === normalizedAddress) {
          setName(null);
          setIsLoading(false);
          setIsFetched(true);
        }
      }
    };

    resolve();
  }, [address]);

  return { data: name, isLoading, isFetched };
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
