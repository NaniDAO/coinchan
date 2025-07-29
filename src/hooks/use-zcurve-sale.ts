import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { usePublicClient } from "wagmi";
import { zCurveAbi, zCurveAddress } from "@/constants/zCurve";

const API_URL = import.meta.env.VITE_INDEXER_URL + "/graphql";

export type ZCurveSaleStatus = "ACTIVE" | "FINALIZED" | "EXPIRED";

export interface ZCurveSale {
  coinId: string;
  creator: Address;
  saleCap: string;
  lpSupply: string;
  netSold: string;
  deadline: string;
  divisor: string;
  ethEscrow: string;
  ethTarget: string;
  feeOrHook: string;
  quadCap: string;
  status: ZCurveSaleStatus;
  currentPrice: string;
  percentFunded: number;
  createdAt: string;
  updatedAt: string;
  coin?: {
    name: string;
    symbol: string;
    tokenURI: string;
    decimals: number;
    description: string;
    imageUrl: string;
    owner: string;
    source: string;
    token: string;
    id: string;
    totalSupply: string;
    updatedAt: string;
  };
}

export interface ZCurveBalance {
  coinId: string;
  user: Address;
  balance: string;
  totalPurchased: string;
  totalSold: string;
  totalClaimed: string;
}

export interface ZCurvePurchase {
  id: string;
  coinId: string;
  buyer: Address;
  ethIn: string;
  coinsOut: string;
  pricePerToken: string;
  timestamp: string;
  txHash: string;
}

export interface ZCurveSell {
  id: string;
  coinId: string;
  seller: Address;
  coinsIn: string;
  ethOut: string;
  pricePerToken: string;
  timestamp: string;
  txHash: string;
}

export interface ZCurveFinalization {
  coinId: string;
  ethLp: string;
  coinLp: string;
  lpMinted: string;
  timestamp: string;
  txHash: string;
}

