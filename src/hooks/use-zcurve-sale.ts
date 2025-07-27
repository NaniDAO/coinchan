import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

const API_URL = import.meta.env.VITE_INDEXER_URL;

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

// Fetch zCurve sale data for a specific coin
export function useZCurveSale(coinId: string | undefined) {
  return useQuery({
    queryKey: ["zcurve", "sale", coinId],
    queryFn: async () => {
      if (!coinId) throw new Error("No coin ID provided");

      const response = await fetch(`${API_URL}/zcurve/sales/${coinId}`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error("Failed to fetch zCurve sale data");
      }

      const data = await response.json();
      return data as ZCurveSale;
    },
    enabled: !!coinId,
    staleTime: 10 * 1000, // 10 seconds
  });
}

// Fetch user's zCurve balance for a specific coin
export function useZCurveBalance(coinId: string | undefined, userAddress: Address | undefined) {
  return useQuery({
    queryKey: ["zcurve", "balance", coinId, userAddress],
    queryFn: async () => {
      if (!coinId || !userAddress) throw new Error("Missing parameters");

      const response = await fetch(`${API_URL}/zcurve/balances/${coinId}/${userAddress}`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error("Failed to fetch zCurve balance");
      }

      const data = await response.json();
      return data as ZCurveBalance;
    },
    enabled: !!coinId && !!userAddress,
    staleTime: 10 * 1000,
  });
}

// Fetch recent purchases for a zCurve sale
export function useZCurvePurchases(coinId: string | undefined, limit = 10) {
  return useQuery({
    queryKey: ["zcurve", "purchases", coinId, limit],
    queryFn: async () => {
      if (!coinId) throw new Error("No coin ID provided");

      const response = await fetch(`${API_URL}/zcurve/purchases/${coinId}?limit=${limit}`);
      if (!response.ok) throw new Error("Failed to fetch purchases");

      const data = await response.json();
      return data as ZCurvePurchase[];
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

      const response = await fetch(`${API_URL}/zcurve/sells/${coinId}?limit=${limit}`);
      if (!response.ok) throw new Error("Failed to fetch sells");

      const data = await response.json();
      return data as ZCurveSell[];
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
      const response = await fetch(`${API_URL}/zcurve/sales?status=ACTIVE`);
      if (!response.ok) throw new Error("Failed to fetch active sales");

      const data = await response.json();
      return data as ZCurveSale[];
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

      const response = await fetch(`${API_URL}/zcurve/finalizations/${coinId}`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error("Failed to fetch finalization data");
      }

      const data = await response.json();
      return data as ZCurveFinalization;
    },
    enabled: !!coinId,
    staleTime: 60 * 1000, // 1 minute - finalization doesn't change
  });
}
