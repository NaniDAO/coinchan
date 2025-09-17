import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { usePublicClient } from "wagmi";
import { formatImageURL } from "./metadata";

const TokenURIAbi = [
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
] as const;

const INDEXER_URL =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_INDEXER_URL
    ? `${import.meta.env.VITE_INDEXER_URL}/graphql`
    : undefined;

const graphqlQuery = `
  query GetCoinTokenURI($id: BigInt!, $token: String!) {
    coin(id: $id, token: $token) {
      tokenURI
    }
  }
`;

/**
 * Try GraphQL first (import.meta.env.VITE_INDEXER_URL/graphql).
 * If that fails, try on-chain readContract tokenURI(id).
 * If that also fails, return null.
 */
const fetchTokenURI = async (
  address: Address,
  id: string,
  publicClient: ReturnType<typeof usePublicClient> | null,
): Promise<string | null> => {
  // 1) Try indexer GraphQL
  if (INDEXER_URL) {
    try {
      const res = await fetch(INDEXER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: graphqlQuery,
          variables: { id, token: address },
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const uri: string | undefined = json?.data?.coin?.tokenURI;

        if (uri && typeof uri === "string" && uri.length > 0) {
          return uri;
        }
      }
    } catch {
      // swallow and fall through to on-chain
    }
  }

  // 2) Fallback to on-chain readContract
  if (publicClient) {
    try {
      // Accept decimal string ids; convert safely
      const tokenId = BigInt(id);

      const uri = await publicClient.readContract({
        address,
        abi: TokenURIAbi,
        functionName: "tokenURI",
        args: [tokenId],
      });

      if (uri && typeof uri === "string" && uri.length > 0) {
        return uri;
      }
    } catch {
      // swallow and fall through to null
    }
  }

  // 3) Ultimately give up
  return null;
};

export const useGetMetadata = (address: Address, id?: string) => {
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: ["metadata", address, id],
    queryFn: async () => {
      if (!address || !id || !publicClient) return null;

      const tokenURI = await fetchTokenURI(address, id, publicClient);
      if (!tokenURI) return null;

      const res = await fetch(formatImageURL(tokenURI));
      if (!res.ok) return null;

      // Expecting NFT metadata JSON
      return res.json();
    },
    enabled: !!address && !!id && !!publicClient,
  });
};