// GraphQL query helper
async function fetchGraphQL(query: string, variables?: Record<string, any>) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.statusText}`);
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(`GraphQL errors: ${result.errors.map((e: any) => e.message).join(", ")}`);
  }

  return result.data;
}

// Fetch zCurve sale data for a specific coin
export function useZCurveSale(coinId: string | undefined) {
  return useQuery({
    queryKey: ["zcurve", "sale", coinId],
    queryFn: async () => {
      if (!coinId) throw new Error("No coin ID provided");

      const query = `
        query GetZCurveSale($coinId: BigInt!) {
          zcurveSale(coinId: $coinId) {
            blockNumber
            coinId
            createdAt
            creator
            currentPrice
            deadline
            divisor
            ethEscrow
            ethTarget
            feeOrHook
            lpSupply
            netSold
            percentFunded
            quadCap
            saleCap
            status
            txHash
            updatedAt
            coin {
              name
              symbol
              tokenURI
              decimals
              description
              imageUrl
              owner
              source
              token
              id
              totalSupply
              updatedAt
            }
          }
        }
      `;

      const data = await fetchGraphQL(query, { coinId });
      return data.zcurveSale as ZCurveSale | null;
    },
    enabled: !!coinId,
    staleTime: 5 * 1000, // 5 seconds
    refetchInterval: 10 * 1000, // refetch every 10 seconds
  });
}

// Fetch user's zCurve balance for a specific coin
export function useZCurveBalance(coinId: string | undefined, userAddress: Address | undefined) {
  return useQuery({
    queryKey: ["zcurve", "balance", coinId, userAddress],
    queryFn: async () => {
      if (!coinId || !userAddress) throw new Error("Missing parameters");

      const query = `
        query GetZCurveBalance($coinId: BigInt!, $userAddress: Bytes!) {
          zcurveBalance(id: { coinId: $coinId, user: $userAddress }) {
            coinId
            user
            balance
            totalPurchased
            totalSold
            totalClaimed
            createdAt
            updatedAt
          }
        }
      `;

      const data = await fetchGraphQL(query, { coinId, userAddress });
      return data.zcurveBalance as ZCurveBalance | null;
    },
    enabled: !!coinId && !!userAddress,
    staleTime: 5 * 1000, // 5 seconds
    refetchInterval: 10 * 1000, // refetch every 10 seconds
  });
}

// Fetch recent purchases for a zCurve sale
export function useZCurvePurchases(coinId: string | undefined, limit = 10) {
  return useQuery({
    queryKey: ["zcurve", "purchases", coinId, limit],
    queryFn: async () => {
      if (!coinId) throw new Error("No coin ID provided");

      const query = `
        query GetZCurvePurchases($coinId: BigInt!, $limit: Int!) {
          zcurvePurchases(
            where: { coinId: $coinId }
            orderBy: "timestamp"
            orderDirection: "desc"
            limit: $limit
          ) {
            items {
              id
              coinId
              buyer
              ethIn
              coinsOut
              pricePerToken
              timestamp
              txHash
              blockNumber
              createdAt
            }
          }
        }
      `;

      const data = await fetchGraphQL(query, { coinId, limit });
      return data.zcurvePurchases.items as ZCurvePurchase[];
    },
    enabled: !!coinId,
    staleTime: 10 * 1000,
  });
}

// Fetch recent sells for a zCurve sale
export function useZCurveSells(coinId: string | undefined, limit = 10) {
  return useQuery({
    queryKey: ["zcurve", "sells", coinId, limit],
    queryFn: async () => {
      if (!coinId) throw new Error("No coin ID provided");

      const query = `
        query GetZCurveSells($coinId: BigInt!, $limit: Int!) {
          zcurveSells(
            where: { coinId: $coinId }
            orderBy: "timestamp"
            orderDirection: "desc"
            limit: $limit
          ) {
            items {
              id
              coinId
              seller
              coinsIn
              ethOut
              pricePerToken
              timestamp
              txHash
              blockNumber
              createdAt
            }
          }
        }
      `;

      const data = await fetchGraphQL(query, { coinId, limit });
      return data.zcurveSells.items as ZCurveSell[];
    },
    enabled: !!coinId,
    staleTime: 10 * 1000,
  });
}

// Fetch all active zCurve sales
export function useActiveZCurveSales() {
  return useQuery({
    queryKey: ["zcurve", "sales", "active"],
    queryFn: async () => {
      const query = `
        query GetActiveZCurveSales {
          zcurveSales(
            where: { status: "ACTIVE" }
            orderBy: "createdAt"
            orderDirection: "desc"
          ) {
            items {
              blockNumber
              coinId
              createdAt
              creator
              currentPrice
              deadline
              divisor
              ethEscrow
              ethTarget
              feeOrHook
              lpSupply
              netSold
              percentFunded
              quadCap
              saleCap
              status
              txHash
              updatedAt
              coin {
                name
                symbol
                tokenURI
                decimals
                description
                imageUrl
                owner
                source
                token
                id
                totalSupply
                updatedAt
              }
            }
            totalCount
          }
        }
      `;

      const data = await fetchGraphQL(query);
      return data.zcurveSales.items as ZCurveSale[];
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

// Check if a coin has finalization data
export function useZCurveFinalization(coinId: string | undefined) {
  return useQuery({
    queryKey: ["zcurve", "finalization", coinId],
    queryFn: async () => {
      if (!coinId) throw new Error("No coin ID provided");

      const query = `
        query GetZCurveFinalization($coinId: BigInt!) {
          zcurveFinalization(id: $coinId) {
            id
            coinId
            ethLp
            coinLp
            lpMinted
            timestamp
            txHash
            blockNumber
            createdAt
          }
        }
      `;

      const data = await fetchGraphQL(query, { coinId });
      return data.zcurveFinalization as ZCurveFinalization | null;
    },
    enabled: !!coinId,
    staleTime: 60 * 1000, // 1 minute - finalization doesn't change
  });
}

// Fetch sale summary with user balance from contract
export function useZCurveSaleSummary(coinId: string | undefined, userAddress: Address | undefined) {
  const publicClient = usePublicClient();
  
  return useQuery({
    queryKey: ["zcurve", "saleSummary", coinId, userAddress],
    queryFn: async () => {
      if (!coinId || !publicClient) throw new Error("Missing parameters");
      
      const result = await publicClient.readContract({
        address: zCurveAddress,
        abi: zCurveAbi,
        functionName: "saleSummary",
        args: [BigInt(coinId), userAddress || "0x0000000000000000000000000000000000000000"],
      });
      
      return {
        creator: result[0],
        saleCap: result[1].toString(),
        netSold: result[2].toString(),
        ethEscrow: result[3].toString(),
        ethTarget: result[4].toString(),
        deadline: result[5].toString(),
        isLive: result[6],
        isFinalized: result[7],
        currentPrice: result[8].toString(),
        percentFunded: Number(result[9]),
        timeRemaining: result[10].toString(),
        userBalance: result[11].toString(),
        feeOrHook: result[12].toString(),
        divisor: result[13].toString(),
        quadCap: result[14].toString(),
      };
    },
    enabled: !!coinId && !!publicClient,
    staleTime: 5 * 1000, // 5 seconds
    refetchInterval: 10 * 1000, // refetch every 10 seconds
  });
}

// Fetch user's zCurve balances across all coins
export function useZCurveUserBalances(userAddress: Address | undefined) {
  return useQuery({
    queryKey: ["zcurve", "userBalances", userAddress],
    queryFn: async () => {
      if (!userAddress) throw new Error("No user address provided");

      const query = `
        query GetUserZCurveBalances($userAddress: Bytes!) {
          zcurveBalances(
            where: { user: $userAddress, balance_gt: "0" }
            orderBy: "updatedAt"
            orderDirection: "desc"
          ) {
            items {
              coinId
              user
              balance
              totalPurchased
              totalSold
              totalClaimed
              createdAt
              updatedAt
              sale {
                status
                coin {
                  name
                  symbol
                  imageUrl
                }
              }
            }
          }
        }
      `;

      const data = await fetchGraphQL(query, { userAddress });
      return data.zcurveBalances.items as (ZCurveBalance & {
        sale: {
          status: ZCurveSaleStatus;
          coin: {
            name: string;
            symbol: string;
            imageUrl: string;
          };
        };
      })[];
    },
    enabled: !!userAddress,
    staleTime: 10 * 1000,
  });
}

// Fetch user's zCurve activity (purchases and sells)
export function useZCurveUserActivity(userAddress: Address | undefined, limit = 20) {
  return useQuery({
    queryKey: ["zcurve", "userActivity", userAddress, limit],
    queryFn: async () => {
      if (!userAddress) throw new Error("No user address provided");

      const query = `
        query GetUserZCurveActivity($userAddress: Bytes!, $limit: Int!) {
          purchases: zcurvePurchases(
            where: { buyer: $userAddress }
            orderBy: "timestamp"
            orderDirection: "desc"
            limit: $limit
          ) {
            items {
              id
              coinId
              buyer
              ethIn
              coinsOut
              pricePerToken
              timestamp
              txHash
              sale {
                coin {
                  name
                  symbol
                  imageUrl
                }
              }
            }
          }
          sells: zcurveSells(
            where: { seller: $userAddress }
            orderBy: "timestamp"
            orderDirection: "desc"
            limit: $limit
          ) {
            items {
              id
              coinId
              seller
              coinsIn
              ethOut
              pricePerToken
              timestamp
              txHash
              sale {
                coin {
                  name
                  symbol
                  imageUrl
                }
              }
            }
          }
        }
      `;

      const data = await fetchGraphQL(query, { userAddress, limit });
      return {
        purchases: data.purchases.items as (ZCurvePurchase & {
          sale: {
            coin: {
              name: string;
              symbol: string;
              imageUrl: string;
            };
          };
        })[],
        sells: data.sells.items as (ZCurveSell & {
          sale: {
            coin: {
              name: string;
              symbol: string;
              imageUrl: string;
            };
          };
        })[],
      };
    },
    enabled: !!userAddress,
    staleTime: 10 * 1000,
  });
}
