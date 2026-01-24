import { useQuery } from "@tanstack/react-query";
import { ZORG_NFT } from "@/constants/ZORGNFT";

type AlchemyNFT = {
  tokenId: string;
  image?: {
    cachedUrl?: string;
    originalUrl?: string;
  };
  raw?: {
    metadata?: {
      image?: string;
    };
  };
};

type AlchemyResponse = {
  ownedNfts: AlchemyNFT[];
};

// Extract API key from Alchemy RPC URL
const getAlchemyApiKey = (): string | null => {
  const alchemyUrl = import.meta.env.VITE_ALCHEMY_1;
  if (!alchemyUrl) return null;
  // URL format: https://eth-mainnet.g.alchemy.com/v2/{apiKey}
  const match = alchemyUrl.match(/\/v2\/([^/]+)$/);
  return match ? match[1] : null;
};

const fetchZorgNFT = async (address: string): Promise<{ tokenId: string; image: string } | null> => {
  const apiKey = getAlchemyApiKey();
  if (!apiKey) {
    console.warn("Alchemy API key not found");
    return null;
  }

  const url = `https://eth-mainnet.g.alchemy.com/nft/v3/${apiKey}/getNFTsForOwner?owner=${address}&contractAddresses[]=${ZORG_NFT}&withMetadata=true`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Alchemy API error: ${response.status}`);
  }

  const data: AlchemyResponse = await response.json();

  if (!data.ownedNfts || data.ownedNfts.length === 0) {
    return null;
  }

  // Get the first NFT (lowest token ID)
  const nft = data.ownedNfts[0];
  const image = nft.image?.cachedUrl || nft.image?.originalUrl || nft.raw?.metadata?.image || "";

  return {
    tokenId: nft.tokenId,
    image,
  };
};

/**
 * Hook to fetch ZORG NFT for any address using Alchemy NFT API.
 * Results are cached via React Query.
 */
export const useAddressZorgNFT = (address: string | undefined) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["zorg-nft", address?.toLowerCase()],
    queryFn: () => fetchZorgNFT(address!),
    enabled: !!address,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 24 * 60 * 60 * 1000, // 24 hours (persisted in localStorage via React Query)
  });

  return {
    nftImage: data?.image ?? null,
    tokenId: data?.tokenId ?? null,
    hasNFT: !!data,
    isLoading,
    error,
  };
};
