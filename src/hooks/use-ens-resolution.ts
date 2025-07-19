import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { isAddress } from "viem";
import { mainnet } from "viem/chains";

// Import normalization function for international domain names
const normalizeEnsName = (name: string): string => {
  try {
    // Basic normalization for international characters
    return name.normalize("NFC").toLowerCase();
  } catch (error) {
    console.warn("ENS name normalization failed:", error);
    return name.toLowerCase();
  }
};

export interface ENSResolutionResult {
  address: `0x${string}` | null;
  isLoading: boolean;
  error: string | null;
  isENS: boolean;
}

/**
 * Hook to resolve ENS names to Ethereum addresses
 * @param input - The input string (could be address or ENS name)
 * @returns Object with resolved address, loading state, error, and whether input is ENS
 */
export function useENSResolution(input: string): ENSResolutionResult {
  const [result, setResult] = useState<ENSResolutionResult>({
    address: null,
    isLoading: false,
    error: null,
    isENS: false,
  });

  const publicClient = usePublicClient({ chainId: mainnet.id });

  useEffect(() => {
    if (!input || input.trim() === "") {
      setResult({
        address: null,
        isLoading: false,
        error: null,
        isENS: false,
      });
      return;
    }

    const trimmedInput = input.trim();

    // Check if it's already a valid Ethereum address
    if (isAddress(trimmedInput)) {
      setResult({
        address: trimmedInput as `0x${string}`,
        isLoading: false,
        error: null,
        isENS: false,
      });
      return;
    }

    // Check if it looks like an ENS name (including international characters)
    const isENSName =
      trimmedInput.includes(".") &&
      (trimmedInput.endsWith(".eth") ||
        trimmedInput.endsWith(".xyz") ||
        trimmedInput.endsWith(".com") ||
        trimmedInput.match(/\.[a-zA-Z\u00a1-\uffff]{2,}$/));

    // Check if input could potentially be a valid ENS name being typed
    const couldBeENS = trimmedInput.match(/^[a-zA-Z0-9\u00a1-\uffff-]+(\.[a-zA-Z\u00a1-\uffff]*)?$/);

    // Only show error for inputs that clearly can't be valid addresses or ENS names
    // and are longer than 2 characters (to avoid showing errors too early)
    if (!isENSName && !couldBeENS && trimmedInput.length > 2) {
      setResult({
        address: null,
        isLoading: false,
        error: "Invalid address format",
        isENS: false,
      });
      return;
    }

    // If it's not a complete ENS name yet, don't show error or try to resolve
    if (!isENSName) {
      setResult({
        address: null,
        isLoading: false,
        error: null,
        isENS: false,
      });
      return;
    }

    // Start ENS resolution
    setResult((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      isENS: true,
    }));

    let cancelled = false;

    const resolveENS = async () => {
      try {
        if (!publicClient) {
          throw new Error("Unable to connect to Ethereum network");
        }

        // Normalize the ENS name to handle international characters
        const normalizedName = normalizeEnsName(trimmedInput);

        // Resolve the ENS name to an address
        const resolvedAddress = await publicClient.getEnsAddress({
          name: normalizedName,
        });

        // Check if this request was cancelled
        if (cancelled) return;

        if (!resolvedAddress) {
          setResult({
            address: null,
            isLoading: false,
            error: "ENS name not found",
            isENS: true,
          });
          return;
        }

        setResult({
          address: resolvedAddress,
          isLoading: false,
          error: null,
          isENS: true,
        });
      } catch (error) {
        // Check if this request was cancelled
        if (cancelled) return;

        console.error("ENS resolution error:", error);
        setResult({
          address: null,
          isLoading: false,
          error: error instanceof Error ? error.message : "Failed to resolve ENS name",
          isENS: true,
        });
      }
    };

    const timeoutId = setTimeout(resolveENS, 300); // Debounce for 300ms

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [input, publicClient]);

  return result;
}
