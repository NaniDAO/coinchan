import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { VEZAMM_TOKEN } from "@/lib/pools";
import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";
import { usePublicClient } from "wagmi";

// --------------------
// Types
// --------------------
export type ZDrop = {
  amtIn: string;
  amtOut: string;
  blockNumber: number;
  createdAt: string;
  deadline: string;
  id: string;
  idOut: string;
  idIn: string;
  inDone: string;
  launchpadTrancheIndex: number | null;
  maker: string;
  outDone: string;
  partialFill: boolean;
  status: string;
  tokenIn: string;
  tokenOut: string;
  txHash: string;
  updatedAt: string;
};

export type ZDropsResponse = {
  items: ZDrop[];
  totalCount: number;
};

// --------------------
// Fetcher
// --------------------
const getZDrops = async (): Promise<ZDropsResponse> => {
  const query = `
    query GetZDrops {
      orders(
        where: {maker: "0x000000000069aa14fb673a86952eb0785f38911c", status: ACTIVE}
        limit: 1000
      ) {
        items {
          amtIn
          amtOut
          blockNumber
          createdAt
          deadline
          id
          idOut
          idIn
          inDone
          launchpadTrancheIndex
          maker
          outDone
          partialFill
          status
          tokenIn
          tokenOut
          txHash
          updatedAt
        }
        totalCount
      }
    }
  `;

  const res = await fetch(import.meta.env.VITE_INDEXER_URL + "/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch zDrops: ${res.statusText}`);
  }

  const { data } = await res.json();

  return data?.orders ?? { items: [], totalCount: 0 };
};

// --------------------
// Hook
// --------------------
export const useGetZDrops = ({ address }: { address?: Address }) => {
  const publicClient = usePublicClient();
  return useQuery({
    queryKey: ["zDrops", address],
    queryFn: async (): Promise<{
      eligible: boolean;
      drops: ZDropsResponse;
    }> => {
      let eligible = false;

      // if veZAMM holder
      if (address && publicClient) {
        const balance = await publicClient.readContract({
          address: CookbookAddress,
          abi: CookbookAbi,
          functionName: "balanceOf",
          args: [address, VEZAMM_TOKEN.id],
        });
        console.log("Checking veZAMM balance...", balance);
        if (balance > 0n) {
          eligible = true;
        }
      }

      const drops = await getZDrops();

      console.log("Checking veZAMM drops...", drops);

      return {
        eligible,
        drops,
      };
    },
    enabled: !!publicClient,
  });
};
