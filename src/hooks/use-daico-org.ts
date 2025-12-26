import { useQuery } from "@tanstack/react-query";
import type { DAICOOrg } from "@/types/daico";

const INDEXER_URL = import.meta.env.VITE_INDEXER_URL;

const GET_DAICO_ORG = `
  query GetDAICOOrg($daoAddress: String!) {
    daicoOrg(id: $daoAddress, chainId: 1) {
      id
      chainId
      name
      symbol
      totalSales
      activeSalesCount
      totalPurchases
      uniqueBuyers
      createdAt
      updatedAt
      lastActivityAt
      sales {
        daoAddress
        tribTkn
        chainId
        forTkn
        tribAmt
        forAmt
        deadline
        totalSold
        totalRaised
        purchaseCount
        lpBps
        maxSlipBps
        feeOrHook
        status
        createdAt
        updatedAt
        txHash
        blockNumber
      }
      purchases {
        id
        chainId
        daoAddress
        tribTkn
        buyer
        payAmt
        forTkn
        buyAmt
        timestamp
        txHash
        blockNumber
        logIndex
      }
      tap {
        daoAddress
        chainId
        ops
        tribTkn
        ratePerSec
        lastClaim
        totalClaimed
        claimCount
        createdAt
        updatedAt
      }
      lps {
        daoAddress
        tribTkn
        chainId
        tribUsed
        forUsed
        liquidity
        poolId
        timestamp
        txHash
        blockNumber
      }
    }
  }
`;

type DAICOOrgResponse = {
  id: string;
  chainId: number;
  name: string | null;
  symbol: string | null;
  totalSales: number;
  activeSalesCount: number;
  totalPurchases: number;
  uniqueBuyers: number;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string | null;
  sales: Array<{
    daoAddress: string;
    tribTkn: string;
    chainId: number;
    forTkn: string;
    tribAmt: string;
    forAmt: string;
    deadline: string | null;
    totalSold: string;
    totalRaised: string;
    purchaseCount: number;
    lpBps: number | null;
    maxSlipBps: number | null;
    feeOrHook: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
    txHash: string;
    blockNumber: string;
  }>;
  purchases: Array<{
    id: string;
    chainId: number;
    daoAddress: string;
    tribTkn: string;
    buyer: string;
    payAmt: string;
    forTkn: string;
    buyAmt: string;
    timestamp: string;
    txHash: string;
    blockNumber: string;
    logIndex: number;
  }>;
  tap: {
    daoAddress: string;
    chainId: number;
    ops: string;
    tribTkn: string;
    ratePerSec: string;
    lastClaim: string;
    totalClaimed: string;
    claimCount: number;
    createdAt: string;
    updatedAt: string;
  } | null;
  lps: Array<{
    daoAddress: string;
    tribTkn: string;
    chainId: number;
    tribUsed: string;
    forUsed: string;
    liquidity: string;
    poolId: string;
    timestamp: string;
    txHash: string;
    blockNumber: string;
  }>;
};

type GetDAICOOrgResponse = {
  data?: {
    daicoOrg: DAICOOrgResponse | null;
  };
  errors?: Array<{ message: string }>;
};

async function fetchDAICOOrg(daoAddress: string): Promise<DAICOOrg | null> {
  const response = await fetch(`${INDEXER_URL}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: GET_DAICO_ORG,
      variables: { daoAddress },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result = (await response.json()) as GetDAICOOrgResponse;

  if (result.errors) {
    throw new Error(result.errors[0].message);
  }

  const org = result.data?.daicoOrg;

  if (!org) {
    return null;
  }

  return {
    id: org.id,
    chainId: org.chainId,
    name: org.name,
    symbol: org.symbol,
    totalSales: org.totalSales,
    activeSalesCount: org.activeSalesCount,
    totalPurchases: org.totalPurchases,
    uniqueBuyers: org.uniqueBuyers,
    createdAt: parseInt(org.createdAt),
    updatedAt: parseInt(org.updatedAt),
    lastActivityAt: org.lastActivityAt ? parseInt(org.lastActivityAt) : null,
    sales: org.sales.map((sale) => ({
      daoAddress: sale.daoAddress,
      tribTkn: sale.tribTkn,
      chainId: sale.chainId,
      forTkn: sale.forTkn,
      tribAmt: sale.tribAmt,
      forAmt: sale.forAmt,
      deadline: sale.deadline ? parseInt(sale.deadline) : null,
      totalSold: sale.totalSold,
      totalRaised: sale.totalRaised,
      purchaseCount: sale.purchaseCount,
      lpBps: sale.lpBps,
      maxSlipBps: sale.maxSlipBps,
      feeOrHook: sale.feeOrHook,
      status: sale.status as "ACTIVE" | "EXPIRED" | "SOLD_OUT" | "CANCELLED",
      createdAt: parseInt(sale.createdAt),
      updatedAt: parseInt(sale.updatedAt),
      txHash: sale.txHash,
      blockNumber: parseInt(sale.blockNumber),
    })),
    purchases: org.purchases.map((purchase) => ({
      id: purchase.id,
      chainId: purchase.chainId,
      daoAddress: purchase.daoAddress,
      tribTkn: purchase.tribTkn,
      buyer: purchase.buyer,
      payAmt: purchase.payAmt,
      forTkn: purchase.forTkn,
      buyAmt: purchase.buyAmt,
      timestamp: parseInt(purchase.timestamp),
      txHash: purchase.txHash,
      blockNumber: parseInt(purchase.blockNumber),
      logIndex: purchase.logIndex,
    })),
    tap: org.tap
      ? {
          daoAddress: org.tap.daoAddress,
          chainId: org.tap.chainId,
          ops: org.tap.ops,
          tribTkn: org.tap.tribTkn,
          ratePerSec: org.tap.ratePerSec,
          lastClaim: parseInt(org.tap.lastClaim),
          totalClaimed: org.tap.totalClaimed,
          claimCount: org.tap.claimCount,
          createdAt: parseInt(org.tap.createdAt),
          updatedAt: parseInt(org.tap.updatedAt),
        }
      : null,
    lps: org.lps.map((lp) => ({
      daoAddress: lp.daoAddress,
      tribTkn: lp.tribTkn,
      chainId: lp.chainId,
      tribUsed: lp.tribUsed,
      forUsed: lp.forUsed,
      liquidity: lp.liquidity,
      poolId: lp.poolId,
      timestamp: parseInt(lp.timestamp),
      txHash: lp.txHash,
      blockNumber: parseInt(lp.blockNumber),
    })),
  };
}

export function useDAICOOrg(daoAddress: string | undefined) {
  return useQuery({
    queryKey: ["daico-org", daoAddress],
    queryFn: () => fetchDAICOOrg(daoAddress!),
    enabled: !!daoAddress,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });
}
