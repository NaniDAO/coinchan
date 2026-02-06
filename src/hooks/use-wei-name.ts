import { useEffect, useRef, useState } from "react";
import { createWnsClient, isWei } from "wns-utils";

export { isWei as isWeiName };

interface WeiNameResult {
  data: string | null;
  isLoading: boolean;
  isFetched: boolean;
}

const wns = createWnsClient();

// Simple cache for wei name lookups
const weiNameCache = new Map<string, string | null>();

/**
 * Hook to reverse resolve an Ethereum address to a .wei name
 * @param address - The Ethereum address to look up
 * @returns Object with wei name data, loading state, and fetched state
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
      // Check if address changed while waiting
      if (addressRef.current?.toLowerCase() !== normalizedAddress) {
        return;
      }

      try {
        const resolvedName = await wns.reverseResolve(address);

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
