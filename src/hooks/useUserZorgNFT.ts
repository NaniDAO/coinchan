import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { ZORG_NFT, ZORG_NFT_ABI } from "@/constants/ZORGNFT";
import { useState, useEffect, useMemo } from "react";

const ZORG_TOKEN_CACHE_KEY = "zorg-nft-token-id";
const BATCH_SIZE = 50;

const parseTokenURI = (tokenURI: string): { image: string } | null => {
  try {
    const base64Data = tokenURI.replace("data:application/json;base64,", "");
    const jsonString = atob(base64Data);
    const metadata = JSON.parse(jsonString);
    return { image: metadata.image || "" };
  } catch {
    return null;
  }
};

type CachedData = { tokenId: number } | { noNft: true };

const getCachedData = (address: string): CachedData | null => {
  try {
    const cached = localStorage.getItem(`${ZORG_TOKEN_CACHE_KEY}-${address.toLowerCase()}`);
    if (!cached) return null;
    if (cached === "none") return { noNft: true };
    return { tokenId: Number.parseInt(cached, 10) };
  } catch {
    return null;
  }
};

const setCachedTokenId = (address: string, tokenId: number) => {
  try {
    localStorage.setItem(`${ZORG_TOKEN_CACHE_KEY}-${address.toLowerCase()}`, tokenId.toString());
  } catch {
    // ignore
  }
};

const setCachedNoNft = (address: string) => {
  try {
    localStorage.setItem(`${ZORG_TOKEN_CACHE_KEY}-${address.toLowerCase()}`, "none");
  } catch {
    // ignore
  }
};

const clearCache = (address: string) => {
  try {
    localStorage.removeItem(`${ZORG_TOKEN_CACHE_KEY}-${address.toLowerCase()}`);
  } catch {
    // ignore
  }
};

