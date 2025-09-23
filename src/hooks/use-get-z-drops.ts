import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { Token, VEZAMM_TOKEN } from "@/lib/pools";
import { useQuery } from "@tanstack/react-query";
import { Address } from "viem";
import { usePublicClient } from "wagmi";

// --------------------
// Types
// --------------------
export type ZDropCoin = {
  token: string;
  id: string;
  name: string;
  symbol: string;
  imageUrl: string | null;
  decimals: number;
};

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

  // NEW:
  coinIn: ZDropCoin;
  coinOut: ZDropCoin;
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
        where: { maker: "0x000000000069aa14fb673a86952eb0785f38911c", status: ACTIVE }
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
          coinIn {
            token
            id
            name
            symbol
            imageUrl
            decimals
          }
          coinOut {
            token
            id
            name
            symbol
            imageUrl
            decimals
          }
        }
        totalCount
      }
    }
  `;

  const res = await fetch(import.meta.env.VITE_INDEXER_URL + "/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
export const useGetZDrops = ({
  address,
  tokenIn,
}: {
  address?: Address;
  tokenIn?: Token;
}) => {
  const publicClient = usePublicClient();
  return useQuery({
    queryKey: ["zDrops", address, tokenIn?.address, tokenIn?.id?.toString()],
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

        if (balance > 0n) {
          eligible = true;
        }
      }

      let drops = await getZDrops();

      if (tokenIn) {
        const dropItems = drops.items.filter(
          (drop) =>
            drop.tokenIn.toLowerCase() === tokenIn.address.toLowerCase() &&
            drop.idIn.toString() === tokenIn.id.toString(),
        );

        return {
          eligible,
          drops: {
            items: dropItems,
            totalCount: dropItems.length,
          },
        };
      }

      return {
        eligible,
        drops,
      };
    },
    enabled: !!publicClient,
  });
};
