import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { isAddress } from "viem";
import { mainnet } from "viem/chains";

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

    // Check if it looks like an ENS name
    const isENSName = trimmedInput.includes('.') && 
                     (trimmedInput.endsWith('.eth') || 
                      trimmedInput.endsWith('.xyz') || 
                      trimmedInput.endsWith('.com') ||
                      trimmedInput.match(/\.[a-zA-Z]{2,}$/));

    if (!isENSName) {
      setResult({
        address: null,
        isLoading: false,
        error: "Invalid address format",
        isENS: false,
      });
      return;
    }

    // Start ENS resolution
    setResult(prev => ({
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

        // Resolve the ENS name to an address  
        const resolvedAddress = await publicClient.getEnsAddress({
          name: trimmedInput,
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