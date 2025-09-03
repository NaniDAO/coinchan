export type SortBy =
  | "liquidity"
  | "recency"
  | "votes"
  | "price"
  | "fdv"
  | "holders"
  | "incentives";

export type SortDir = "asc" | "desc";

export interface CoinsTableItem {
  token: string;
  coinId: string;
  name: string | null;
  symbol: string | null;
  imageUrl: string | null;
  description: string | null;
  decimals: number;

  status: "ACTIVE" | "FINALIZED" | "EXPIRED" | null;
  percentFunded: number | null;
  saleDeadline: number | null;

  priceInEth: number | null; // number (Ξ)
  liquidityEth: number; // number (Ξ)
  fdvEth: number | null; // number (Ξ)

  totalSupplyRaw?: string | null; // optional (if you returned it)
  totalSupply?: number | null; // optional normalized

  holders: number;
  incentives: number;

  poolId: string | null;
  swapFee: string;

  createdAt: number; // epoch sec
  votes: number;
}
