export type DAICOSaleStatus = "ACTIVE" | "EXPIRED" | "SOLD_OUT" | "CANCELLED";

export interface DAICOSaleItem {
  daoAddress: string;
  chainId: number;
  daoName: string | null;
  daoSymbol: string | null;
  tribTkn: string;
  forTkn: string;
  tribAmt: string;
  forAmt: string;
  deadline: number | null;
  totalSold: string;
  totalRaised: string;
  purchaseCount: number;
  status: DAICOSaleStatus;
  createdAt: number;
  updatedAt: number;

  // LP info (if configured)
  lpBps: number | null;
  feeOrHook: string | null;
  hasLP: boolean;

  // Tap info
  hasTap: boolean;
  tapRate: string | null;

  // Org stats
  totalPurchases: number;
  uniqueBuyers: number;
}

export interface DAICOOrg {
  id: string;
  chainId: number;
  name: string | null;
  symbol: string | null;
  totalSales: number;
  activeSalesCount: number;
  totalPurchases: number;
  uniqueBuyers: number;
  createdAt: number;
  updatedAt: number;
  lastActivityAt: number | null;

  // Metadata
  image: string | null;
  description: string | null;
  contractURI: string | null;

  // Relations
  sales: DAICOSale[];
  purchases: DAICOPurchase[];
  tap: DAICOTap | null;
  lps: DAICOLP[];
}

export interface DAICOSale {
  daoAddress: string;
  tribTkn: string;
  chainId: number;
  forTkn: string;
  tribAmt: string;
  forAmt: string;
  deadline: number | null;
  totalSold: string;
  totalRaised: string;
  purchaseCount: number;
  lpBps: number | null;
  maxSlipBps: number | null;
  feeOrHook: string | null;
  status: DAICOSaleStatus;
  createdAt: number;
  updatedAt: number;
  txHash: string;
  blockNumber: number;
}

export interface DAICOPurchase {
  id: string;
  chainId: number;
  daoAddress: string;
  tribTkn: string;
  buyer: string;
  payAmt: string;
  forTkn: string;
  buyAmt: string;
  timestamp: number;
  txHash: string;
  blockNumber: number;
  logIndex: number;
}

export interface DAICOTap {
  daoAddress: string;
  chainId: number;
  ops: string;
  tribTkn: string;
  ratePerSec: string;
  lastClaim: number;
  totalClaimed: string;
  claimCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface DAICOLP {
  daoAddress: string;
  tribTkn: string;
  chainId: number;
  tribUsed: string;
  forUsed: string;
  liquidity: string;
  poolId: string;
  timestamp: number;
  txHash: string;
  blockNumber: number;
}
