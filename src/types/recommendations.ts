export type TokenStandard = "ERC20" | "ERC6909";

export type SwapSide = "SWAP_EXACT_IN" | "SWAP_EXACT_OUT";

export type RecommendationSignal =
  | "DUST_CONSOLIDATION"
  | "LP_UNWIND"
  | "REBALANCE"
  | "RISK_TRIM"
  | "STABLECOIN_MIGRATION"
  | "REDUNDANT_ASSET"
  | "FEE_EFFICIENCY";

export interface TokenMetadata {
  address: string;
  id: string | null;
  chainId: number;
  decimals: number;
  name: string;
  symbol: string;
  imageUrl: string;
  standard: TokenStandard;
}

export interface Recommendation {
  tokenIn: TokenMetadata;
  tokenOut: TokenMetadata;
  amount: string;
  side: SwapSide;
  why: string;
  signals: RecommendationSignal[];
  references: number[];
  confidence: number | null;
}

export interface RecommendationsResponse {
  address: string;
  hits: number;
  activity_preview: string;
  market_preview: string;
  recommendations: Recommendation[];
  duration_ms: number;
}