export const useUserZorgNFT = () => {
  const { address } = useAccount();
  const [nftImage, setNftImage] = useState<string | null>(null);
  const [foundTokenId, setFoundTokenId] = useState<number | null>(null);
  const [searchBatchStart, setSearchBatchStart] = useState<number | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [cachedNoNft, setCachedNoNftState] = useState(false);
  const [cacheChecked, setCacheChecked] = useState(false);

  // Load cached data on mount
  useEffect(() => {
    if (address) {
      const cached = getCachedData(address);
      if (cached) {
        if ("noNft" in cached) {
          setCachedNoNftState(true);
        } else {
          setFoundTokenId(cached.tokenId);
        }
      }
      setCacheChecked(true);
    } else {
      setCacheChecked(false);
      setFoundTokenId(null);
      setCachedNoNftState(false);
    }
  }, [address]);

  // Check if user has an NFT (this is cheap - single balanceOf call)
  const { data: nftBalance } = useReadContract({
    address: ZORG_NFT,
    abi: ZORG_NFT_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, staleTime: 60_000 },
  });

  const { data: totalSupply } = useReadContract({
    address: ZORG_NFT,
    abi: ZORG_NFT_ABI,
    functionName: "totalSupply",
    query: { staleTime: 60_000 },
  });

  const userHasNFT = nftBalance !== undefined && nftBalance > 0n;
  const maxSupply = totalSupply ? Number(totalSupply) : 0;

  // If balance is 0, cache "no-nft" and skip everything
  useEffect(() => {
    if (address && cacheChecked && nftBalance !== undefined && nftBalance === 0n && !cachedNoNft) {
      setCachedNoNft(address);
      setCachedNoNftState(true);
    }
    // If balance > 0 but we had cached "no-nft", clear it
    if (address && cacheChecked && userHasNFT && cachedNoNft) {
      clearCache(address);
      setCachedNoNftState(false);
    }
  }, [address, cacheChecked, nftBalance, userHasNFT, cachedNoNft]);

  // Verify cached token is still owned by user
  const { data: cachedTokenOwner, isSuccess: ownerCheckDone } = useReadContract({
    address: ZORG_NFT,
    abi: ZORG_NFT_ABI,
    functionName: "ownerOf",
    args: foundTokenId ? [BigInt(foundTokenId)] : undefined,
    query: {
      enabled: !!foundTokenId && userHasNFT,
      staleTime: 60_000,
    },
  });

  // Check if cached token is valid
  const cachedIsValid =
    foundTokenId && cachedTokenOwner && address
      ? (cachedTokenOwner as string).toLowerCase() === address.toLowerCase()
      : false;

  // If cached token is invalid (user sold), clear cache and search again
  useEffect(() => {
    if (address && foundTokenId && ownerCheckDone && !cachedIsValid && userHasNFT && !isSearching) {
      clearCache(address);
      setFoundTokenId(null);
      setSearchBatchStart(1);
      setIsSearching(true);
    }
  }, [address, foundTokenId, ownerCheckDone, cachedIsValid, userHasNFT, isSearching]);

  // Start search if user has NFT, no cached token, not cached as "no-nft", and not already searching
  useEffect(() => {
    if (
      address &&
      cacheChecked &&
      userHasNFT &&
      !cachedNoNft &&
      foundTokenId === null &&
      !isSearching &&
      maxSupply > 0
    ) {
      setSearchBatchStart(1);
      setIsSearching(true);
    }
  }, [address, cacheChecked, userHasNFT, cachedNoNft, foundTokenId, isSearching, maxSupply]);

  // Generate batch of token IDs to check
  const batchTokenIds = useMemo(() => {
    if (!isSearching || searchBatchStart === null || maxSupply === 0) return [];
    const ids: number[] = [];
    for (let i = searchBatchStart; i < searchBatchStart + BATCH_SIZE && i <= maxSupply; i++) {
      ids.push(i);
    }
    return ids;
  }, [isSearching, searchBatchStart, maxSupply]);

  // Batch check ownership
  const { data: ownershipResults } = useReadContracts({
    contracts: batchTokenIds.map((id) => ({
      address: ZORG_NFT as `0x${string}`,
      abi: ZORG_NFT_ABI,
      functionName: "ownerOf" as const,
      args: [BigInt(id)] as const,
    })),
    query: {
      enabled: batchTokenIds.length > 0 && isSearching,
      staleTime: 60_000,
    },
  });

  // Process batch results
  useEffect(() => {
    if (!ownershipResults || !address || !isSearching || searchBatchStart === null) return;

    for (let i = 0; i < ownershipResults.length; i++) {
      const result = ownershipResults[i];
      if (
        result.status === "success" &&
        typeof result.result === "string" &&
        result.result.toLowerCase() === address.toLowerCase()
      ) {
        const tokenId = batchTokenIds[i];
        setFoundTokenId(tokenId);
        setCachedTokenId(address, tokenId);
        setIsSearching(false);
        setSearchBatchStart(null);
        return;
      }
    }

    // Not found in this batch, try next batch
    const nextBatchStart = searchBatchStart + BATCH_SIZE;
    if (nextBatchStart <= maxSupply) {
      setSearchBatchStart(nextBatchStart);
    } else {
      // Searched all tokens, not found - cache as no-nft
      setCachedNoNft(address);
      setCachedNoNftState(true);
      setIsSearching(false);
      setSearchBatchStart(null);
    }
  }, [ownershipResults, address, isSearching, searchBatchStart, batchTokenIds, maxSupply]);

  // Fetch tokenURI for found token
  const { data: tokenURI } = useReadContract({
    address: ZORG_NFT,
    abi: ZORG_NFT_ABI,
    functionName: "tokenURI",
    args: foundTokenId && cachedIsValid ? [BigInt(foundTokenId)] : undefined,
    query: {
      enabled: !!foundTokenId && cachedIsValid,
      staleTime: 300_000,
    },
  });

  // Parse NFT image
  useEffect(() => {
    if (tokenURI) {
      const parsed = parseTokenURI(tokenURI as string);
      if (parsed) {
        setNftImage(parsed.image);
      }
    }
  }, [tokenURI]);

  return { nftImage, hasNFT: userHasNFT && cachedIsValid, tokenId: foundTokenId };
};
